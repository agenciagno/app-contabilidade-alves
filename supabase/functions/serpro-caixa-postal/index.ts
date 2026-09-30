import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// ---------------------------------------------------------------------------
// Caixa Postal do e-CAC (Serpro Integra Contador) — F4 Fase A, 30/09/2026.
//
// Ações:
//   consultar        { contact_id, force?, ponteiro? }  baixa a LISTA de mensagens de UM cliente (MSGCONTRIBUINTE61,
//                    cobrado, NÃO gera ciência). Guarda, classifica por regra e atualiza o resumo.
//   abrir            { mensagem_id, ciencia_confirmada: true }  lê o CORPO de UMA mensagem (MSGDETALHAMENTO62).
//                    GERA CIÊNCIA da intimação (art. 23 §2º III, Dec. 70.235/72). Só com confirmação explícita.
//   acompanhar       { mensagem_id, situacao?, responsavel_id?, observacoes?, visivel_portal? }
//   rotina_eventos   rotina diária (07:30 BRT, cron): EVENTOSATUALIZACAO E0601, grátis (/Monitorar), sem ciência.
//                    { limite?: n } (teste com poucos CNPJs) · { forcar?: true } (ignora a trava de 12 h)
//
// Sem lote na tela: cada consulta é de um cliente por vez. Nada aqui lê corpo em lote.
// Toda chamada ao Serpro é registrada em serpro_call_log (finalidade, base legal, quem pediu).
// Modo trial/produção segue o mesmo SERPRO_MODE do serpro-gateway. Modo produção: NÃO testado nesta função.
// ---------------------------------------------------------------------------

const COMPANY_ID = "5cd08fcd-c095-4f08-b3a8-c02b9bf1034e";
const MODE: "trial" | "producao" = Deno.env.get("SERPRO_MODE") === "producao" ? "producao" : "trial";
const CONTRATANTE_NI = Deno.env.get("SERPRO_CONTRATANTE_NI") ?? "26764962000100";
const AUTOR_NI = Deno.env.get("SERPRO_AUTOR_NI") ?? "08801596000130";
// Eventos: a doc diz que o contratante é o próprio autor; se as procurações (no CNPJ autor) não valerem assim,
// a rotina tenta o outro modo sozinha quando TODAS as linhas voltam "x".
const EVENTOS_AUTOR_PADRAO = (Deno.env.get("SERPRO_EVENTOS_AUTOR") ?? "procurador") as "procurador" | "contratante";
const CNPJS_DA_CA = new Set([CONTRATANTE_NI, AUTOR_NI]);

const GATEWAY = "https://gateway.apiserpro.serpro.gov.br";
const BASE_URL = MODE === "producao" ? `${GATEWAY}/integra-contador/v1` : `${GATEWAY}/integra-contador-trial/v1`;
const TRIAL_BEARER = Deno.env.get("SERPRO_TRIAL_BEARER") ?? "06aef429-a981-3ec5-a1f8-71d38d86481e";
const TIMEOUT_MS = 28_000;
const RECENTE_MIN = 15; // consultar de novo antes disso pede confirmação (force)
const BASE_LEGAL = "LGPD art. 7º, V (execução de contrato) e II (obrigação legal/regulatória) — CA na qualidade de procuradora do contribuinte";

type Tipo = "Apoiar" | "Consultar" | "Declarar" | "Emitir" | "Monitorar";
type Categoria = "intimacao" | "malha" | "exclusao_simples" | "maed" | "cobranca" | "processo" | "informativo";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const onlyDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// ---------- Serpro: tokens (mesmo desenho do serpro-gateway) ----------
let sapiCache: { access: string; jwt: string; exp: number } | null = null;
let procuradorCache: { token: string; exp: number } | null = null;

