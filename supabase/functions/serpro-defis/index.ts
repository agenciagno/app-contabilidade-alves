import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { criarSerpro, onlyDigits } from "../_shared/serpro-core.ts";
import { pega } from "../_shared/pgdasd-indice.ts";
import { lerIndiceDefis } from "../_shared/defis-indice.ts";
import { assinar, guardarPdf } from "../_shared/serpro-arquivos.ts";

// ---------------------------------------------------------------------------
// DEFIS (declaração anual do Simples Nacional, Serpro Integra Contador) — F4 Onda 2, passo 4, 30/09/2026. Só leitura.
//
// Ações (sempre UM cliente por vez, por clique):
//   consultar  { contact_id, force? }          DEFIS.CONSDECLARACAO142 (Consultar): índice de TODAS as DEFIS transmitidas do cliente
//                                              (período não decadente), numa só chamada. Ausência de um ano num cliente consultado = não entregue.
//   documentos { contact_id, ano, force? }     DEFIS.CONSULTIMADECREC143 (Consultar): PDFs da declaração e do recibo da última DEFIS do
//                                              ano-calendário, guardados no bucket privado.
//   link       { tipo: "declaracao" | "recibo", id }   link assinado (10 min) de um PDF já guardado (sem chamada ao Serpro).
//   publicar   { id, visivel_portal }
//
// Só clientes com status "Ativo". Filial é recusada: a DEFIS é da matriz. Procuração: 00146 (a mesma do PGDAS-D).
// Transmitir DEFIS (DEFIS.TRANSDECLARACAO141) NÃO existe aqui: escrita na Receita é fase final.
// ---------------------------------------------------------------------------

const COMPANY_ID = "5cd08fcd-c095-4f08-b3a8-c02b9bf1034e";
const STATUS_MONITORADO = "Ativo";
const RECENTE_MIN = 15;
const BUCKET = "serpro-pgdasd"; // mesmo bucket privado do PGDAS-D; arquivos da DEFIS ficam em defis-*.pdf

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const { serpro } = criarSerpro(supabase, COMPANY_ID);

const anoBR = () => Number(new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 4));
const msgErro = (r: { resposta: any }) => r.resposta?.mensagens?.[0]?.texto ?? r.resposta?.error ?? "Falha na consulta ao Serpro";

async function carregarCliente(contactId: string) {
  const { data: c } = await supabase.from("contacts").select("id,name,document,status_cliente").eq("id", contactId).eq("company_id", COMPANY_ID).maybeSingle();
  if (!c) return { resp: json({ error: "Cliente não encontrado" }, 404) };
  if (c.status_cliente !== STATUS_MONITORADO) {
    return { resp: json({ ok: false, foraDoMonitoramento: true, error: `Cliente fora do monitoramento (status: ${c.status_cliente ?? "sem status"}). O Serpro só é consultado para clientes com status "${STATUS_MONITORADO}".` }) };
  }
  const cnpj = onlyDigits(c.document);
  if (cnpj.length !== 14) return { resp: json({ error: "Cliente sem CNPJ válido" }, 400) };
  if (cnpj.slice(8, 12) !== "0001") return { resp: json({ ok: false, filial: true, error: "Este CNPJ é de filial. A DEFIS é transmitida pela matriz: consulte o CNPJ da matriz." }) };
  return { contato: c, cnpj };
}

async function consultar(payload: any, uid: string) {
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;

  if (!payload.force) {
    const { data: ja } = await supabase.from("serpro_defis_consultas").select("consultado_em").eq("contact_id", c.contato!.id).maybeSingle();
    if (ja?.consultado_em && Date.now() - Date.parse(ja.consultado_em) < RECENTE_MIN * 60_000) return json({ ok: true, recente: true, consultado_em: ja.consultado_em });
  }

  const r = await serpro({
    tipo: "Consultar", idSistema: "DEFIS", idServico: "CONSDECLARACAO142",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: "",
    uid, contactId: c.contato!.id, origem: "manual",
    finalidade: "Consulta das DEFIS transmitidas (declaração anual do Simples Nacional) acionada por usuário para acompanhamento fiscal do cliente",
  });
  if (r.status === 403) return json({ ok: false, semProcuracao: true, status: 403, error: "Sem procuração eletrônica para a DEFIS deste cliente" });
  // Cliente sem nenhuma DEFIS (empresa nova): o formato exato da resposta ainda não foi visto em produção, então "não há/não existe/nenhuma" vale como lista vazia.
  const texto = String(msgErro(r));
  const semNenhuma = r.status === 404 || (r.status !== 200 && /n[aã]o (h[aá]|existe|foi encontrad|localiz)|nenhuma|sem declara/i.test(texto));
  if (r.status !== 200 && !semNenhuma) return json({ ok: false, status: r.status, error: texto });

  const lista = semNenhuma ? [] : lerIndiceDefis(r.resposta?.dados);
  const agora = new Date().toISOString();
  let novas = 0;
  if (lista.length) {
    const { data: ex } = await supabase.from("serpro_defis").select("id_defis").eq("contact_id", c.contato!.id).in("id_defis", lista.map((d) => d.id_defis));
    const ja = new Set((ex ?? []).map((e: { id_defis: string }) => e.id_defis));
    novas = lista.filter((d) => !ja.has(d.id_defis)).length;
    // Só as colunas do índice: os PDFs já baixados não são apagados.
    const { error } = await supabase.from("serpro_defis").upsert(
      lista.map((d) => ({ company_id: COMPANY_ID, contact_id: c.contato!.id, ano_calendario: d.ano_calendario, id_defis: d.id_defis, tipo: d.tipo, transmitida_em: d.transmitida_em, sincronizado_em: agora })),
      { onConflict: "contact_id,id_defis" });
    if (error) return json({ ok: false, error: `Consulta feita, mas não foi possível gravar: ${error.message}` }, 500);
  }
  await supabase.from("serpro_defis_consultas").upsert(
    { contact_id: c.contato!.id, company_id: COMPANY_ID, consultado_em: agora, consultado_por: uid, declaracoes: lista.length }, { onConflict: "contact_id" });
  return json({ ok: true, declaracoes: lista.length, novas, sem_declaracao: lista.length === 0 });
}

