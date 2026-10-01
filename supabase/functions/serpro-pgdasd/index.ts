import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { criarSerpro, onlyDigits, sleep } from "../_shared/serpro-core.ts";
import { lerIndicePgdasd, pega } from "../_shared/pgdasd-indice.ts";
import { lerDeclaracaoPgdasd, type DeclaracaoPgdasd } from "../_shared/pgdasd-extrair.ts";
import { avisarConclusoes, concluirTarefaDas, concluirTarefaFiscal } from "../_shared/tarefas-fiscais.ts";

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
//   (conclusão automática) consultar conclui a tarefa fiscal "DAS - Simples Nacional" dos períodos com DAS pago; ler_faturamento conclui a de
//                                                    declaração zerada. Transmitir sozinho não conclui. Ver _shared/tarefas-fiscais.ts.
//   ler_faturamento { contact_id, periodo }          Passo 3: lê o PDF da declaração do mês (regra fixa de texto, sem IA) e grava em
//                                                    serpro_faturamento (receita do mês, RBT12, RBA, limite, sublimite, fator r, regime).
//                                                    Se o PDF já está guardado, não chama o Serpro (custo zero); se não, baixa antes.
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
const { serpro, MODE, CONTRATANTE_NI, AUTOR_NI } = criarSerpro(supabase, COMPANY_ID);
const CNPJS_DA_CA = new Set([CONTRATANTE_NI, AUTOR_NI]);
const CODIGOS_PROCURACAO = ["00146", "00006", "00004", "00060", "00002", "00103", "00050", "00051"]; // mesmos do mapa de procurações

const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const anoBR = () => Number(hojeBR().slice(0, 4));
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const periodoAAAAMM = (p: unknown): string | null => (/^\d{4}-\d{2}$/.test(String(p ?? "")) ? String(p).replace("-", "") : null);
const msgErro = (r: { resposta: any }) => r.resposta?.mensagens?.[0]?.texto ?? r.resposta?.error ?? "Falha na consulta ao Serpro";
const codigoErro = (r: { resposta: any }) => String(r.resposta?.mensagens?.[0]?.codigo ?? "");

type Resp = { corpo: Record<string, unknown>; http: number };
const resp = (corpo: Record<string, unknown>, http = 200): Resp => ({ corpo, http });

type ContatoPgdasd = { id: string; name: string | null; document: string | null; status_cliente: string | null };

/** Confere se o cliente pode ser consultado: existe, está Ativo, tem CNPJ de 14 dígitos e é matriz (o PGDAS-D é da matriz). */
async function validarCliente(contactId: string): Promise<{ erro?: Resp; contato?: ContatoPgdasd; cnpj?: string }> {
  const { data: c } = await supabase.from("contacts").select("id,name,document,status_cliente").eq("id", contactId).eq("company_id", COMPANY_ID).maybeSingle();
  if (!c) return { erro: resp({ error: "Cliente não encontrado" }, 404) };
  if (c.status_cliente !== STATUS_MONITORADO) {
    return { erro: resp({ ok: false, foraDoMonitoramento: true, error: `Cliente fora do monitoramento (status: ${c.status_cliente ?? "sem status"}). O Serpro só é consultado para clientes com status "${STATUS_MONITORADO}".` }) };
  }
  const cnpj = onlyDigits(c.document);
  if (cnpj.length !== 14) return { erro: resp({ error: "Cliente sem CNPJ válido" }, 400) };
  if (cnpj.slice(8, 12) !== "0001") return { erro: resp({ ok: false, filial: true, error: "Este CNPJ é de filial. O PGDAS-D é transmitido pela matriz: consulte o CNPJ da matriz." }) };
  return { contato: c as ContatoPgdasd, cnpj };
}