async function getSapiTokens() {
  if (sapiCache && sapiCache.exp > Date.now() + 60_000) return sapiCache;
  const cert = Deno.env.get("SERPRO_CERT"), key = Deno.env.get("SERPRO_KEY");
  const ck = Deno.env.get("SERPRO_CONSUMER_KEY"), cs = Deno.env.get("SERPRO_CONSUMER_SECRET");
  if (!cert || !key || !ck || !cs) throw new Error("Segredos de produção do Serpro ausentes");
  const client = Deno.createHttpClient({ cert, key });
  const res = await fetch("https://autenticacao.sapi.serpro.gov.br/authenticate", {
    method: "POST",
    client,
    headers: { "Authorization": `Basic ${btoa(`${ck}:${cs}`)}`, "Role-Type": "TERCEIROS", "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  } as RequestInit);
  const body = await res.json().catch(() => ({}));
  client.close();
  if (!res.ok || !body.access_token || !body.jwt_token) throw new Error(`Falha na autenticação Serpro (HTTP ${res.status})`);
  sapiCache = { access: body.access_token, jwt: body.jwt_token, exp: Date.now() + Number(body.expires_in ?? 1800) * 1000 };
  return sapiCache;
}

async function getProcuradorToken(tokens: { access: string; jwt: string }) {
  if (AUTOR_NI === CONTRATANTE_NI) return null;
  if (procuradorCache && procuradorCache.exp > Date.now() + 60_000) return procuradorCache.token;
  const termo = Deno.env.get("SERPRO_TERMO_ASSINADO_B64");
  if (!termo) throw new Error("SERPRO_TERMO_ASSINADO_B64 ausente");
  const body = {
    contratante: { numero: CONTRATANTE_NI, tipo: 2 },
    autorPedidoDados: { numero: AUTOR_NI, tipo: 2 },
    contribuinte: { numero: AUTOR_NI, tipo: 2 },
    pedidoDados: { idSistema: "AUTENTICAPROCURADOR", idServico: "ENVIOXMLASSINADO81", versaoSistema: "1.0", dados: JSON.stringify({ xml: termo }) },
  };
  const res = await fetch(`${BASE_URL}/Apoiar`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${tokens.access}`, "jwt_token": tokens.jwt, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body),
  });
  let token: string | null = null;
  let exp = Date.now() + 6 * 3600_000;
  if (res.status === 304) {
    token = /autenticar_procurador_token:([^"]+)/.exec(res.headers.get("etag") ?? "")?.[1] ?? null;
    const e = Date.parse(res.headers.get("expires") ?? "");
    if (!Number.isNaN(e)) exp = e;
  } else if (res.ok) {
    const j = await res.json().catch(() => ({}));
    const d = typeof j.dados === "string" ? JSON.parse(j.dados) : j.dados;
    token = d?.autenticar_procurador_token ?? null;
    const e = Date.parse(`${d?.data_hora_expiracao ?? ""}-03:00`);
    if (!Number.isNaN(e)) exp = e;
  }
  if (!token) throw new Error(`Autentica Procurador falhou (HTTP ${res.status})`);
  procuradorCache = { token, exp };
  return token;
}

type Chamada = {
  tipo: Tipo; idSistema: string; idServico: string;
  contribuinte: { numero: string; tipo: number };
  dados: string;
  autor?: "procurador" | "contratante";
  uid: string | null; contactId?: string | null; origem: "manual" | "cron";
  finalidade: string;
};

// Uma chamada ao Serpro + registro em serpro_call_log. Nunca reenvia sozinha depois de 504.
async function serpro(c: Chamada) {
  const autorNi = c.autor === "contratante" ? CONTRATANTE_NI : AUTOR_NI;
  const body = {
    contratante: { numero: CONTRATANTE_NI, tipo: 2 },
    autorPedidoDados: { numero: autorNi, tipo: 2 },
    contribuinte: c.contribuinte,
    pedidoDados: { idSistema: c.idSistema, idServico: c.idServico, versaoSistema: "1.0", dados: c.dados },
  };
  const t0 = Date.now();
  let status = 0, responseId: string | null = null, resposta: any = null, mensagemCodigo: string | null = null;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json" };
    if (MODE === "producao") {
      const tokens = await getSapiTokens();
      headers["Authorization"] = `Bearer ${tokens.access}`;
      headers["jwt_token"] = tokens.jwt;
      if (c.autor !== "contratante") {
        const proc = await getProcuradorToken(tokens);
        if (proc) headers["autenticar_procurador_token"] = proc;
      }
    } else {
      headers["Authorization"] = `Bearer ${TRIAL_BEARER}`;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(`${BASE_URL}/${c.tipo}`, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal });
    clearTimeout(timer);
    status = res.status;
    responseId = res.headers.get("activityid");
    const texto = await res.text();
    try { resposta = texto ? JSON.parse(texto) : null; } catch { resposta = { raw: texto.slice(0, 2000) }; }
    if (resposta && typeof resposta.dados === "string") {
      try { resposta.dados = JSON.parse(resposta.dados); } catch { /* mantém string */ }
    }
    responseId = resposta?.responseId ?? responseId;
    mensagemCodigo = resposta?.mensagens?.[0]?.codigo ?? null;
  } catch (e) {
    const abortou = (e as Error)?.name === "AbortError";
    status = abortou ? 504 : 500;
    resposta = { error: abortou ? "Sem resposta do Serpro em 28 s. Não reenviar de imediato: a Receita pode ter concluído." : (e as Error).message };
  }
  const cobravel = MODE === "producao" ? (c.tipo !== "Apoiar" && c.tipo !== "Monitorar" && [200, 202, 403].includes(status)) : null;
  await supabase.from("serpro_call_log").insert({
    company_id: COMPANY_ID, ambiente: MODE, tipo_chamada: c.tipo, id_sistema: c.idSistema, id_servico: c.idServico,
    contribuinte_ni: c.contribuinte.tipo === 4 ? `lista(${c.contribuinte.numero.split(",").length})` : c.contribuinte.numero || null,
    contact_id: c.contactId ?? null, status_http: status, cobravel, duracao_ms: Date.now() - t0, response_id: responseId,
    mensagem_codigo: mensagemCodigo, acionado_por: c.uid, origem: c.origem, finalidade: c.finalidade, base_legal: BASE_LEGAL,
  });
  return { status, resposta, cobravel };
}

// ---------- helpers de mensagem ----------
function dataBR(yyyymmdd: unknown): string | null {
  const s = String(yyyymmdd ?? "");
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
}
function timestampBR(data: unknown, hora: unknown): string | null {
  const d = dataBR(data);
  if (!d) return null;
  const h = String(hora ?? "").padStart(6, "0");
  return `${d}T${h.slice(0, 2)}:${h.slice(2, 4)}:${h.slice(4, 6)}-03:00`;
}
function assuntoFinal(assunto: string, param: string | null) {
  return (assunto ?? "").replace("++VARIAVEL++", param ?? "").trim();
}
async function carregarRegras() {
  const { data } = await supabase.from("serpro_caixa_postal_regras").select("padrao,categoria")
    .eq("company_id", COMPANY_ID).eq("ativa", true).order("ordem");
  return (data ?? []).flatMap((r: any) => { try { return [{ re: new RegExp(r.padrao, "i"), categoria: r.categoria as Categoria }]; } catch { return []; } });
}
function classificar(assunto: string, regras: { re: RegExp; categoria: Categoria }[]): Categoria {
  return regras.find((r) => r.re.test(assunto))?.categoria ?? "informativo";
}

// ---------- ações ----------
async function consultar(payload: any, uid: string) {
  const contactId = String(payload.contact_id ?? "");
  const { data: contato } = await supabase.from("contacts").select("id,name,document").eq("id", contactId).eq("company_id", COMPANY_ID).maybeSingle();
  if (!contato) return json({ error: "Cliente não encontrado" }, 404);
  const cnpj = onlyDigits(contato.document);
  if (cnpj.length !== 14) return json({ error: "Cliente sem CNPJ válido" }, 400);
  const ponteiro = payload.ponteiro ? String(payload.ponteiro) : null;

  if (!payload.force && !ponteiro) {
    const { data: r } = await supabase.from("serpro_caixa_postal_resumo").select("consultado_em").eq("contact_id", contactId).maybeSingle();
    if (r?.consultado_em && Date.now() - Date.parse(r.consultado_em) < RECENTE_MIN * 60_000) {
      return json({ ok: true, recente: true, consultado_em: r.consultado_em, aviso: `Consultado há menos de ${RECENTE_MIN} min. Confirme para consultar de novo (nova cobrança).` });
    }
  }

  const dados = ponteiro
    ? { statusLeitura: "0", indicadorPagina: "1", ponteiroPagina: ponteiro }
    : { statusLeitura: "0", indicadorPagina: "0" };
  const r = await serpro({
    tipo: "Consultar", idSistema: "CAIXAPOSTAL", idServico: "MSGCONTRIBUINTE61",
    contribuinte: { numero: cnpj, tipo: 2 }, dados: JSON.stringify(dados),
    uid, contactId, origem: "manual",
    finalidade: "Consulta individual da lista de mensagens da Caixa Postal do e-CAC (sem ciência) para acompanhamento fiscal do cliente",
  });
  if (r.status === 403) return json({ ok: false, semProcuracao: true, status: 403, error: "Sem procuração eletrônica para a Caixa Postal deste cliente" });
  if (r.status !== 200) return json({ ok: false, status: r.status, error: r.resposta?.error ?? r.resposta?.mensagens?.[0]?.texto ?? "Falha na consulta ao Serpro" });

  const conteudo = r.resposta?.dados?.conteudo?.[0] ?? {};
  const lista: any[] = conteudo.listaMensagens ?? [];
  const regras = await carregarRegras();
  const isns = lista.map((m) => String(m.isn));
  const { data: existentes } = isns.length
    ? await supabase.from("serpro_caixa_postal_mensagens").select("isn").eq("contact_id", contactId).in("isn", isns)
    : { data: [] as any[] };
  const jaTinha = new Set((existentes ?? []).map((e: any) => e.isn));

  const linhas = lista.map((m) => {
    const assunto = assuntoFinal(m.assuntoModelo, m.valorParametroAssunto ?? null);
    return {
      company_id: COMPANY_ID, contact_id: contactId, isn: String(m.isn),
      numero_controle: m.numeroControle ?? null, codigo_modelo: m.codigoModelo != null ? String(m.codigoModelo) : null,
      assunto, data_envio: timestampBR(m.dataEnvio, m.horaEnvio),
      lida: String(m.indicadorLeitura) === "1", data_leitura: dataBR(m.dataLeitura), data_ciencia: dataBR(m.dataCiencia),
      data_validade: dataBR(m.dataValidade), relevancia: m.relevancia != null ? Number(m.relevancia) : null,
      tipo_origem: m.tipoOrigem != null ? Number(m.tipoOrigem) : null, descricao_origem: m.descricaoOrigem ?? null,
      categoria: classificar(assunto, regras), sincronizado_em: new Date().toISOString(),
    };
  });
  if (linhas.length) {
    const { error } = await supabase.from("serpro_caixa_postal_mensagens").upsert(linhas, { onConflict: "contact_id,isn" });
    if (error) return json({ ok: false, error: `Falha ao gravar: ${error.message}` }, 500);
  }

  const { count: total } = await supabase.from("serpro_caixa_postal_mensagens").select("id", { count: "exact", head: true }).eq("contact_id", contactId);
  const { count: naoLidas } = await supabase.from("serpro_caixa_postal_mensagens").select("id", { count: "exact", head: true }).eq("contact_id", contactId).eq("lida", false);
  await supabase.from("serpro_caixa_postal_resumo").upsert({
    contact_id: contactId, company_id: COMPANY_ID, consultado_em: new Date().toISOString(), consultado_por: uid,
    mensagens_salvas: total ?? 0, nao_lidas_salvas: naoLidas ?? 0,
  }, { onConflict: "contact_id" });

  return json({
    ok: true, cobravel: r.cobravel, baixadas: lista.length, novas: lista.filter((m) => !jaTinha.has(String(m.isn))).length,
    total_salvas: total ?? 0, nao_lidas: naoLidas ?? 0,
    ultima_pagina: conteudo.indicadorUltimaPagina !== "N", ponteiro_proxima: conteudo.ponteiroProximaPagina ?? null,
  });
}

async function abrir(payload: any, uid: string) {
  // Garantia no servidor: ler o corpo gera CIÊNCIA. Sem confirmação explícita, nada acontece.
  if (payload.ciencia_confirmada !== true) {
    return json({ error: "Ciência não confirmada. A abertura registra ciência da intimação e precisa de confirmação explícita." }, 400);
  }
  const { data: msg } = await supabase.from("serpro_caixa_postal_mensagens")
    .select("id,isn,contact_id,assunto,corpo,data_leitura,data_ciencia").eq("id", String(payload.mensagem_id ?? "")).eq("company_id", COMPANY_ID).maybeSingle();
  if (!msg) return json({ error: "Mensagem não encontrada" }, 404);
  if (msg.corpo) return json({ ok: true, jaAberta: true, corpo: msg.corpo });
  const { data: contato } = await supabase.from("contacts").select("document").eq("id", msg.contact_id).maybeSingle();
  const cnpj = onlyDigits(contato?.document);
  if (cnpj.length !== 14) return json({ error: "Cliente sem CNPJ válido" }, 400);

  const r = await serpro({
    tipo: "Consultar", idSistema: "CAIXAPOSTAL", idServico: "MSGDETALHAMENTO62",
    contribuinte: { numero: cnpj, tipo: 2 }, dados: JSON.stringify({ isn: msg.isn }),
    uid, contactId: msg.contact_id, origem: "manual",
    finalidade: "Abertura individual de mensagem da Caixa Postal com CIÊNCIA confirmada por usuário (art. 23 §2º III Dec. 70.235/72)",
  });
  if (r.status !== 200) return json({ ok: false, status: r.status, error: r.resposta?.error ?? r.resposta?.mensagens?.[0]?.texto ?? "Falha ao abrir a mensagem" });
  const m = r.resposta?.dados?.conteudo?.[0];
  if (!m?.corpoModelo) return json({ ok: false, error: "Serpro não devolveu o corpo da mensagem" });
  let corpo: string = String(m.corpoModelo);
  const vars: string[] = Array.isArray(m.variaveis) ? m.variaveis : [];
  corpo = corpo.replace(/\+\+(\d+)\+\+/g, (_x, n) => vars[Number(n) - 1] ?? "");

  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  await supabase.from("serpro_caixa_postal_mensagens").update({
    corpo, corpo_aberto_por: uid, corpo_aberto_em: new Date().toISOString(), lida: true,
    data_leitura: msg.data_leitura ?? hoje, data_ciencia: msg.data_ciencia ?? hoje,
  }).eq("id", msg.id);
  const { count: naoLidas } = await supabase.from("serpro_caixa_postal_mensagens").select("id", { count: "exact", head: true }).eq("contact_id", msg.contact_id).eq("lida", false);
  await supabase.from("serpro_caixa_postal_resumo").update({ nao_lidas_salvas: naoLidas ?? 0 }).eq("contact_id", msg.contact_id);
  return json({ ok: true, cobravel: r.cobravel, corpo });
}

async function acompanhar(payload: any, _uid: string) {
  const campos: Record<string, unknown> = {};
  if (["nova", "em_tratamento", "resolvida", "sem_acao"].includes(payload.situacao)) campos.situacao = payload.situacao;
  if ("responsavel_id" in payload) campos.responsavel_id = payload.responsavel_id || null;
  if ("observacoes" in payload) campos.observacoes = payload.observacoes ? String(payload.observacoes).slice(0, 4000) : null;
  if (typeof payload.visivel_portal === "boolean") campos.visivel_portal = payload.visivel_portal;
  if (!Object.keys(campos).length) return json({ error: "Nada para atualizar" }, 400);
  const { error } = await supabase.from("serpro_caixa_postal_mensagens").update(campos).eq("id", String(payload.mensagem_id ?? "")).eq("company_id", COMPANY_ID);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}

// Rotina diária: 2 chamadas /Monitorar (solicitar + obter), não cobradas, sem ciência. Até 1.000 CNPJs por chamada.
async function rotinaEventos(payload: any, uid: string | null, origem: "manual" | "cron") {
  if (!payload.forcar) {
    const desde = new Date(Date.now() - 12 * 3600_000).toISOString();
    const { count } = await supabase.from("serpro_call_log").select("id", { count: "exact", head: true })
      .eq("id_servico", "SOLICEVENTOSPJ132").gte("created_at", desde).gte("status_http", 200).lt("status_http", 300);
    if ((count ?? 0) > 0) return json({ ok: true, ignorado: "A rotina já rodou nas últimas 12 h." });
  }
  const { data: contatos } = await supabase.from("contacts").select("id,document").eq("company_id", COMPANY_ID).eq("is_active", true);
  let alvo = (contatos ?? []).map((c: any) => ({ id: c.id as string, cnpj: onlyDigits(c.document) }))
    .filter((c) => c.cnpj.length === 14 && !CNPJS_DA_CA.has(c.cnpj));
  if (payload.limite) alvo = alvo.slice(0, Math.min(Number(payload.limite), 1000));
  alvo = alvo.slice(0, 1000);
  if (!alvo.length) return json({ ok: true, ignorado: "Nenhum cliente com CNPJ" });
  const lista = alvo.map((c) => c.cnpj).join(",");
  const fin = "Detecção diária de mensagens novas na Caixa Postal (evento E0601, gratuito, sem ciência) para acompanhamento fiscal";

  async function rodar(autor: "procurador" | "contratante") {
    const s = await serpro({ tipo: "Monitorar", idSistema: "EVENTOSATUALIZACAO", idServico: "SOLICEVENTOSPJ132",
      contribuinte: { numero: lista, tipo: 4 }, dados: JSON.stringify({ evento: "E0601" }), autor, uid, origem, finalidade: fin });
    if (s.status !== 200) return { erro: `solicitar HTTP ${s.status}: ${s.resposta?.mensagens?.[0]?.texto ?? s.resposta?.error ?? ""}` };
    // "dados" pode chegar como objeto ou como texto (o trial devolve um JSON quebrado): lê dos dois jeitos.
    const d = s.resposta?.dados;
    const texto = typeof d === "string" ? d : JSON.stringify(d ?? {});
    // Produção devolve "Protocolo" (P maiúsculo); o trial devolve "protocolo". Aceita os dois.
    const protocolo = (d && typeof d === "object" && (d.Protocolo ?? d.protocolo)) || /"protocolo"\s*:\s*"([^"]+)"/i.exec(texto)?.[1];
    if (!protocolo) return { erro: `Serpro não devolveu o protocolo. Formato recebido: ${texto.slice(0, 300)}` };
    const tempoMs = Number((d && typeof d === "object" && (d.TempoEsperaMedioEmMs ?? d.tempoEsperaMedioEmMs)) || /"TempoEsperaMedioEmMs"\s*:\s*(\d+)/i.exec(texto)?.[1] || 3000);
    await sleep(Math.max(tempoMs, 3000) + 1500);
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      const o = await serpro({ tipo: "Monitorar", idSistema: "EVENTOSATUALIZACAO", idServico: "OBTEREVENTOSPJ134",
        contribuinte: { numero: "", tipo: 4 }, dados: JSON.stringify({ protocolo, evento: "E0601" }), autor, uid, origem, finalidade: fin });
      let matriz: any = o.resposta?.dados;
      if (typeof matriz === "string") { try { matriz = JSON.parse(matriz); } catch { /* segue */ } }
      if (matriz && !Array.isArray(matriz) && Array.isArray(matriz.elementos)) matriz = matriz.elementos;
      if (o.status === 200 && Array.isArray(matriz)) return { linhas: matriz as [string, string][] };
      if (o.status === 200) return { erro: `Formato inesperado no resultado dos eventos: ${JSON.stringify(o.resposta?.dados ?? null).slice(0, 300)}` };
      if (![202, 204].includes(o.status)) return { erro: `obter HTTP ${o.status}: ${o.resposta?.mensagens?.[0]?.texto ?? o.resposta?.error ?? ""}` };
      await sleep(4000);
    }
    return { erro: "Resultado não ficou pronto a tempo (nova rodada amanhã ou use forcar)" };
  }

  let modo = EVENTOS_AUTOR_PADRAO;
  let res = await rodar(modo);
  if ("linhas" in res && res.linhas!.length && res.linhas!.every((l) => l[1] === "x") && !payload.semFallback) {
    modo = modo === "procurador" ? "contratante" : "procurador";
    const alt = await rodar(modo);
    if ("linhas" in alt && alt.linhas!.some((l) => l[1] !== "x")) res = alt; else modo = modo === "procurador" ? "contratante" : "procurador";
  }
  if (!("linhas" in res)) return json({ ok: false, error: res.erro });

  const porCnpj = new Map(alvo.map((c) => [c.cnpj, c.id]));
  const agora = new Date().toISOString();
  let semProcuracao = 0, comEvento = 0, semEvento = 0;
  const linhas: any[] = [];
  const ausentes: string[] = [];
  const ativos: string[] = [];
  for (const [cnpj, d] of res.linhas!) {
    const id = porCnpj.get(onlyDigits(cnpj));
    if (!id) continue;
    if (d === "x") { semProcuracao++; ausentes.push(id); linhas.push({ contact_id: id, company_id: COMPANY_ID, evento_verificado_em: agora }); continue; }
    ativos.push(id);
    let data: string | null = null;
    if (/^\d{6}$/.test(d)) { data = `20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}`; comEvento++; } else semEvento++;
    linhas.push({ contact_id: id, company_id: COMPANY_ID, evento_ultima_data: data, evento_verificado_em: agora });
  }
  if (linhas.length) await supabase.from("serpro_caixa_postal_resumo").upsert(linhas, { onConflict: "contact_id" });
  // Bônus grátis: o "x" e o dado atualizam o mapa de procurações (código 00006, sonda da Caixa Postal)
  const marca = (ids: string[], status: "ativa" | "ausente") => ids.length ? supabase.from("serpro_procuracoes").upsert(
    ids.map((id) => ({ company_id: COMPANY_ID, contact_id: id, codigo_procuracao: "00006", status, verificado_em: agora, fonte: "sonda_caixa_postal", resposta: { servico: "EVENTOSATUALIZACAO.E0601" } })),
    { onConflict: "contact_id,codigo_procuracao" }) : Promise.resolve();
  await marca(ausentes, "ausente");
  await marca(ativos, "ativa");
  return json({ ok: true, modo_autor: modo, consultados: res.linhas!.length, com_evento: comEvento, sem_evento: semEvento, sem_procuracao: semProcuracao });
}

function jwtRole(token: string): string | null {
  try {
    const p = token.split(".")[1];
    return JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")))?.role ?? null;
  } catch { return null; }
}

// ---------- entrada ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const payload = await req.json().catch(() => ({}));
  const action: string = payload.action;

  // Cron chama com a chave anon (padrão do projeto). Só a rotina de eventos aceita isso, e ela tem trava de 12 h.
  // A assinatura do JWT já foi validada pela plataforma (verify_jwt); aqui só se lê o papel. O ambiente da função
  // pode ter a chave anon em formato novo (sb_publishable_), então comparar o texto da chave não basta.
  if (action === "rotina_eventos" && (bearer === Deno.env.get("SUPABASE_ANON_KEY") || jwtRole(bearer) === "anon")) {
    return await rotinaEventos({ ...payload, forcar: false, limite: undefined }, null, "cron");
  }

  const { data: userData } = await supabase.auth.getUser(bearer);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "Não autenticado" }, 401);
  const { data: perfil } = await supabase.from("profiles").select("role,is_super_admin,company_id").eq("user_id", uid).maybeSingle();
  const admin = perfil?.is_super_admin === true || (perfil?.role === "admin" && perfil?.company_id === COMPANY_ID);
  const equipe = admin || (perfil?.role === "colaborador" && perfil?.company_id === COMPANY_ID);
  if (!equipe) return json({ error: "Sem permissão" }, 403);

  switch (action) {
    case "consultar": return await consultar(payload, uid);
    case "abrir": return await abrir(payload, uid);
    case "acompanhar": return await acompanhar(payload, uid);
    case "rotina_eventos":
      if (!admin) return json({ error: "Só administradores rodam a rotina manualmente" }, 403);
      return await rotinaEventos(payload, uid, "manual");
    default: return json({ error: "action inválida (consultar | abrir | acompanhar | rotina_eventos)" }, 400);
  }
});
