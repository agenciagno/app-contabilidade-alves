// Núcleo compartilhado das funções Serpro (Integra Contador): autenticação (mTLS + Autentica Procurador),
// chamada com registro em serpro_call_log e o fluxo de Eventos de Atualização (solicitar + obter).
// Criado em 01/10/2026 para a Onda 1 (Pagamentos) e reaproveitado pelas ondas seguintes.
// serpro-gateway e serpro-caixa-postal ainda têm cópia própria deste código (já testado em produção);
// migrar os dois para cá é uma tarefa à parte, sem pressa.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type Tipo = "Apoiar" | "Consultar" | "Declarar" | "Emitir" | "Monitorar";

export interface Chamada {
  tipo: Tipo;
  idSistema: string;
  idServico: string;
  contribuinte: { numero: string; tipo: number };
  dados: string;
  autor?: "procurador" | "contratante";
  uid: string | null;
  contactId?: string | null;
  origem: "manual" | "cron";
  finalidade: string;
  /** versaoSistema do serviço; o padrão "1.0" vale para quase todos (SITFIS usa "2.0"). */
  versao?: string;
}

export const onlyDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Só o papel do JWT (a assinatura já foi validada pela plataforma, verify_jwt). Usado para reconhecer o agendador (anon). */
export function jwtRole(token: string): string | null {
  try {
    const p = token.split(".")[1];
    return JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")))?.role ?? null;
  } catch { return null; }
}

export function criarSerpro(supabase: SupabaseClient, companyId: string) {
  const MODE: "trial" | "producao" = Deno.env.get("SERPRO_MODE") === "producao" ? "producao" : "trial";
  const CONTRATANTE_NI = Deno.env.get("SERPRO_CONTRATANTE_NI") ?? "26764962000100";
  const AUTOR_NI = Deno.env.get("SERPRO_AUTOR_NI") ?? "08801596000130";
  const EVENTOS_AUTOR_PADRAO = (Deno.env.get("SERPRO_EVENTOS_AUTOR") ?? "procurador") as "procurador" | "contratante";
  const GATEWAY = "https://gateway.apiserpro.serpro.gov.br";
  const BASE_URL = MODE === "producao" ? `${GATEWAY}/integra-contador/v1` : `${GATEWAY}/integra-contador-trial/v1`;
  const TRIAL_BEARER = Deno.env.get("SERPRO_TRIAL_BEARER") ?? "06aef429-a981-3ec5-a1f8-71d38d86481e";
  const TIMEOUT_MS = 28_000;
  const BASE_LEGAL = "LGPD art. 7º, V (execução de contrato) e II (obrigação legal/regulatória) — CA na qualidade de procuradora do contribuinte";

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

  // Uma chamada ao Serpro + registro em serpro_call_log. Nunca reenvia sozinha depois de 504.
  async function serpro(c: Chamada) {
    const autorNi = c.autor === "contratante" ? CONTRATANTE_NI : AUTOR_NI;
    const body = {
      contratante: { numero: CONTRATANTE_NI, tipo: 2 },
      autorPedidoDados: { numero: autorNi, tipo: 2 },
      contribuinte: c.contribuinte,
      pedidoDados: { idSistema: c.idSistema, idServico: c.idServico, versaoSistema: c.versao ?? "1.0", dados: c.dados },
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
      company_id: companyId, ambiente: MODE, tipo_chamada: c.tipo, id_sistema: c.idSistema, id_servico: c.idServico,
      contribuinte_ni: c.contribuinte.tipo === 4 ? `lista(${c.contribuinte.numero.split(",").length})` : c.contribuinte.numero || null,
      contact_id: c.contactId ?? null, status_http: status, cobravel, duracao_ms: Date.now() - t0, response_id: responseId,
      mensagem_codigo: mensagemCodigo, acionado_por: c.uid, origem: c.origem, finalidade: c.finalidade, base_legal: BASE_LEGAL,
    });
    return { status, resposta, cobravel };
  }

  /**
   * Eventos de Atualização de PJ (grátis, /Monitorar): solicitar + obter, até 1.000 CNPJs por chamada.
   * Devolve [[cnpj, "AAMMDD" | "" | "x"]]: "" = sem atualização, "x" = sem procuração. Resultado é "pega e apaga" (20 min).
   * Se todas as linhas voltam "x", tenta o outro modo de autor sozinho (mesma lógica da rotina da Caixa Postal).
   */
  async function eventosPJ(p: {
    evento: string; cnpjs: string[]; finalidade: string; uid: string | null; origem: "manual" | "cron"; semFallback?: boolean;
  }): Promise<{ linhas: [string, string][]; modo: "procurador" | "contratante" } | { erro: string }> {
    const lista = p.cnpjs.join(",");

    async function rodar(autor: "procurador" | "contratante"): Promise<{ linhas: [string, string][] } | { erro: string }> {
      const s = await serpro({
        tipo: "Monitorar", idSistema: "EVENTOSATUALIZACAO", idServico: "SOLICEVENTOSPJ132",
        contribuinte: { numero: lista, tipo: 4 }, dados: JSON.stringify({ evento: p.evento }), autor, uid: p.uid, origem: p.origem, finalidade: p.finalidade,
      });
      if (s.status !== 200) return { erro: `solicitar HTTP ${s.status}: ${s.resposta?.mensagens?.[0]?.texto ?? s.resposta?.error ?? ""}` };
      const d = s.resposta?.dados;
      const texto = typeof d === "string" ? d : JSON.stringify(d ?? {});
      // Produção devolve "Protocolo" (P maiúsculo); o trial devolve "protocolo". Aceita os dois.
      const protocolo = (d && typeof d === "object" && (d.Protocolo ?? d.protocolo)) || /"protocolo"\s*:\s*"([^"]+)"/i.exec(texto)?.[1];
      if (!protocolo) return { erro: `Serpro não devolveu o protocolo. Formato recebido: ${texto.slice(0, 300)}` };
      const tempoMs = Number((d && typeof d === "object" && (d.TempoEsperaMedioEmMs ?? d.tempoEsperaMedioEmMs)) || /"TempoEsperaMedioEmMs"\s*:\s*(\d+)/i.exec(texto)?.[1] || 3000);
      await sleep(Math.max(tempoMs, 3000) + 1500);
      for (let tentativa = 0; tentativa < 4; tentativa++) {
        const o = await serpro({
          tipo: "Monitorar", idSistema: "EVENTOSATUALIZACAO", idServico: "OBTEREVENTOSPJ134",
          contribuinte: { numero: "", tipo: 4 }, dados: JSON.stringify({ protocolo, evento: p.evento }), autor, uid: p.uid, origem: p.origem, finalidade: p.finalidade,
        });
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
    if ("linhas" in res && res.linhas.length && res.linhas.every((l) => l[1] === "x") && !p.semFallback) {
      modo = modo === "procurador" ? "contratante" : "procurador";
      const alt = await rodar(modo);
      if ("linhas" in alt && alt.linhas.some((l) => l[1] !== "x")) res = alt; else modo = modo === "procurador" ? "contratante" : "procurador";
    }
    return "linhas" in res ? { linhas: res.linhas, modo } : res;
  }

  return { MODE, CONTRATANTE_NI, AUTOR_NI, serpro, eventosPJ };
}
