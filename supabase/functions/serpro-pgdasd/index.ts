import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { criarSerpro, onlyDigits } from "../_shared/serpro-core.ts";
import { lerIndicePgdasd, pega } from "../_shared/pgdasd-indice.ts";

// ---------------------------------------------------------------------------
// PGDAS-D e DAS (Serpro Integra Contador, Simples Nacional) — F4 Onda 2, passo 2, 30/09/2026. Só leitura + emissão de DAS.
//
// Ações (sempre UM cliente por vez, por clique):
//   consultar    { contact_id, ano, force? }          CONSDECLARACAO13 (Consultar): índice do ano-calendário inteiro (12 meses numa
//                                                    chamada): declarações transmitidas, DAS emitidos e se estão pagos. Ausência num
//                                                    ano consultado = não transmitida.
//   documentos   { contact_id, periodo: "AAAA-MM", force? }  CONSULTIMADECREC14 (Consultar): PDFs do recibo e da declaração da última
//                                                    transmissão do mês (e da MAED, se houve atraso), guardados no bucket privado.
//   extrato      { das_id }                          CONSEXTRATO16 (Consultar): PDF do extrato do DAS, guardado.
//   gerar_das    { contact_id, periodo, confirmar_emissao: true, dataConsolidacao?, novo? }  GERARDAS12 (Emitir): gera o DAS do mês.
//                                                    Só com confirmação explícita; se já há DAS gerado aqui e ainda no prazo, devolve o
//                                                    arquivo guardado em vez de emitir outro.
//   link         { tipo, id }                        link assinado (10 min) de um PDF já guardado (sem chamada ao Serpro).
//   publicar     { tabela: "das" | "declaracao", id, visivel_portal }
//
// Só clientes com status "Ativo". Filial é recusada: o PGDAS-D é da matriz. Procuração: 00146 (PGDAS-D).
// Transmitir declaração (TRANSDECLARACAO11) NÃO existe aqui: escrita na Receita é fase final.
// ---------------------------------------------------------------------------

const COMPANY_ID = "5cd08fcd-c095-4f08-b3a8-c02b9bf1034e";
const STATUS_MONITORADO = "Ativo";
const RECENTE_MIN = 15;
const BUCKET = "serpro-pgdasd";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const { serpro } = criarSerpro(supabase, COMPANY_ID);

const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const anoBR = () => Number(hojeBR().slice(0, 4));
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const periodoAAAAMM = (p: unknown): string | null => (/^\d{4}-\d{2}$/.test(String(p ?? "")) ? String(p).replace("-", "") : null);
const msgErro = (r: { resposta: any }) => r.resposta?.mensagens?.[0]?.texto ?? r.resposta?.error ?? "Falha na consulta ao Serpro";
const codigoErro = (r: { resposta: any }) => String(r.resposta?.mensagens?.[0]?.codigo ?? "");

async function carregarCliente(contactId: string) {
  const { data: c } = await supabase.from("contacts").select("id,name,document,status_cliente").eq("id", contactId).eq("company_id", COMPANY_ID).maybeSingle();
  if (!c) return { resp: json({ error: "Cliente não encontrado" }, 404) };
  if (c.status_cliente !== STATUS_MONITORADO) {
    return { resp: json({ ok: false, foraDoMonitoramento: true, error: `Cliente fora do monitoramento (status: ${c.status_cliente ?? "sem status"}). O Serpro só é consultado para clientes com status "${STATUS_MONITORADO}".` }) };
  }
  const cnpj = onlyDigits(c.document);
  if (cnpj.length !== 14) return { resp: json({ error: "Cliente sem CNPJ válido" }, 400) };
  if (cnpj.slice(8, 12) !== "0001") return { resp: json({ ok: false, filial: true, error: "Este CNPJ é de filial. O PGDAS-D é transmitido pela matriz: consulte o CNPJ da matriz." }) };
  return { contato: c, cnpj };
}

function bytesDeBase64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const ehPdf = (b: Uint8Array) => b.length > 100 && String.fromCharCode(...b.slice(0, 4)) === "%PDF";

/** Guarda um PDF (base64) no bucket privado. Devolve o caminho ou null se o arquivo não for um PDF válido. */
async function guardarPdf(path: string, b64: unknown): Promise<string | null> {
  if (typeof b64 !== "string" || !b64) return null;
  let bytes: Uint8Array;
  try { bytes = bytesDeBase64(b64); } catch { return null; }
  if (!ehPdf(bytes)) return null;
  const up = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
  return up.error ? null : path;
}

