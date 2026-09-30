import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { criarSerpro, onlyDigits } from "../_shared/serpro-core.ts";
import { assinar, guardarPdf } from "../_shared/serpro-arquivos.ts";
import { lerApuracoesMit, pdfDoRecibo, semDeclaracaoDctfweb } from "../_shared/dctfweb-mit.ts";

// ---------------------------------------------------------------------------
// DCTFWeb e MIT (Serpro Integra Contador) — F4 Onda 4, fase 1 (quem entregou), 30/09/2026. Só leitura.
//
//   consultar { contact_id, competencia: "AAAA-MM", force? }
//       1) DCTFWEB.CONSRECIBO32 (Consultar, categoria GERAL_MENSAL): recibo da declaração do mês. MG08 = não há declaração transmitida.
//       2) MIT.LISTAAPURACOES317 (Consultar): todas as apurações do ANO da competência numa chamada.
//       São duas consultas cobradas por clique. Uma parte pode falhar sem derrubar a outra.
//   link      { id }   link assinado (10 min) do recibo da DCTFWeb já guardado (sem chamada ao Serpro).
//
// Só clientes com status "Ativo". Filial é recusada (declarações da matriz). Procuração: 00103 (DCTFWeb).
// Transmitir DCTFWeb/encerrar MIT NÃO existe aqui: escrita na Receita é fase final. A guia (GERARGUIA31) é a fase 2.
// ---------------------------------------------------------------------------

const COMPANY_ID = "5cd08fcd-c095-4f08-b3a8-c02b9bf1034e";
const STATUS_MONITORADO = "Ativo";
const RECENTE_MIN = 15;
const BUCKET = "serpro-dctfweb";
const CODIGOS_BASE = ["00146", "00006", "00004", "00060", "00002", "00103", "00050", "00051"]; // mesmos do mapa de procurações

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const { serpro } = criarSerpro(supabase, COMPANY_ID);

const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const msgErro = (r: { resposta: any }) => String(r.resposta?.mensagens?.[0]?.texto ?? r.resposta?.error ?? "Falha na consulta ao Serpro");

async function carregarCliente(contactId: string) {
  const { data: c } = await supabase.from("contacts").select("id,name,document,status_cliente").eq("id", contactId).eq("company_id", COMPANY_ID).maybeSingle();
  if (!c) return { resp: json({ error: "Cliente não encontrado" }, 404) };
  if (c.status_cliente !== STATUS_MONITORADO) {
    return { resp: json({ ok: false, foraDoMonitoramento: true, error: `Cliente fora do monitoramento (status: ${c.status_cliente ?? "sem status"}). O Serpro só é consultado para clientes com status "${STATUS_MONITORADO}".` }) };
  }
  const cnpj = onlyDigits(c.document);
  if (cnpj.length !== 14) return { resp: json({ error: "Cliente sem CNPJ válido" }, 400) };
  if (cnpj.slice(8, 12) !== "0001") return { resp: json({ ok: false, filial: true, error: "Este CNPJ é de filial. A DCTFWeb e a MIT são da matriz: consulte o CNPJ da matriz." }) };
  return { contato: c, cnpj };
}

/** Cliente mapeado e sem NENHUMA procuração ativa: nem tenta (cada tentativa cobrada voltaria 403). Não mapeado: tenta. */
async function semProcuracaoNenhuma(contactId: string): Promise<boolean> {
  const { data } = await supabase.from("serpro_procuracoes").select("status,data_fim").eq("contact_id", contactId).eq("fonte", "integra_procuracoes").in("codigo_procuracao", CODIGOS_BASE);
  if (!data?.length) return false;
  const hoje = hojeBR();
  return !data.some((r: { status: string; data_fim: string | null }) => r.status === "ativa" && (!r.data_fim || r.data_fim >= hoje));
}

type Parte = { ok: boolean; erro?: string; semProcuracao?: boolean };

