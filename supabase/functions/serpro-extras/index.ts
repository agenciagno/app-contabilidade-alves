import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { criarSerpro, onlyDigits } from "../_shared/serpro-core.ts";
import { pega } from "../_shared/pgdasd-indice.ts";
import { perfilAtivo } from "../_shared/acesso.ts";

// ---------------------------------------------------------------------------
// Mais dados da Receita no que já existe (Rodada 5 do Monitoramento, 09/10/2026). Só leitura, tudo por clique.
//
//   dte        { contact_id }          DTE.CONSULTASITUACAODTE111 (Consultar): adesão ao Domicílio Tributário Eletrônico.
//   regime     { contact_id, ano }     REGIMEAPURACAO.CONSULTAROPCAOREGIME103 (Consultar): regime de caixa ou competência do Simples no ano.
//   eprocesso  { contact_id }          EPROCESSO.CONSPROCPORINTER271 (Consultar, versão 2.0): processos em que o cliente é interessado.
//   vinculos   {}                      PNRCONTADOR.CONSVINCULOS261 (Consultar, paginado): CNPJs vinculados à CA como contador na Redesim.
//                                      Uma chamada por página de 100; até 20 páginas. Só admin dispara.
// Só clientes com status "Ativo".
// ---------------------------------------------------------------------------

const COMPANY_ID = "5cd08fcd-c095-4f08-b3a8-c02b9bf1034e";
const STATUS_MONITORADO = "Ativo";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const { serpro, AUTOR_NI } = criarSerpro(supabase, COMPANY_ID);

const msgErro = (r: { resposta: any }) => String(r.resposta?.mensagens?.[0]?.texto ?? r.resposta?.error ?? "Falha na consulta ao Serpro");
const vazioPorTexto = (r: { status: number; resposta: any }) =>
  r.status === 204 || r.status === 404 || (r.status !== 200 && r.status !== 403 && /n[aã]o (h[aá]|existe|possui|foi encontrad|localiz)|nenhum/i.test(msgErro(r)));