async function assinar(path: string, nome: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600, { download: nome });
  return error || !data?.signedUrl ? null : data.signedUrl;
}

// ---------- ações ----------
async function consultar(payload: any, uid: string) {
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const ano = Number(payload.ano);
  if (!Number.isInteger(ano) || ano < 2018 || ano > anoBR()) return json({ error: "Ano inválido" }, 400);

  if (!payload.force) {
    const { data: ja } = await supabase.from("serpro_pgdasd_consultas").select("consultado_em").eq("contact_id", c.contato!.id).eq("ano", ano).maybeSingle();
    if (ja?.consultado_em && Date.now() - Date.parse(ja.consultado_em) < RECENTE_MIN * 60_000) return json({ ok: true, recente: true, consultado_em: ja.consultado_em });
  }

  const r = await serpro({
    tipo: "Consultar", idSistema: "PGDASD", idServico: "CONSDECLARACAO13",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: JSON.stringify({ anoCalendario: String(ano) }),
    uid, contactId: c.contato!.id, origem: "manual",
    finalidade: `Consulta do índice de declarações e DAS do PGDAS-D (ano ${ano}) acionada por usuário para acompanhamento fiscal do cliente`,
  });
  if (r.status === 403) return json({ ok: false, semProcuracao: true, status: 403, error: "Sem procuração eletrônica para o PGDAS-D deste cliente" });
  // "Não há declaração transmitida" (MSG_ISN_005 / 027) não é falha: o ano foi consultado e não tem nada.
  const semDeclaracao = r.status !== 200 && /MSG_ISN_0(05|27)/.test(codigoErro(r));
  if (r.status !== 200 && !semDeclaracao) return json({ ok: false, status: r.status, error: msgErro(r) });

  const { declaracoes, das } = semDeclaracao ? { declaracoes: [], das: [] } : lerIndicePgdasd(r.resposta?.dados);
  const agora = new Date().toISOString();
  const base = { company_id: COMPANY_ID, contact_id: c.contato!.id, sincronizado_em: agora };

  let novasDecl = 0, novosDas = 0;
  if (declaracoes.length) {
    const { data: ex } = await supabase.from("serpro_pgdasd_declaracoes").select("numero_declaracao").eq("contact_id", c.contato!.id).in("numero_declaracao", declaracoes.map((d) => d.numero_declaracao));
    const ja = new Set((ex ?? []).map((e: { numero_declaracao: string }) => e.numero_declaracao));
    novasDecl = declaracoes.filter((d) => !ja.has(d.numero_declaracao)).length;
    const { error } = await supabase.from("serpro_pgdasd_declaracoes").upsert(
      declaracoes.map((d) => ({ ...base, periodo_apuracao: d.periodo, numero_declaracao: d.numero_declaracao, tipo: d.tipo, transmitida_em: d.transmitida_em, malha: d.malha })),
      { onConflict: "contact_id,numero_declaracao" });
    if (error) return json({ ok: false, error: `Consulta feita, mas não foi possível gravar: ${error.message}` }, 500);
  }
  if (das.length) {
    const { data: ex } = await supabase.from("serpro_pgdasd_das").select("numero_das").eq("contact_id", c.contato!.id).in("numero_das", das.map((d) => d.numero_das));
    const ja = new Set((ex ?? []).map((e: { numero_das: string }) => e.numero_das));
    novosDas = das.filter((d) => !ja.has(d.numero_das)).length;
    // Só as colunas do índice: o PDF e os valores de um DAS gerado aqui não são apagados.
    const { error } = await supabase.from("serpro_pgdasd_das").upsert(
      das.map((d) => ({ ...base, periodo_apuracao: d.periodo, numero_das: d.numero_das, tipo_operacao: d.tipo_operacao, emitido_em: d.emitido_em, das_pago: d.das_pago })),
      { onConflict: "contact_id,numero_das" });
    if (error) return json({ ok: false, error: `Consulta feita, mas não foi possível gravar: ${error.message}` }, 500);
  }
  await supabase.from("serpro_pgdasd_consultas").upsert(
    { contact_id: c.contato!.id, company_id: COMPANY_ID, ano, consultado_em: agora, consultado_por: uid, declaracoes: declaracoes.length, das: das.length },
    { onConflict: "contact_id,ano" });
  return json({ ok: true, declaracoes: declaracoes.length, das: das.length, novas: novasDecl + novosDas, sem_declaracao: semDeclaracao });
}

