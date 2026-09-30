import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { criarSerpro, onlyDigits } from "../_shared/serpro-core.ts";
import { pega } from "../_shared/pgdasd-indice.ts";
import { assinar, guardarPdf } from "../_shared/serpro-arquivos.ts";
import { dadosParaSerpro, lerCodigoBarras, lerConsolidado, validarEntradaDarf, type EntradaDarf } from "../_shared/sicalc.ts";

// ---------------------------------------------------------------------------
// DARF atualizado (SICALC, Serpro Integra Contador) — F4 Onda 3, 30/09/2026.
// O SICALC NÃO descobre dívida: a equipe informa receita, período, vencimento, valor do imposto e a data prevista do pagamento, e o Serpro
// devolve o DARF com multa e juros calculados até essa data (PDF + valores). Cada emissão é cobrada ("Emitir").
//
//   gerar         { contact_id, receita, extensao, tipo_pa, data_pa, vencimento, valor_imposto, data_consolidacao, numero_referencia?,
//                   observacao?, confirmar_emissao: true, novo? }      CONSOLIDARGERARDARF51. Mesmos dados nos últimos 10 min: devolve o DARF
//                   já gerado em vez de cobrar de novo (duplo clique), salvo `novo`.
//   codigo_barras { id }                   GERARDARFCODBARRA53 (outra emissão cobrada): guarda os 44 dígitos no DARF.
//   link          { id }                   link assinado (10 min) do PDF guardado.
//
// Só clientes com status "Ativo" e CNPJ. A documentação não exige procuração para o SICALC; se o Serpro negar (403), a tela avisa.
// ---------------------------------------------------------------------------

const COMPANY_ID = "5cd08fcd-c095-4f08-b3a8-c02b9bf1034e";
const STATUS_MONITORADO = "Ativo";
const REUSO_MIN = 10;
const BUCKET = "serpro-darf";
const VERSAO = "2.9";

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
  return { contato: c, cnpj };
}

const aEntrada = (l: any): EntradaDarf => ({
  codigo_receita: l.codigo_receita, extensao: l.extensao, tipo_pa: l.tipo_pa, data_pa: l.data_pa, vencimento: l.vencimento,
  valor_imposto: Number(l.valor_imposto), data_consolidacao: l.data_consolidacao, numero_referencia: l.numero_referencia, observacao: l.observacao,
});

async function gerar(payload: any, uid: string) {
  // Emitir é cobrado: só com confirmação explícita de quem clicou.
  if (payload.confirmar_emissao !== true) return json({ error: "Emissão não confirmada. Cada DARF gerado é cobrado e precisa de confirmação explícita." }, 400);
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const contactId = c.contato!.id;
  const v = validarEntradaDarf(payload, hojeBR());
  if ("erro" in v) return json({ ok: false, error: v.erro });
  const e = v.entrada;

  if (!payload.novo) {
    const desde = new Date(Date.now() - REUSO_MIN * 60_000).toISOString();
    const { data: ja } = await supabase.from("serpro_darfs").select("id,pdf_path,valor_total,valido_ate,numero_documento,created_at")
      .eq("contact_id", contactId).eq("codigo_receita", e.codigo_receita).eq("extensao", e.extensao).eq("tipo_pa", e.tipo_pa).eq("data_pa", e.data_pa)
      .eq("vencimento", e.vencimento).eq("valor_imposto", e.valor_imposto).eq("data_consolidacao", e.data_consolidacao).gte("created_at", desde)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (ja?.pdf_path) {
      const url = await assinar(supabase, BUCKET, ja.pdf_path, `darf-${e.codigo_receita}-${e.data_pa.replace("/", "-")}.pdf`);
      if (url) return json({ ok: true, jaGerado: true, id: ja.id, url });
    }
  }

  const r = await serpro({
    tipo: "Emitir", idSistema: "SICALC", idServico: "CONSOLIDARGERARDARF51", versao: VERSAO,
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: JSON.stringify(dadosParaSerpro(e)),
    uid, contactId, origem: "manual",
    finalidade: `Cálculo e emissão de DARF (receita ${e.codigo_receita}-${e.extensao}, PA ${e.data_pa}) confirmados por usuário para o cliente`,
  });
  if (r.status === 403) return json({ ok: false, semProcuracao: true, error: "O Serpro negou a emissão deste DARF para o cliente (sem procuração)." });
  if (r.status !== 200) return json({ ok: false, status: r.status, error: msgErro(r) });

  const consolidado = lerConsolidado(r.resposta?.dados);
  const pdfB64 = pega(r.resposta?.dados, "darf");
  const numeroDoc = String(pega(r.resposta?.dados, "numeroDocumento") ?? "").trim() || null;
  if (!consolidado) return json({ ok: false, error: "O Serpro respondeu, mas os valores do cálculo não vieram no formato esperado" }, 502);
  const id = crypto.randomUUID();
  const path = await guardarPdf(supabase, BUCKET, `${COMPANY_ID}/${contactId}/darf-${id}.pdf`, pdfB64);
  if (!path) return json({ ok: false, error: "O DARF foi calculado, mas o PDF não veio em formato válido" }, 502);

  const linha = {
    id, company_id: COMPANY_ID, contact_id: contactId, codigo_receita: e.codigo_receita, extensao: e.extensao, tipo_pa: e.tipo_pa, data_pa: e.data_pa,
    vencimento: e.vencimento, valor_imposto: e.valor_imposto, data_consolidacao: e.data_consolidacao, numero_referencia: e.numero_referencia, observacao: e.observacao,
    ...consolidado, numero_documento: numeroDoc, pdf_path: path, created_by: uid,
  };
  const { error } = await supabase.from("serpro_darfs").insert(linha);
  if (error) return json({ ok: false, error: `O DARF foi gerado, mas não foi possível registrar: ${error.message}` }, 500);
  const url = await assinar(supabase, BUCKET, path, `darf-${e.codigo_receita}-${e.data_pa.replace("/", "-")}.pdf`);
  return json({ ok: true, id, url, valor_total: consolidado.valor_total, valido_ate: consolidado.valido_ate });
}