async function documentos(payload: any, uid: string) {
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const ano = Number(payload.ano);
  if (!Number.isInteger(ano) || ano < 2018 || ano > anoBR()) return json({ error: "Ano inválido" }, 400);

  const { data: vigente } = await supabase.from("serpro_defis").select("id,id_defis,recibo_path,declaracao_path")
    .eq("contact_id", c.contato!.id).eq("ano_calendario", ano).order("transmitida_em", { ascending: false }).limit(1).maybeSingle();
  if (!vigente) return json({ ok: false, error: "Não há DEFIS deste ano na lista. Consulte o cliente primeiro." });
  // Já baixado: não chama o Serpro de novo (cada chamada é cobrada).
  if (vigente.recibo_path && vigente.declaracao_path && !payload.force) return json({ ok: true, jaBaixado: true, id: vigente.id });

  const r = await serpro({
    tipo: "Consultar", idSistema: "DEFIS", idServico: "CONSULTIMADECREC143",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: JSON.stringify({ ano }),
    uid, contactId: c.contato!.id, origem: "manual",
    finalidade: `Consulta da declaração e do recibo da DEFIS (ano-calendário ${ano}) acionada por usuário para o cliente`,
  });
  if (r.status === 403) return json({ ok: false, semProcuracao: true, error: "Sem procuração eletrônica para a DEFIS deste cliente" });
  if (r.status !== 200) return json({ ok: false, status: r.status, error: msgErro(r) });

  const d = r.resposta?.dados;
  const idDefis = String(pega(d, "idDefis") ?? "");
  if (!idDefis) return json({ ok: false, error: "O Serpro não devolveu a DEFIS deste ano" }, 502);
  const { data: alvo } = await supabase.from("serpro_defis").select("id").eq("contact_id", c.contato!.id).eq("id_defis", idDefis).maybeSingle();
  if (!alvo) return json({ ok: false, error: `A Receita devolveu a DEFIS nº ${idDefis}, que ainda não está na lista. Consulte o cliente de novo e tente outra vez.` });

  const pasta = `${COMPANY_ID}/${c.contato!.id}`;
  const recibo = await guardarPdf(supabase, BUCKET, `${pasta}/defis-recibo-${idDefis}.pdf`, pega(d, "reciboPdf"));
  const decl = await guardarPdf(supabase, BUCKET, `${pasta}/defis-declaracao-${idDefis}.pdf`, pega(d, "declaracaoPdf"));
  if (!recibo && !decl) return json({ ok: false, error: "O Serpro não devolveu os PDFs da DEFIS" }, 502);
  await supabase.from("serpro_defis").update({ recibo_path: recibo, declaracao_path: decl, documentos_em: new Date().toISOString() }).eq("id", alvo.id);
  return json({ ok: true, id: alvo.id });
}

const COLUNA: Record<string, { coluna: string; prefixo: string }> = {
  declaracao: { coluna: "declaracao_path", prefixo: "defis-declaracao" },
  recibo: { coluna: "recibo_path", prefixo: "defis-recibo" },
};

async function link(payload: any) {
  const t = COLUNA[String(payload.tipo ?? "")];
  if (!t) return json({ error: "Tipo de arquivo inválido" }, 400);
  const { data } = await supabase.from("serpro_defis").select("*").eq("id", String(payload.id ?? "")).eq("company_id", COMPANY_ID).maybeSingle();
  const linha = (data ?? {}) as Record<string, string | null>;
  const path = linha[t.coluna];
  if (!path) return json({ ok: false, error: "Arquivo ainda não baixado" });
  const url = await assinar(supabase, BUCKET, path, `${t.prefixo}-${linha.id_defis ?? ""}.pdf`);
  return url ? json({ ok: true, url }) : json({ ok: false, error: "Não foi possível gerar o link" }, 500);
}

async function publicar(payload: any) {
  if (typeof payload.visivel_portal !== "boolean") return json({ error: "visivel_portal inválido" }, 400);
  const { error } = await supabase.from("serpro_defis").update({ visivel_portal: payload.visivel_portal }).eq("id", String(payload.id ?? "")).eq("company_id", COMPANY_ID);
  return error ? json({ error: error.message }, 500) : json({ ok: true });
}

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
    case "link": return await link(payload);
    case "publicar": return await publicar(payload);
    default: return json({ error: "action inválida (consultar | documentos | link | publicar)" }, 400);
  }
});