async function documentos(payload: any, uid: string) {
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const aaaamm = periodoAAAAMM(payload.periodo);
  if (!aaaamm) return json({ error: "Informe o período (AAAA-MM)" }, 400);
  const periodo = `${aaaamm.slice(0, 4)}-${aaaamm.slice(4, 6)}-01`;

  const { data: vigente } = await supabase.from("serpro_pgdasd_declaracoes").select("id,numero_declaracao,recibo_path,declaracao_path")
    .eq("contact_id", c.contato!.id).eq("periodo_apuracao", periodo).order("transmitida_em", { ascending: false }).limit(1).maybeSingle();
  if (!vigente) return json({ ok: false, error: "Não há declaração deste período na lista. Atualize o ano primeiro." });
  // Já baixado: não chama o Serpro de novo (cada chamada é cobrada).
  if (vigente.recibo_path && vigente.declaracao_path && !payload.force) return json({ ok: true, jaBaixado: true, id: vigente.id });

  const r = await serpro({
    tipo: "Consultar", idSistema: "PGDASD", idServico: "CONSULTIMADECREC14",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: JSON.stringify({ periodoApuracao: aaaamm }),
    uid, contactId: c.contato!.id, origem: "manual",
    finalidade: `Consulta da declaração e do recibo do PGDAS-D (PA ${aaaamm.slice(4)}/${aaaamm.slice(0, 4)}) acionada por usuário para o cliente`,
  });
  if (r.status === 403) return json({ ok: false, semProcuracao: true, error: "Sem procuração eletrônica para o PGDAS-D deste cliente" });
  if (r.status !== 200) return json({ ok: false, status: r.status, error: msgErro(r) });

  const d = r.resposta?.dados;
  const numero = String(pega(d, "numeroDeclaracao") ?? "");
  if (!numero) return json({ ok: false, error: "O Serpro não devolveu a declaração deste período" }, 502);
  const { data: alvo } = await supabase.from("serpro_pgdasd_declaracoes").select("id").eq("contact_id", c.contato!.id).eq("numero_declaracao", numero).maybeSingle();
  if (!alvo) return json({ ok: false, error: `A Receita devolveu a declaração nº ${numero}, que ainda não está na lista. Atualize o ano e tente de novo.` });

  const pasta = `${COMPANY_ID}/${c.contato!.id}`;
  const recibo = await guardarPdf(`${pasta}/recibo-${numero}.pdf`, pega(pega(d, "recibo"), "pdf"));
  const decl = await guardarPdf(`${pasta}/declaracao-${numero}.pdf`, pega(pega(d, "declaracao"), "pdf"));
  if (!recibo && !decl) return json({ ok: false, error: "O Serpro não devolveu os PDFs da declaração" }, 502);
  const maed = pega(d, "maed");
  const maedNotif = await guardarPdf(`${pasta}/maed-notificacao-${numero}.pdf`, pega(maed, "pdfNotificacao"));
  const maedDarf = await guardarPdf(`${pasta}/maed-darf-${numero}.pdf`, pega(maed, "pdfDarf"));
  await supabase.from("serpro_pgdasd_declaracoes").update({
    recibo_path: recibo, declaracao_path: decl, maed_notificacao_path: maedNotif, maed_darf_path: maedDarf, documentos_em: new Date().toISOString(),
  }).eq("id", alvo.id);
  return json({ ok: true, id: alvo.id, com_maed: !!(maedNotif || maedDarf) });
}

async function extrato(payload: any, uid: string) {
  const { data: das } = await supabase.from("serpro_pgdasd_das").select("id,contact_id,numero_das,extrato_path").eq("id", String(payload.das_id ?? "")).eq("company_id", COMPANY_ID).maybeSingle();
  if (!das) return json({ error: "DAS não encontrado" }, 404);
  if (das.extrato_path) return json({ ok: true, jaBaixado: true, id: das.id });
  const c = await carregarCliente(das.contact_id);
  if (c.resp) return c.resp;

  const r = await serpro({
    tipo: "Consultar", idSistema: "PGDASD", idServico: "CONSEXTRATO16",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: JSON.stringify({ numeroDas: das.numero_das }),
    uid, contactId: c.contato!.id, origem: "manual",
    finalidade: "Consulta do extrato do DAS (PGDAS-D) acionada por usuário para o cliente",
  });
  if (r.status === 403) return json({ ok: false, semProcuracao: true, error: "Sem procuração eletrônica para o PGDAS-D deste cliente" });
  if (r.status !== 200) return json({ ok: false, status: r.status, error: msgErro(r) });
  const path = await guardarPdf(`${COMPANY_ID}/${c.contato!.id}/extrato-${das.numero_das}.pdf`, pega(pega(r.resposta?.dados, "extrato"), "pdf"));
  if (!path) return json({ ok: false, error: "O Serpro não devolveu o PDF do extrato" }, 502);
  await supabase.from("serpro_pgdasd_das").update({ extrato_path: path }).eq("id", das.id);
  return json({ ok: true, id: das.id });
}

