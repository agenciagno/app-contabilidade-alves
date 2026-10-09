import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { criarSerpro, onlyDigits } from "../_shared/serpro-core.ts";
import { pega } from "../_shared/pgdasd-indice.ts";
import { assinar, guardarPdf } from "../_shared/serpro-arquivos.ts";
import { perfilAtivo } from "../_shared/acesso.ts";

// ---------------------------------------------------------------------------
// MEI no Integra Contador (Rodada 4 do Monitoramento, 09/10/2026). PGMEI e CCMEI NÃO exigem procuração.
//
//   gerar_das    { contact_id, periodo: "AAAA-MM", confirmar_emissao: true, data_pagamento?: "AAAA-MM-DD", novo? }
//       PGMEI.GERARDASPDF21 (Emitir): DAS do MEI em PDF. data_pagamento vira dataConsolidacao (AAAAMMDD) e sempre emite um novo.
//       Sem `novo` nem data, um DAS guardado do mesmo período e ainda pagável é devolvido sem emitir outro.
//   divida_ativa { contact_id, ano }   PGMEI.DIVIDAATIVA24 (Consultar): débitos do MEI em dívida ativa no ano.
//   ccmei        { contact_id, confirmar_emissao: true }   CCMEI.EMITIRCCMEI121 (Emitir): Certificado da Condição de MEI em PDF.
//   situacao     { contact_id }   CCMEI.DADOSCCMEI122 (Consultar): situação cadastral e enquadramento no MEI.
//   link         { tipo: "das" | "ccmei", id }   link assinado (10 min) de um PDF já guardado (sem chamada ao Serpro).
//
// Só clientes com status "Ativo". ATUBENEFICIO23 (atualizar benefício) fica de fora: muda o cadastro do MEI na Receita.
// ---------------------------------------------------------------------------

const COMPANY_ID = "5cd08fcd-c095-4f08-b3a8-c02b9bf1034e";
const STATUS_MONITORADO = "Ativo";
const BUCKET = "serpro-mei";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const { serpro } = criarSerpro(supabase, COMPANY_ID);

const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const msgErro = (r: { resposta: any }) => String(r.resposta?.mensagens?.[0]?.texto ?? r.resposta?.error ?? "Falha na consulta ao Serpro");
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const dataDe = (v: unknown) => { const s = String(v ?? ""); return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null; };
const primeiro = (d: unknown) => (Array.isArray(d) ? d[0] : d);

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

async function gerarDas(payload: any, uid: string) {
  if (payload.confirmar_emissao !== true) return json({ error: "Confirme a emissão (registra uma emissão na Receita)" }, 400);
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const contactId = c.contato!.id;
  const comp = String(payload.periodo ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(comp)) return json({ error: "Informe o período (AAAA-MM)" }, 400);
  const periodo = `${comp}-01`;
  const hoje = hojeBR();
  const dataPagamento = payload.data_pagamento ? String(payload.data_pagamento) : null;
  if (dataPagamento && (!/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento) || dataPagamento < hoje)) return json({ ok: false, error: "A data de pagamento precisa ser de hoje em diante." });

  if (!payload.novo && !dataPagamento) {
    const { data: ja } = await supabase.from("serpro_mei_das").select("id,pdf_path,vencimento,limite_acolhimento,valor_total,numero_das")
      .eq("contact_id", contactId).eq("periodo", periodo).is("data_pagamento", null).order("emitido_em", { ascending: false }).limit(1).maybeSingle();
    const validoAte = ja?.limite_acolhimento ?? ja?.vencimento ?? null;
    if (ja?.pdf_path && (!validoAte || validoAte >= hoje)) {
      const url = await assinar(supabase, BUCKET, ja.pdf_path, `das-mei-${comp}.pdf`);
      if (url) return json({ ok: true, jaGerado: true, url, id: ja.id, vencimento: ja.vencimento, valor_total: ja.valor_total });
    }
  }

  const dados: Record<string, string> = { periodoApuracao: comp.replace("-", "") };
  if (dataPagamento) dados.dataConsolidacao = dataPagamento.replace(/-/g, "");
  const r = await serpro({
    tipo: "Emitir", idSistema: "PGMEI", idServico: "GERARDASPDF21",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: JSON.stringify(dados),
    uid, contactId, origem: "manual",
    finalidade: `Emissão do DAS do MEI (PA ${comp.slice(5)}/${comp.slice(0, 4)}) confirmada por usuário para o cliente`,
  });
  if (r.status !== 200) return json({ ok: false, status: r.status, error: msgErro(r) });
  const das = primeiro(r.resposta?.dados);
  const det = primeiro(pega(das, "detalhamento", "detalhamentoDas"));
  const numero = String(pega(det, "numeroDocumento") ?? "") || null;
  const path = await guardarPdf(supabase, BUCKET, `${COMPANY_ID}/${contactId}/das-mei-${comp}-${Date.now()}.pdf`, pega(das, "pdf"));
  if (!path) return json({ ok: false, error: "O DAS foi gerado, mas o PDF não veio em formato válido" }, 502);
  const val = pega(det, "valores");
  const { data: novo, error } = await supabase.from("serpro_mei_das").insert({
    company_id: COMPANY_ID, contact_id: contactId, periodo, numero_das: numero,
    vencimento: dataDe(pega(det, "dataVencimento")), limite_acolhimento: dataDe(pega(det, "dataLimiteAcolhimento")),
    valor_total: num(pega(val, "total")), data_pagamento: dataPagamento, pdf_path: path, emitido_por: uid,
  }).select("id").single();
  if (error || !novo) return json({ ok: false, error: "O DAS foi gerado e guardado, mas o registro falhou" }, 500);
  const url = await assinar(supabase, BUCKET, path, `das-mei-${comp}.pdf`);
  return json({ ok: true, url, id: novo.id });
}