async function consultar(payload: any, uid: string) {
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const contactId = c.contato!.id;
  const comp = String(payload.competencia ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(comp)) return json({ error: "Informe a competência (AAAA-MM)" }, 400);
  const [ano, mes] = comp.split("-");
  const competencia = `${comp}-01`;
  if (Number(ano) < 2019 || `${comp}-01` > hojeBR()) return json({ error: "Competência inválida" }, 400);
  if (await semProcuracaoNenhuma(contactId)) return json({ ok: false, semProcuracao: true, error: "Este cliente não tem procuração eletrônica ativa. Peça para outorgar no e-CAC e mapeie em Procurações." });

  if (!payload.force) {
    const [{ data: d }, { data: m }] = await Promise.all([
      supabase.from("serpro_dctfweb").select("consultado_em").eq("contact_id", contactId).eq("competencia", competencia).maybeSingle(),
      supabase.from("serpro_mit_consultas").select("consultado_em").eq("contact_id", contactId).eq("ano", Number(ano)).maybeSingle(),
    ]);
    const recente = (t?: string | null) => !!t && Date.now() - Date.parse(t) < RECENTE_MIN * 60_000;
    if (recente(d?.consultado_em) && recente(m?.consultado_em)) return json({ ok: true, recente: true });
  }

  const agora = new Date().toISOString();
  let dctf: Parte & { status?: "transmitida" | "sem_declaracao" } = { ok: false };
  let mit: Parte & { apuracoes?: number } = { ok: false };

  // ---- DCTFWeb
  const r = await serpro({
    tipo: "Consultar", idSistema: "DCTFWEB", idServico: "CONSRECIBO32",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: JSON.stringify({ categoria: 40, anoPA: ano, mesPA: mes }),
    uid, contactId, origem: "manual",
    finalidade: `Consulta do recibo da DCTFWeb (PA ${mes}/${ano}) acionada por usuário para acompanhamento fiscal do cliente`,
  });
  if (r.status === 403) return json({ ok: false, semProcuracao: true, status: 403, error: "Sem procuração eletrônica para a DCTFWeb deste cliente" });
  if (semDeclaracaoDctfweb(r.resposta)) {
    await supabase.from("serpro_dctfweb").upsert({ company_id: COMPANY_ID, contact_id: contactId, competencia, status: "sem_declaracao", recibo_path: null, consultado_em: agora, consultado_por: uid }, { onConflict: "contact_id,competencia" });
    dctf = { ok: true, status: "sem_declaracao" };
  } else if (r.status === 200) {
    const path = await guardarPdf(supabase, BUCKET, `${COMPANY_ID}/${contactId}/dctfweb-${comp}.pdf`, pdfDoRecibo(r.resposta?.dados));
    if (!path) dctf = { ok: false, erro: "O Serpro respondeu, mas o recibo não veio em PDF válido" };
    else {
      await supabase.from("serpro_dctfweb").upsert({ company_id: COMPANY_ID, contact_id: contactId, competencia, status: "transmitida", recibo_path: path, consultado_em: agora, consultado_por: uid }, { onConflict: "contact_id,competencia" });
      dctf = { ok: true, status: "transmitida" };
    }
  } else {
    dctf = { ok: false, erro: msgErro(r) };
  }

  // ---- MIT (o ano inteiro)
  const m = await serpro({
    tipo: "Consultar", idSistema: "MIT", idServico: "LISTAAPURACOES317",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: JSON.stringify({ anoApuracao: Number(ano) }),
    uid, contactId, origem: "manual",
    finalidade: `Consulta das apurações da MIT (ano ${ano}) acionada por usuário para acompanhamento fiscal do cliente`,
  });
  const textoMit = msgErro(m);
  // Ano sem nenhuma apuração: o formato exato da resposta ainda não foi visto em produção; 404/204 ou "não há/nenhum" valem como lista vazia.
  const vazio = m.status === 204 || m.status === 404 || (m.status !== 200 && m.status !== 403 && /n[aã]o (h[aá]|existe|possui|foi encontrad|localiz)|nenhum/i.test(textoMit));
  if (m.status === 403) {
    mit = { ok: false, semProcuracao: true, erro: "Sem procuração para a MIT" };
  } else if (m.status === 200 || vazio) {
    const lista = vazio ? [] : lerApuracoesMit(m.resposta?.dados);
    if (lista.length) {
      const { error } = await supabase.from("serpro_mit_apuracoes").upsert(
        lista.map((a) => ({ company_id: COMPANY_ID, contact_id: contactId, periodo: a.periodo, id_apuracao: a.id_apuracao, situacao: a.situacao, data_encerramento: a.data_encerramento, evento_especial: a.evento_especial, valor_total: a.valor_total, sincronizado_em: agora })),
        { onConflict: "contact_id,periodo,id_apuracao" });
      if (error) mit = { ok: false, erro: `Consulta feita, mas não foi possível gravar: ${error.message}` };
    }
    if (!mit.erro && !mit.semProcuracao) {
      await supabase.from("serpro_mit_consultas").upsert({ contact_id: contactId, company_id: COMPANY_ID, ano: Number(ano), consultado_em: agora, consultado_por: uid, apuracoes: lista.length }, { onConflict: "contact_id,ano" });
      mit = { ok: true, apuracoes: lista.length };
    }
  } else {
    mit = { ok: false, erro: textoMit };
  }

  if (!dctf.ok && !mit.ok) return json({ ok: false, error: dctf.erro ?? mit.erro ?? "Falha na consulta ao Serpro", dctfweb: dctf, mit });
  return json({ ok: true, dctfweb: dctf, mit });
}

async function link(payload: any) {
  const { data } = await supabase.from("serpro_dctfweb").select("recibo_path,competencia").eq("id", String(payload.id ?? "")).eq("company_id", COMPANY_ID).maybeSingle();
  if (!data?.recibo_path) return json({ ok: false, error: "Recibo não disponível" });
  const url = await assinar(supabase, BUCKET, data.recibo_path, `recibo-dctfweb-${String(data.competencia).slice(0, 7)}.pdf`);
  return url ? json({ ok: true, url }) : json({ ok: false, error: "Não foi possível gerar o link" }, 500);
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
    case "link": return await link(payload);
    default: return json({ error: "action inválida (consultar | link)" }, 400);
  }
});