async function gerarDas(payload: any, uid: string) {
  // Gerar DAS registra uma emissão na Receita: só com confirmação explícita de quem clicou.
  if (payload.confirmar_emissao !== true) return json({ error: "Emissão não confirmada. Gerar o DAS registra uma emissão na Receita e precisa de confirmação explícita." }, 400);
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const aaaamm = periodoAAAAMM(payload.periodo);
  if (!aaaamm) return json({ error: "Informe o período (AAAA-MM)" }, 400);
  const periodo = `${aaaamm.slice(0, 4)}-${aaaamm.slice(4, 6)}-01`;

  // Já existe DAS gerado aqui para o período e ainda no prazo: entrega o arquivo guardado (não emite outro).
  if (!payload.novo) {
    const { data: ja } = await supabase.from("serpro_pgdasd_das").select("id,numero_das,vencimento,limite_acolhimento,valor_total,das_path")
      .eq("contact_id", c.contato!.id).eq("periodo_apuracao", periodo).not("das_path", "is", null).order("emitido_em", { ascending: false }).limit(1).maybeSingle();
    // O documento serve enquanto puder ser pago: vale a data limite de acolhimento (DAS vencido é consolidado até ela); sem ela, o vencimento.
    const validoAte = ja?.limite_acolhimento ?? ja?.vencimento ?? null;
    if (ja?.das_path && (!validoAte || validoAte >= hojeBR())) {
      const url = await assinar(ja.das_path, `das-${ja.numero_das}.pdf`);
      if (url) return json({ ok: true, jaGerado: true, url, numero_das: ja.numero_das, vencimento: ja.vencimento, valor_total: ja.valor_total, id: ja.id });
    }
  }

  const dados: Record<string, string> = { periodoApuracao: aaaamm };
  if (/^\d{8}$/.test(String(payload.dataConsolidacao ?? ""))) dados.dataConsolidacao = String(payload.dataConsolidacao);
  const r = await serpro({
    tipo: "Emitir", idSistema: "PGDASD", idServico: "GERARDAS12",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: JSON.stringify(dados),
    uid, contactId: c.contato!.id, origem: "manual",
    finalidade: `Emissão do DAS do PGDAS-D (PA ${aaaamm.slice(4)}/${aaaamm.slice(0, 4)}) confirmada por usuário para o cliente`,
  });
  if (r.status === 403) return json({ ok: false, semProcuracao: true, error: "Sem procuração eletrônica para o PGDAS-D deste cliente" });
  if (r.status !== 200) return json({ ok: false, status: r.status, error: msgErro(r) });

  const bruto = r.resposta?.dados;
  const das = Array.isArray(bruto) ? bruto[0] : bruto;
  // O trial devolve "detalhamentoDas" (a documentação diz "detalhamento"): aceita os dois.
  const det = pega(das, "detalhamentoDas", "detalhamento");
  const numero = String(pega(det, "numeroDocumento") ?? "");
  if (!numero) return json({ ok: false, error: "O Serpro não devolveu os dados do DAS" }, 502);
  const path = await guardarPdf(`${COMPANY_ID}/${c.contato!.id}/das-${numero}.pdf`, pega(das, "pdf"));
  if (!path) return json({ ok: false, error: "O DAS foi gerado, mas o PDF não veio em formato válido" }, 502);

  const venc = String(pega(det, "dataVencimento") ?? "");
  const limite = String(pega(det, "dataLimiteAcolhimento") ?? "");
  const dataDe = (v: string) => (/^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null);
  const val = pega(det, "valores");
  const campos = {
    tipo_operacao: "Geração de DAS", emitido_em: new Date().toISOString(),
    vencimento: dataDe(venc), limite_acolhimento: dataDe(limite),
    valor_principal: num(pega(val, "principal")), valor_multa: num(pega(val, "multa")), valor_juros: num(pega(val, "juros")), valor_total: num(pega(val, "total")),
    composicao: Array.isArray(pega(det, "composicao")) ? pega(det, "composicao") : null, das_path: path, sincronizado_em: new Date().toISOString(),
  };
  const { data: existente } = await supabase.from("serpro_pgdasd_das").select("id").eq("contact_id", c.contato!.id).eq("numero_das", numero).maybeSingle();
  let id: string | null = existente?.id ?? null;
  if (existente) {
    await supabase.from("serpro_pgdasd_das").update(campos).eq("id", existente.id);
  } else {
    const { data: novo } = await supabase.from("serpro_pgdasd_das")
      .insert({ company_id: COMPANY_ID, contact_id: c.contato!.id, periodo_apuracao: periodo, numero_das: numero, das_pago: false, ...campos }).select("id").maybeSingle();
    id = novo?.id ?? null;
  }
  const url = await assinar(path, `das-${numero}.pdf`);
  return json({ ok: true, url, numero_das: numero, vencimento: campos.vencimento, valor_total: campos.valor_total, id });
}