async function dividaAtiva(payload: any, uid: string) {
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const contactId = c.contato!.id;
  const ano = Number(payload.ano) || Number(hojeBR().slice(0, 4));
  if (ano < 2009 || ano > Number(hojeBR().slice(0, 4))) return json({ error: "Ano inválido" }, 400);
  const r = await serpro({
    tipo: "Consultar", idSistema: "PGMEI", idServico: "DIVIDAATIVA24",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: JSON.stringify({ anoCalendario: String(ano) }),
    uid, contactId, origem: "manual",
    finalidade: `Consulta de débitos do MEI em dívida ativa (ano ${ano}) acionada por usuário para acompanhamento fiscal do cliente`,
  });
  const texto = msgErro(r);
  // Sem débito: a resposta exata ainda não foi vista em produção; 204/404 ou "não há/nenhum" valem como lista vazia.
  const vazio = r.status === 204 || r.status === 404 || (r.status !== 200 && /n[aã]o (h[aá]|existe|possui|foi encontrad|localiz)|nenhum/i.test(texto));
  if (r.status !== 200 && !vazio) return json({ ok: false, status: r.status, error: texto });
  const bruto = vazio ? [] : r.resposta?.dados;
  const lista = Array.isArray(bruto) ? bruto : Array.isArray(pega(bruto, "debitos")) ? pega(bruto, "debitos") : [];
  const itens = lista.map((d: any) => ({
    periodo: String(pega(d, "periodoApuracao") ?? ""), tributo: String(pega(d, "tributo") ?? ""), valor: num(pega(d, "valor")) ?? 0,
    ente: String(pega(d, "enteFederado") ?? ""), situacao: String(pega(d, "situacaoDebito") ?? ""),
  }));
  const total = itens.reduce((s: number, i: { valor: number }) => s + i.valor, 0);
  await supabase.from("serpro_mei_divida").upsert(
    { contact_id: contactId, company_id: COMPANY_ID, ano, consultado_em: new Date().toISOString(), consultado_por: uid, itens, total },
    { onConflict: "contact_id,ano" });
  return json({ ok: true, ano, debitos: itens.length, total });
}