const dataBRparaISO = (v: unknown) => { const m = String(v ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const dataHora = (v: unknown) => { const s = String(v ?? ""); return /^\d{14}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}-03:00` : null; };

async function carregarCliente(contactId: string) {
  const { data: c } = await supabase.from("contacts").select("id,name,document,status_cliente").eq("id", contactId).eq("company_id", COMPANY_ID).maybeSingle();
  if (!c) return { resp: json({ error: "Cliente não encontrado" }, 404) };
  if (c.status_cliente !== STATUS_MONITORADO) {
    return { resp: json({ ok: false, foraDoMonitoramento: true, error: `Cliente fora do monitoramento (status: ${c.status_cliente ?? "sem status"}).` }) };
  }
  const cnpj = onlyDigits(c.document);
  if (cnpj.length !== 14) return { resp: json({ error: "Cliente sem CNPJ válido" }, 400) };
  return { contato: c, cnpj };
}

async function dte(payload: any, uid: string) {
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const r = await serpro({
    tipo: "Consultar", idSistema: "DTE", idServico: "CONSULTASITUACAODTE111",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: "", uid, contactId: c.contato!.id, origem: "manual",
    finalidade: "Consulta da adesão ao Domicílio Tributário Eletrônico acionada por usuário para acompanhamento fiscal do cliente",
  });
  if (r.status === 403) return json({ ok: false, semProcuracao: true, error: "Sem procuração para consultar o DTE deste cliente" });
  if (r.status !== 200) return json({ ok: false, status: r.status, error: msgErro(r) });
  const d = r.resposta?.dados;
  const indicador = Number(pega(d, "indicadorEnquadramento"));
  const status = String(pega(d, "statusEnquadramento") ?? "") || null;
  await supabase.from("serpro_dte").upsert({ contact_id: c.contato!.id, company_id: COMPANY_ID, consultado_em: new Date().toISOString(), consultado_por: uid, indicador: Number.isFinite(indicador) ? indicador : null, status }, { onConflict: "contact_id" });
  return json({ ok: true, indicador, status });
}

async function regime(payload: any, uid: string) {
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const ano = Number(payload.ano) || new Date().getFullYear();
  const r = await serpro({
    tipo: "Consultar", idSistema: "REGIMEAPURACAO", idServico: "CONSULTAROPCAOREGIME103",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: JSON.stringify({ anoCalendario: ano }), uid, contactId: c.contato!.id, origem: "manual",
    finalidade: `Consulta da opção pelo regime de apuração do Simples (ano ${ano}) acionada por usuário para o cliente`,
  });
  if (r.status === 403) return json({ ok: false, semProcuracao: true, error: "Sem procuração para consultar o regime de apuração deste cliente" });
  const vazio = vazioPorTexto(r);
  if (r.status !== 200 && !vazio) return json({ ok: false, status: r.status, error: msgErro(r) });
  const d = vazio ? null : r.resposta?.dados;
  const escolhido = d ? String(pega(d, "regimeEscolhido") ?? "") || null : null;
  await supabase.from("serpro_regime_apuracao").upsert({
    contact_id: c.contato!.id, company_id: COMPANY_ID, ano, regime: escolhido ?? (vazio ? "sem_opcao" : null),
    data_opcao: d ? dataHora(pega(d, "dataHoraOpcao")) : null, consultado_em: new Date().toISOString(), consultado_por: uid,
  }, { onConflict: "contact_id,ano" });
  return json({ ok: true, ano, regime: escolhido ?? (vazio ? "sem_opcao" : null) });
}

async function eprocesso(payload: any, uid: string) {
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const contactId = c.contato!.id;
  const r = await serpro({
    tipo: "Consultar", idSistema: "EPROCESSO", idServico: "CONSPROCPORINTER271", versao: "2.0",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: "", uid, contactId, origem: "manual",
    finalidade: "Consulta dos processos digitais (e-Processo) em que o cliente é interessado, acionada por usuário para acompanhamento fiscal",
  });
  if (r.status === 403) return json({ ok: false, semProcuracao: true, error: "Sem procuração para o e-Processo deste cliente" });
  const vazio = vazioPorTexto(r);
  if (r.status !== 200 && !vazio) return json({ ok: false, status: r.status, error: msgErro(r) });
  const bruto = vazio ? [] : r.resposta?.dados;
  const lista: any[] = Array.isArray(bruto) ? bruto : Array.isArray(pega(bruto, "processos")) ? pega(bruto, "processos") : bruto ? [bruto] : [];
  const agora = new Date().toISOString();
  const linhas = lista.map((p) => ({
    company_id: COMPANY_ID, contact_id: contactId, numero: String(pega(p, "numeroDoProcesso") ?? "").trim(),
    relacao: pega(p, "relacaoDoInteressadoComOProcesso") ?? null, data_protocolo: dataBRparaISO(pega(p, "dataDeProtocolo")),
    tipo: pega(p, "tipoDoProcesso") ?? null, subtipo: pega(p, "subtipoDoProcesso") ?? null, localizacao: pega(p, "localizacao") ?? null,
    situacao: pega(p, "situacao") ?? null, ultimo_encaminhamento: pega(p, "ultimoEncaminhamentoExterno") ?? null, sincronizado_em: agora,
  })).filter((p) => p.numero);
  await supabase.from("serpro_eprocessos").delete().eq("contact_id", contactId);
  if (linhas.length) await supabase.from("serpro_eprocessos").insert(linhas);
  await supabase.from("serpro_eprocesso_consultas").upsert({ contact_id: contactId, company_id: COMPANY_ID, consultado_em: agora, consultado_por: uid, total: linhas.length }, { onConflict: "contact_id" });
  return json({ ok: true, processos: linhas.length });
}

async function vinculos(uid: string) {
  const { data: contatos } = await supabase.from("contacts").select("id,document").eq("company_id", COMPANY_ID).limit(5000);
  const porCnpj = new Map((contatos ?? []).map((c: { id: string; document: string | null }) => [onlyDigits(c.document), c.id]));
  const todos: { cnpj: string; tipo: string | null; situacao: string | null; uf: string | null; municipio: string | null }[] = [];
  let ultimo: string | null = null;
  let paginas = 0;
  for (; paginas < 20; paginas++) {
    const pagination: Record<string, unknown> = { size: 100 };
    if (ultimo) pagination.lastCnpj = ultimo;
    const r = await serpro({
      tipo: "Consultar", idSistema: "PNRCONTADOR", idServico: "CONSVINCULOS261",
      contribuinte: { numero: AUTOR_NI, tipo: 2 }, dados: JSON.stringify({ pagination }), uid, contactId: null, origem: "manual",
      finalidade: "Consulta dos vínculos da Contabilidade Alves como contador na Redesim, acionada por administrador para conferência da carteira",
    });
    if (r.status !== 200) {
      if (!todos.length) return json({ ok: false, status: r.status, error: msgErro(r) });
      break;
    }
    const d = r.resposta?.dados;
    const lista: any[] = Array.isArray(pega(d, "cnpjs")) ? pega(d, "cnpjs") : [];
    for (const e of lista) {
      todos.push({
        cnpj: onlyDigits(pega(e, "cnpj")), tipo: pega(e, "tipoEstabelecimento") ?? null,
        situacao: pega(pega(e, "situacaoCadastral"), "descricao") ?? null, uf: pega(e, "uf") ?? null, municipio: pega(e, "nomeMunicipio") ?? pega(e, "codigoMunicipio") ?? null,
      });
    }
    ultimo = String(pega(d, "lastCnpj") ?? "") || null;
    if (!ultimo || lista.length < 100) { paginas++; break; }
  }
  const agora = new Date().toISOString();
  await supabase.from("serpro_redesim_vinculos").delete().eq("company_id", COMPANY_ID);
  const unicos = [...new Map(todos.filter((t) => t.cnpj.length === 14).map((t) => [t.cnpj, t])).values()];
  if (unicos.length) {
    await supabase.from("serpro_redesim_vinculos").insert(unicos.map((t) => ({
      company_id: COMPANY_ID, cnpj: t.cnpj, contact_id: porCnpj.get(t.cnpj) ?? null, tipo_estabelecimento: t.tipo, situacao: t.situacao, uf: t.uf, municipio: t.municipio, consultado_em: agora,
    })));
  }
  return json({ ok: true, vinculos: unicos.length, paginas });
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
    case "dte": return await dte(payload, uid);
    case "regime": return await regime(payload, uid);
    case "eprocesso": return await eprocesso(payload, uid);
    case "vinculos":
      if (!admin) return json({ error: "Só administradores atualizam os vínculos da Redesim" }, 403);
      return await vinculos(uid);
    default: return json({ error: "action inválida (dte | regime | eprocesso | vinculos)" }, 400);
  }
});