const PASTA_TIPO: Record<string, { tabela: "serpro_pgdasd_declaracoes" | "serpro_pgdasd_das"; coluna: string; prefixo: string }> = {
  declaracao: { tabela: "serpro_pgdasd_declaracoes", coluna: "declaracao_path", prefixo: "declaracao" },
  recibo: { tabela: "serpro_pgdasd_declaracoes", coluna: "recibo_path", prefixo: "recibo" },
  maed_notificacao: { tabela: "serpro_pgdasd_declaracoes", coluna: "maed_notificacao_path", prefixo: "maed-notificacao" },
  maed_darf: { tabela: "serpro_pgdasd_declaracoes", coluna: "maed_darf_path", prefixo: "maed-darf" },
  das: { tabela: "serpro_pgdasd_das", coluna: "das_path", prefixo: "das" },
  extrato: { tabela: "serpro_pgdasd_das", coluna: "extrato_path", prefixo: "extrato" },
};

async function link(payload: any) {
  const t = PASTA_TIPO[String(payload.tipo ?? "")];
  if (!t) return json({ error: "Tipo de arquivo inválido" }, 400);
  const { data } = await supabase.from(t.tabela).select("*").eq("id", String(payload.id ?? "")).eq("company_id", COMPANY_ID).maybeSingle();
  const linha = (data ?? {}) as Record<string, string | null>;
  const path = linha[t.coluna];
  if (!path) return json({ ok: false, error: "Arquivo ainda não baixado" });
  const nome = `${t.prefixo}-${linha.numero_declaracao ?? linha.numero_das ?? ""}.pdf`;
  const url = await assinar(path, nome);
  return url ? json({ ok: true, url }) : json({ ok: false, error: "Não foi possível gerar o link" }, 500);
}

async function publicar(payload: any) {
  if (typeof payload.visivel_portal !== "boolean") return json({ error: "visivel_portal inválido" }, 400);
  const tabela = payload.tabela === "das" ? "serpro_pgdasd_das" : payload.tabela === "declaracao" ? "serpro_pgdasd_declaracoes" : null;
  if (!tabela) return json({ error: "tabela inválida" }, 400);
  const { error } = await supabase.from(tabela).update({ visivel_portal: payload.visivel_portal }).eq("id", String(payload.id ?? "")).eq("company_id", COMPANY_ID);
  return error ? json({ error: error.message }, 500) : json({ ok: true });
}

// ---------- entrada ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const payload = await req.json().catch(() => ({}));
  const { data: userData } = await supabase.auth.getUser(bearer);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "Não autenticado" }, 401);
  const { data: perfil } = await supabase.from("profiles").select("role,is_super_admin,company_id").eq("user_id", uid).maybeSingle();
  const admin = perfil?.is_super_admin === true || (perfil?.role === "admin" && perfil?.company_id === COMPANY_ID);
  const equipe = admin || (perfil?.role === "colaborador" && perfil?.company_id === COMPANY_ID);
  if (!equipe) return json({ error: "Sem permissão" }, 403);

  switch (payload.action) {
    case "consultar": return await consultar(payload, uid);
    case "documentos": return await documentos(payload, uid);
    case "extrato": return await extrato(payload, uid);
    case "gerar_das": return await gerarDas(payload, uid);
    case "link": return await link(payload);
    case "publicar": return await publicar(payload);
    default: return json({ error: "action inválida (consultar | documentos | extrato | gerar_das | link | publicar)" }, 400);
  }
});