async function carregarCliente(contactId: string) {
  const v = await validarCliente(contactId);
  if (v.erro) return { resp: json(v.erro.corpo, v.erro.http) };
  return { contato: v.contato!, cnpj: v.cnpj! };
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
/**
 * Consulta o ANO de UM cliente (CONSDECLARACAO13, 1 chamada cobrada), grava declarações e DAS e conclui as tarefas "DAS - Simples Nacional"
 * dos períodos com declaração transmitida. Quem chama decide o aviso (um por consulta ou um por lote): `tarefas_concluidas` vem no resultado.
 */
async function consultarCliente(contactId: string, ano: number, uid: string | null, origem: "manual" | "cron", force: boolean, finalidade: string): Promise<Resp & { nome?: string }> {
  const v = await validarCliente(contactId);
  if (v.erro) return v.erro;
  const contato = v.contato!;
  const cnpj = v.cnpj!;

  if (!force) {
    const { data: ja } = await supabase.from("serpro_pgdasd_consultas").select("consultado_em").eq("contact_id", contato.id).eq("ano", ano).maybeSingle();
    if (ja?.consultado_em && Date.now() - Date.parse(ja.consultado_em) < RECENTE_MIN * 60_000) return resp({ ok: true, recente: true, consultado_em: ja.consultado_em });
  }

  const r = await serpro({
    tipo: "Consultar", idSistema: "PGDASD", idServico: "CONSDECLARACAO13",
    contribuinte: { numero: cnpj, tipo: 2 }, dados: JSON.stringify({ anoCalendario: String(ano) }),
    uid, contactId: contato.id, origem, finalidade,
  });
  if (r.status === 403) return resp({ ok: false, semProcuracao: true, status: 403, error: "Sem procuração eletrônica para o PGDAS-D deste cliente" });
  // "Não há declaração transmitida" (MSG_ISN_005 / 027) não é falha: o ano foi consultado e não tem nada.
  const semDeclaracao = r.status !== 200 && /MSG_ISN_0(05|27)/.test(codigoErro(r));
  if (r.status !== 200 && !semDeclaracao) return resp({ ok: false, status: r.status, error: msgErro(r) });

  const { declaracoes, das } = semDeclaracao ? { declaracoes: [], das: [] } : lerIndicePgdasd(r.resposta?.dados);
  const agora = new Date().toISOString();
  const base = { company_id: COMPANY_ID, contact_id: contato.id, sincronizado_em: agora };

  let novasDecl = 0, novosDas = 0;
  if (declaracoes.length) {
    const { data: ex } = await supabase.from("serpro_pgdasd_declaracoes").select("numero_declaracao").eq("contact_id", contato.id).in("numero_declaracao", declaracoes.map((d) => d.numero_declaracao));
    const ja = new Set((ex ?? []).map((e: { numero_declaracao: string }) => e.numero_declaracao));
    novasDecl = declaracoes.filter((d) => !ja.has(d.numero_declaracao)).length;
    const { error } = await supabase.from("serpro_pgdasd_declaracoes").upsert(
      declaracoes.map((d) => ({ ...base, periodo_apuracao: d.periodo, numero_declaracao: d.numero_declaracao, tipo: d.tipo, transmitida_em: d.transmitida_em, malha: d.malha })),
      { onConflict: "contact_id,numero_declaracao" });
    if (error) return resp({ ok: false, error: `Consulta feita, mas não foi possível gravar: ${error.message}` }, 500);
  }
  if (das.length) {
    const { data: ex } = await supabase.from("serpro_pgdasd_das").select("numero_das").eq("contact_id", contato.id).in("numero_das", das.map((d) => d.numero_das));
    const ja = new Set((ex ?? []).map((e: { numero_das: string }) => e.numero_das));
    novosDas = das.filter((d) => !ja.has(d.numero_das)).length;
    // Só as colunas do índice: o PDF e os valores de um DAS gerado aqui não são apagados.
    const { error } = await supabase.from("serpro_pgdasd_das").upsert(
      das.map((d) => ({ ...base, periodo_apuracao: d.periodo, numero_das: d.numero_das, tipo_operacao: d.tipo_operacao, emitido_em: d.emitido_em, das_pago: d.das_pago })),
      { onConflict: "contact_id,numero_das" });
    if (error) return resp({ ok: false, error: `Consulta feita, mas não foi possível gravar: ${error.message}` }, 500);
  }
  await supabase.from("serpro_pgdasd_consultas").upsert(
    { contact_id: contato.id, company_id: COMPANY_ID, ano, consultado_em: agora, consultado_por: uid, declaracoes: declaracoes.length, das: das.length },
    { onConflict: "contact_id,ano" });
  // O "pago" do índice responde ao aviso "pagamento novo" do sensor de Pagamentos: a consulta apaga o aviso (só esta coluna).
  await supabase.from("serpro_pagamentos_sensor").upsert({ contact_id: contato.id, company_id: COMPANY_ID, ultima_consulta_em: agora }, { onConflict: "contact_id" });

  // Declaração TRANSMITIDA → conclui a tarefa fiscal "DAS - Simples Nacional" do período (decisão de Gabriel, 01/10/2026).
  // Vale a primeira transmissão do período e a data de entrega é a da transmissão. Tarefa já concluída pela equipe é ignorada.
  const primeira = new Map<string, (typeof declaracoes)[number]>();
  for (const d of declaracoes) {
    const a = primeira.get(d.periodo);
    if (!a || (d.transmitida_em ?? "9999") < (a.transmitida_em ?? "9999")) primeira.set(d.periodo, d);
  }
  let tarefasConcluidas = 0;
  for (const [periodo, d] of primeira) {
    tarefasConcluidas += await concluirTarefaFiscal(supabase, COMPANY_ID, contato.id, {
      obrigacao: "DAS - Simples Nacional", periodo, tipo: "transmitted", protocolo: d.numero_declaracao,
      detalhe: `PGDAS-D nº ${d.numero_declaracao} transmitido${d.transmitida_em ? ` em ${d.transmitida_em.slice(0, 10).split("-").reverse().join("/")}` : ""} (informação da Receita)`,
      dataEntrega: d.transmitida_em ? d.transmitida_em.slice(0, 10) : undefined,
    });
  }
  return { ...resp({ ok: true, declaracoes: declaracoes.length, das: das.length, novas: novasDecl + novosDas, sem_declaracao: semDeclaracao, tarefas_concluidas: tarefasConcluidas }), nome: contato.name ?? "Cliente" };
}

async function consultar(payload: any, uid: string) {
  const ano = Number(payload.ano);
  if (!Number.isInteger(ano) || ano < 2018 || ano > anoBR()) return json({ error: "Ano inválido" }, 400);
  const r = await consultarCliente(String(payload.contact_id ?? ""), ano, uid, "manual", !!payload.force,
    `Consulta do índice de declarações e DAS do PGDAS-D (ano ${ano}) acionada por usuário para acompanhamento fiscal do cliente`);
  if (r.nome && Number(r.corpo.tarefas_concluidas) > 0) await avisarConclusoes(supabase, COMPANY_ID, r.nome, Number(r.corpo.tarefas_concluidas));
  return json(r.corpo, r.http);
}

/**
 * Passe ÚNICO na carteira do Simples (aprovado por Gabriel em 01/10/2026; não é rotina agendada): consulta o ano de cada cliente que ainda não
 * foi consultado nas últimas 24 h. Guardas: só Ativo, matriz, CNPJ válido, sem os CNPJs da CA; cliente mapeado sem nenhuma procuração ativa nem é tentado
 * (a tentativa seria cobrada e voltaria 403); no máximo `limite` clientes por chamada (padrão 40) e 100 s de relógio; para depois de 5 falhas seguidas.
 * Pode ser chamada de novo: quem já foi consultado é pulado. Um aviso-resumo no fim.
 */
async function consultarCarteira(payload: any, uid: string | null) {
  const ano = Number(payload.ano) || anoBR();
  if (!Number.isInteger(ano) || ano < 2018 || ano > anoBR()) return json({ error: "Ano inválido" }, 400);
  const limite = Math.max(1, Math.min(Number(payload.limite) || 40, 60));
  const inicio = Date.now();

  const { data: contatos } = await supabase.from("contacts").select("id,name,display_name,document")
    .eq("company_id", COMPANY_ID).eq("is_active", true).eq("status_cliente", STATUS_MONITORADO).eq("tax_regime", "simples_nacional").order("name");
  const { data: consultas } = await supabase.from("serpro_pgdasd_consultas").select("contact_id,consultado_em").eq("company_id", COMPANY_ID).eq("ano", ano).limit(1000);
  const recentes = new Set((consultas ?? []).filter((c: any) => Date.now() - Date.parse(c.consultado_em) < 24 * 3600_000).map((c: any) => c.contact_id));
  const { data: procs } = await supabase.from("serpro_procuracoes").select("contact_id,status,data_fim")
    .eq("company_id", COMPANY_ID).eq("fonte", "integra_procuracoes").in("codigo_procuracao", CODIGOS_PROCURACAO).limit(5000);
  const hoje = hojeBR();
  const comMapa = new Map<string, boolean>();
  for (const r of (procs ?? []) as { contact_id: string; status: string; data_fim: string | null }[]) {
    const ativa = r.status === "ativa" && (!r.data_fim || r.data_fim >= hoje);
    comMapa.set(r.contact_id, (comMapa.get(r.contact_id) ?? false) || ativa);
  }

  const elegiveis = (contatos ?? []).filter((c: any) => {
    const cnpj = onlyDigits(c.document);
    return cnpj.length === 14 && cnpj.slice(8, 12) === "0001" && !CNPJS_DA_CA.has(cnpj);
  });
  const semProcuracao = elegiveis.filter((c: any) => comMapa.has(c.id) && comMapa.get(c.id) === false);
  const pendentes = elegiveis.filter((c: any) => !recentes.has(c.id) && !(comMapa.has(c.id) && comMapa.get(c.id) === false));

  const resumo = { consultados: 0, transmitidas: 0, sem_declaracao_no_ano: 0, erros: 0, sem_procuracao_pulados: semProcuracao.length, ja_consultados: elegiveis.length - pendentes.length - semProcuracao.length, tarefas_concluidas: 0 };
  const falhas: string[] = [];
  let seguidas = 0, processados = 0;
  for (const c of pendentes) {
    if (processados >= limite || Date.now() - inicio > 100_000 || seguidas >= 5) break;
    processados++;
    const r = await consultarCliente(c.id, ano, uid, "manual", true,
      `Consulta do índice do PGDAS-D (ano ${ano}) no primeiro passe da carteira do Simples, aprovado por Gabriel em 01/10/2026, para acompanhamento fiscal`);
    if (r.corpo.ok === true) {
      seguidas = 0;
      resumo.consultados++;
      resumo.tarefas_concluidas += Number(r.corpo.tarefas_concluidas ?? 0);
      if (r.corpo.sem_declaracao === true || Number(r.corpo.declaracoes ?? 0) === 0) resumo.sem_declaracao_no_ano++; else resumo.transmitidas++;
    } else {
      seguidas++;
      resumo.erros++;
      if (falhas.length < 10) falhas.push(`${c.display_name || c.name}: ${String(r.corpo.error ?? r.corpo.status ?? "falha")}`);
    }
    await sleep(150);
  }
  const restantes = pendentes.length - processados;
  if (resumo.tarefas_concluidas > 0) await avisarConclusoes(supabase, COMPANY_ID, `${resumo.consultados} ${resumo.consultados === 1 ? "cliente" : "clientes"} do Simples (consulta da carteira)`, resumo.tarefas_concluidas);
  return json({ ok: true, ano, ...resumo, restantes, parou_por_falhas: seguidas >= 5, falhas, segundos: Math.round((Date.now() - inicio) / 1000) });
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

// ---------- faturamento (passo 3) ----------
/** Texto do PDF guardado. `unpdf` é carregado só aqui: se a biblioteca falhar, o resto da função continua funcionando. */
async function textoDoPdf(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error("PDF não encontrado no armazenamento");
  const bytes = new Uint8Array(await data.arrayBuffer());
  const { extractText, getDocumentProxy } = await import("npm:unpdf@1.8.1");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

interface DeclaracaoBase { id: string; contact_id: string; numero_declaracao: string; periodo_apuracao: string; tipo: string; transmitida_em: string | null; declaracao_path: string | null }

async function declaracaoDoPeriodo(contactId: string, periodo: string): Promise<DeclaracaoBase | null> {
  const { data } = await supabase.from("serpro_pgdasd_declaracoes").select("id,contact_id,numero_declaracao,periodo_apuracao,tipo,transmitida_em,declaracao_path")
    .eq("contact_id", contactId).eq("periodo_apuracao", periodo).order("transmitida_em", { ascending: false }).limit(1).maybeSingle();
  return (data as DeclaracaoBase | null) ?? null;
}

/** Lê o PDF da declaração, confere com o que o índice disse e grava. Nunca inventa número: o que não fecha vira aviso e `confiavel` = false. */
async function lerEGravar(decl: DeclaracaoBase, cnpj: string) {
  const d: DeclaracaoPgdasd = lerDeclaracaoPgdasd(await textoDoPdf(decl.declaracao_path!));
  const avisos = [...d.avisos];
  let confiavel = d.confiavel;
  const barra = (texto: string) => { avisos.push(texto); confiavel = false; };
  if (d.numero_declaracao && d.numero_declaracao !== decl.numero_declaracao) barra(`o PDF é da declaração ${d.numero_declaracao}, não da ${decl.numero_declaracao}`);
  if (d.periodo_apuracao && d.periodo_apuracao !== decl.periodo_apuracao.slice(0, 7)) barra(`o PDF é do período ${d.periodo_apuracao}, não de ${decl.periodo_apuracao.slice(0, 7)}`);
  // O trial devolve CNPJ fictício: a conferência do CNPJ só vale em produção.
  if (MODE === "producao" && d.cnpj_matriz && onlyDigits(d.cnpj_matriz) !== cnpj) barra("o CNPJ do PDF não é o do cliente");

  const linha = {
    company_id: COMPANY_ID, contact_id: decl.contact_id, declaracao_id: decl.id,
    periodo_apuracao: decl.periodo_apuracao, numero_declaracao: decl.numero_declaracao,
    tipo: d.tipo ?? (decl.tipo === "retificadora" ? "retificadora" : "original"), transmitida_em: d.transmissao ?? decl.transmitida_em,
    regime_apuracao: d.regime,
    rpa_total: d.rpa?.total ?? null, rbt12_total: d.rbt12?.total ?? null, rba_total: d.rba?.total ?? null, rbaa_total: d.rbaa?.total ?? null,
    limite_total: d.limite?.total ?? null, sublimite: d.sublimite,
    fator_r_aplica: d.fator_r_aplica, fator_r_texto: d.fator_r_texto,
    confiavel, avisos, dados: d, lido_em: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("serpro_faturamento").upsert(linha, { onConflict: "contact_id,numero_declaracao" }).select("id").maybeSingle();
  if (error) throw new Error(`não foi possível gravar a leitura: ${error.message}`);
  // Declaração zerada (receita e débito zero, leitura confiável) → conclui a tarefa fiscal do período como "ZERADO".
  let tarefasConcluidas = 0;
  if (confiavel && d.rpa?.total === 0 && d.debito_declarado?.total === 0) {
    tarefasConcluidas = await concluirTarefaDas(supabase, COMPANY_ID, decl.contact_id, decl.periodo_apuracao, "zerado", `declaração nº ${decl.numero_declaracao} transmitida sem receita e sem débito`);
  }
  return { id: data?.id as string | undefined, confiavel, avisos, tarefasConcluidas };
}

async function lerFaturamento(payload: any, uid: string) {
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const aaaamm = periodoAAAAMM(payload.periodo);
  if (!aaaamm) return json({ error: "Informe o período (AAAA-MM)" }, 400);
  const periodo = `${aaaamm.slice(0, 4)}-${aaaamm.slice(4, 6)}-01`;

  let decl = await declaracaoDoPeriodo(c.contato!.id, periodo);
  if (!decl) return json({ ok: false, error: "Não há declaração deste período na lista. Atualize o ano primeiro." });
  let baixou = false;
  if (!decl.declaracao_path) {
    // PDF ainda não guardado: baixa pela mesma rotina do botão "Declaração (PDF)" (1 consulta ao Serpro, cobrada uma vez).
    const resp = await documentos({ contact_id: c.contato!.id, periodo: payload.periodo }, uid);
    const j = await resp.clone().json().catch(() => null);
    if (!j?.ok) return resp;
    baixou = true;
    decl = await declaracaoDoPeriodo(c.contato!.id, periodo);
    if (!decl?.declaracao_path) return json({ ok: false, error: "O Serpro não devolveu o PDF da declaração" }, 502);
  }
  try {
    const f = await lerEGravar(decl, c.cnpj!);
    await avisarConclusoes(supabase, COMPANY_ID, c.contato!.name ?? "Cliente", f.tarefasConcluidas);
    return json({ ok: true, baixou, id: f.id, confiavel: f.confiavel, avisos: f.avisos, tarefas_concluidas: f.tarefasConcluidas });
  } catch (e) {
    return json({ ok: false, baixou, error: `O PDF está guardado, mas não consegui lê-lo: ${(e as Error).message}` });
  }
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

  // Passe único da carteira por chave de uso único: a chave (guardada só como hash no banco, com validade curta) é criada por quem tem acesso ao banco.
  if (payload.action === "consultar_carteira" && req.headers.get("x-lote-token")) {
    const dados = new TextEncoder().encode(String(req.headers.get("x-lote-token")));
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", dados))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const { data: cfg } = await supabase.from("serpro_config").select("lote_token_hash,lote_token_expira").eq("company_id", COMPANY_ID).maybeSingle();
    if (cfg?.lote_token_hash && cfg.lote_token_hash === hash && cfg.lote_token_expira && Date.parse(cfg.lote_token_expira) > Date.now()) {
      return await consultarCarteira(payload, null);
    }
    return json({ error: "Chave do passe inválida ou vencida" }, 403);
  }

  const { data: userData } = await supabase.auth.getUser(bearer);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "Não autenticado" }, 401);
  const { data: perfil } = await supabase.from("profiles").select("role,is_super_admin,company_id").eq("user_id", uid).maybeSingle();
  const admin = perfil?.is_super_admin === true || (perfil?.role === "admin" && perfil?.company_id === COMPANY_ID);
  const equipe = admin || (perfil?.role === "colaborador" && perfil?.company_id === COMPANY_ID);
  if (!equipe) return json({ error: "Sem permissão" }, 403);

  switch (payload.action) {
    case "consultar": return await consultar(payload, uid);
    case "consultar_carteira":
      if (!admin) return json({ error: "Só administradores consultam a carteira" }, 403);
      return await consultarCarteira(payload, uid);
    case "documentos": return await documentos(payload, uid);
    case "extrato": return await extrato(payload, uid);
    case "gerar_das": return await gerarDas(payload, uid);
    case "ler_faturamento": return await lerFaturamento(payload, uid);
    case "link": return await link(payload);
    case "publicar": return await publicar(payload);
    default: return json({ error: "action inválida (consultar | consultar_carteira | documentos | extrato | gerar_das | ler_faturamento | link | publicar)" }, 400);
  }
});