async function emitirCcmei(payload: any, uid: string) {
  if (payload.confirmar_emissao !== true) return json({ error: "Confirme a emissão (registra uma emissão na Receita)" }, 400);
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const contactId = c.contato!.id;
  const r = await serpro({
    tipo: "Emitir", idSistema: "CCMEI", idServico: "EMITIRCCMEI121",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: "",
    uid, contactId, origem: "manual",
    finalidade: "Emissão do Certificado da Condição de MEI confirmada por usuário para o cliente",
  });
  if (r.status !== 200) return json({ ok: false, status: r.status, error: msgErro(r) });
  const d = primeiro(r.resposta?.dados);
  const path = await guardarPdf(supabase, BUCKET, `${COMPANY_ID}/${contactId}/ccmei-${Date.now()}.pdf`, pega(d, "pdf"));
  if (!path) return json({ ok: false, error: "O certificado foi emitido, mas o PDF não veio em formato válido" }, 502);
  const { data: novo } = await supabase.from("serpro_mei_ccmei").insert({ company_id: COMPANY_ID, contact_id: contactId, pdf_path: path, emitido_por: uid }).select("id").single();
  const url = await assinar(supabase, BUCKET, path, "ccmei.pdf");
  return json({ ok: true, url, id: novo?.id ?? null });
}

async function situacao(payload: any, uid: string) {
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const contactId = c.contato!.id;
  const r = await serpro({
    tipo: "Consultar", idSistema: "CCMEI", idServico: "DADOSCCMEI122",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: "",
    uid, contactId, origem: "manual",
    finalidade: "Consulta da situação cadastral e do enquadramento no MEI acionada por usuário para acompanhamento fiscal do cliente",
  });
  if (r.status !== 200) return json({ ok: false, status: r.status, error: msgErro(r) });
  const d = primeiro(r.resposta?.dados);
  const enq = pega(d, "enquadramento");
  const optante = pega(enq, "optanteMei");
  const linha = {
    contact_id: contactId, company_id: COMPANY_ID, consultado_em: new Date().toISOString(), consultado_por: uid,
    situacao_cadastral: String(pega(d, "situacaoCadastralVigente") ?? "") || null,
    optante_mei: typeof optante === "boolean" ? optante : null,
    enquadramento: String(pega(enq, "situacao") ?? "") || null,
    dados: { nomeEmpresarial: pega(d, "nomeEmpresarial") ?? null, dataInicioAtividades: pega(d, "dataInicioAtividades") ?? null, periodosMei: pega(enq, "periodosMei") ?? null },
  };
  await supabase.from("serpro_mei_situacao").upsert(linha, { onConflict: "contact_id" });
  return json({ ok: true, situacao: linha.situacao_cadastral, optante: linha.optante_mei, enquadramento: linha.enquadramento });
}

async function link(payload: any) {
  const tabela = payload.tipo === "ccmei" ? "serpro_mei_ccmei" : "serpro_mei_das";
  const { data } = await supabase.from(tabela).select("pdf_path").eq("id", String(payload.id ?? "")).eq("company_id", COMPANY_ID).maybeSingle();
  if (!data?.pdf_path) return json({ ok: false, error: "Arquivo não encontrado" });
  const url = await assinar(supabase, BUCKET, data.pdf_path, payload.tipo === "ccmei" ? "ccmei.pdf" : "das-mei.pdf");
  return url ? json({ ok: true, url }) : json({ ok: false, error: "Não foi possível gerar o link" }, 500);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const payload = await req.json().catch(() => ({}));
  const { data: userData } = await supabase.auth.getUser(bearer);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "Não autenticado" }, 401);
  const { data: perfil } = await perfilAtivo(bearer, uid, "role,is_super_admin,company_id");
  const admin = perfil?.is_super_admin === true || (perfil?.role === "admin" && perfil?.company_id === COMPANY_ID);
  const equipe = admin || (perfil?.role === "colaborador" && perfil?.company_id === COMPANY_ID);
  if (!equipe) return json({ error: "Sem permissão" }, 403);

  switch (payload.action) {
    case "gerar_das": return await gerarDas(payload, uid);
    case "divida_ativa": return await dividaAtiva(payload, uid);
    case "ccmei": return await emitirCcmei(payload, uid);
    case "situacao": return await situacao(payload, uid);
    case "link": return await link(payload);
    default: return json({ error: "action inválida (gerar_das | divida_ativa | ccmei | situacao | link)" }, 400);
  }
});