async function codigoBarras(payload: any, uid: string) {
  const { data: d } = await supabase.from("serpro_darfs").select("*").eq("id", String(payload.id ?? "")).eq("company_id", COMPANY_ID).maybeSingle();
  if (!d) return json({ error: "DARF não encontrado" }, 404);
  if (d.codigo_barras) return json({ ok: true, jaTem: true, codigo_barras: d.codigo_barras });
  const c = await carregarCliente(d.contact_id);
  if (c.resp) return c.resp;
  const e = aEntrada(d);
  const r = await serpro({
    tipo: "Emitir", idSistema: "SICALC", idServico: "GERARDARFCODBARRA53", versao: VERSAO,
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: JSON.stringify(dadosParaSerpro(e)),
    uid, contactId: d.contact_id, origem: "manual",
    finalidade: `Código de barras do DARF (receita ${e.codigo_receita}-${e.extensao}, PA ${e.data_pa}) confirmado por usuário para o cliente`,
  });
  if (r.status === 403) return json({ ok: false, semProcuracao: true, error: "O Serpro negou a emissão do código de barras (sem procuração)." });
  if (r.status !== 200) return json({ ok: false, status: r.status, error: msgErro(r) });
  const barras = lerCodigoBarras(r.resposta?.dados);
  if (!barras) return json({ ok: false, error: "O Serpro respondeu, mas o código de barras não veio no formato esperado. Esta receita pode não aceitar código de barras." }, 502);
  await supabase.from("serpro_darfs").update({ codigo_barras: barras }).eq("id", d.id);
  return json({ ok: true, codigo_barras: barras });
}

async function link(payload: any) {
  const { data } = await supabase.from("serpro_darfs").select("pdf_path,codigo_receita,data_pa").eq("id", String(payload.id ?? "")).eq("company_id", COMPANY_ID).maybeSingle();
  if (!data?.pdf_path) return json({ ok: false, error: "DARF não encontrado" });
  const url = await assinar(supabase, BUCKET, data.pdf_path, `darf-${data.codigo_receita}-${String(data.data_pa).replace("/", "-")}.pdf`);
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
    case "gerar": return await gerar(payload, uid);
    case "codigo_barras": return await codigoBarras(payload, uid);
    case "link": return await link(payload);
    default: return json({ error: "action inválida (gerar | codigo_barras | link)" }, 400);
  }
});
