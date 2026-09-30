import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// ---------------------------------------------------------------------------
// Gateway único do Serpro Integra Contador (F4, Onda 0 — 29/09/2026).
//
// Todo acesso ao Serpro passa por aqui: o navegador (nem o do cliente, no futuro portal) nunca
// chama o Serpro. Responsabilidades: autenticar, montar o body, aplicar allowlist, registrar
// TODA chamada em serpro_call_log (contrato Serpro cl. 3.1.5.2: acessos, finalidade e base legal)
// e nunca reenviar sozinho depois de 504 (a Receita pode ter concluído — doc "timeout").
//
// SERPRO_MODE = "trial" (padrão): endpoint de demonstração com dados simulados, sem credencial.
// SERPRO_MODE = "producao": mTLS com e-CNPJ do contratante + Consumer Key/Secret + Autentica
//   Procurador (procurações estão no CNPJ do autor, não no contratante). NÃO TESTADO em produção.
//
// Ações: "health" (config, sem segredo) e "chamar".
// Escrita na Receita ("Declarar") está BLOQUEADA nesta versão (fase final, dupla checagem humana).
// ---------------------------------------------------------------------------

const COMPANY_ID = "5cd08fcd-c095-4f08-b3a8-c02b9bf1034e";

const MODE: "trial" | "producao" = Deno.env.get("SERPRO_MODE") === "producao" ? "producao" : "trial";
const CONTRATANTE_NI = Deno.env.get("SERPRO_CONTRATANTE_NI") ?? "26764962000100"; // ALVES ASSESSORIA E SERVICOS LTDA (contrato Serpro)
const AUTOR_NI = Deno.env.get("SERPRO_AUTOR_NI") ?? "08801596000130"; // CNPJ que recebeu as procurações no e-CAC

const GATEWAY = "https://gateway.apiserpro.serpro.gov.br";
const BASE_URL = MODE === "producao" ? `${GATEWAY}/integra-contador/v1` : `${GATEWAY}/integra-contador-trial/v1`;
// Bearer publicado na documentação do trial (dados simulados). Não é segredo.
const TRIAL_BEARER = Deno.env.get("SERPRO_TRIAL_BEARER") ?? "06aef429-a981-3ec5-a1f8-71d38d86481e";

const TIMEOUT_MS = 28_000; // teto do gateway Serpro é 30 s

type Tipo = "Apoiar" | "Consultar" | "Declarar" | "Emitir" | "Monitorar";

// Allowlist = escopo aprovado em 29/09/2026 (relatório serpro-integra-contador-oportunidades-set2026, seção 10).
// "Declarar" está listado só pra ser recusado com mensagem clara.
const CATALOGO: Record<string, Tipo> = {};
function reg(sistema: string, tipo: Tipo, servicos: string[]) {
  for (const s of servicos) CATALOGO[`${sistema}.${s}`] = tipo;
}
reg("PROCURACOES", "Consultar", ["OBTERPROCURACAO41"]);
reg("DTE", "Consultar", ["CONSULTASITUACAODTE111"]);
// MSGDETALHAMENTO62 (ler o corpo da mensagem) NÃO entra aqui de propósito: caracteriza CIÊNCIA da intimação
// (art. 23, § 2º, III, Decreto 70.235/1972) e marca a mensagem como lida. Só a função dedicada da Caixa Postal
// pode chamá-lo, com confirmação individual e registro de quem abriu (decisão de Gabriel, 30/09/2026).
reg("CAIXAPOSTAL", "Consultar", ["MSGCONTRIBUINTE61"]);
reg("CAIXAPOSTAL", "Monitorar", ["INNOVAMSG63"]);
reg("EVENTOSATUALIZACAO", "Monitorar", ["SOLICEVENTOSPJ132", "OBTEREVENTOSPJ134"]);
reg("PAGTOWEB", "Consultar", ["PAGAMENTOS71", "CONTACONSDOCARRPG73"]);
reg("PAGTOWEB", "Emitir", ["COMPARRECADACAO72"]);
reg("PGDASD", "Consultar", ["CONSDECLARACAO13", "CONSULTIMADECREC14", "CONSDECREC15", "CONSEXTRATO16"]);
reg("PGDASD", "Emitir", ["GERARDAS12", "GERARDASCOBRANCA17", "GERARDASPROCESSO18", "GERARDASAVULSO19"]);
reg("REGIMEAPURACAO", "Consultar", ["CONSULTARANOSCALENDARIOS102", "CONSULTAROPCAOREGIME103", "CONSULTARRESOLUCAO104"]);
reg("DEFIS", "Consultar", ["CONSDECLARACAO142", "CONSULTIMADECREC143", "CONSDECREC144"]);
for (const [sis, n] of [["PARCSN", 16], ["PARCSN-ESP", 17], ["PERTSN", 18], ["RELPSN", 19]] as const) {
  reg(sis, "Emitir", [`GERARDAS${n}1`]);
  reg(sis, "Consultar", [`PARCELASPARAGERAR${n}2`, `PEDIDOSPARC${n}3`, `OBTERPARC${n}4`, `DETPAGTOPARC${n}5`]);
}
reg("SITFIS", "Apoiar", ["SOLICITARPROTOCOLO91"]);
reg("SITFIS", "Emitir", ["RELATORIOSITFIS92"]);
reg("SICALC", "Emitir", ["CONSOLIDARGERARDARF51", "GERARDARFCODBARRA53"]);
reg("SICALC", "Apoiar", ["CONSULTAAPOIORECEITAS52"]);
reg("EPROCESSO", "Consultar", ["CONSPROCPORINTER271"]);
reg("DCTFWEB", "Consultar", ["CONSRECIBO32", "CONSDECCOMPLETA33", "CONSXMLDECLARACAO38"]);
reg("DCTFWEB", "Emitir", ["GERARGUIA31", "GERARGUIAANDAMENTO313"]);
reg("MIT", "Apoiar", ["SITUACAOENC315"]);
reg("MIT", "Consultar", ["CONSAPURACAO316", "LISTAAPURACOES317"]);
reg("PNRCONTADOR", "Consultar", ["CONSVINCULOS261", "CONSRENUNCIA263", "SITSOLICRENUNCIA265"]);
reg("PNRCONTADOR", "Emitir", ["COMPRENUNCIA264"]);
// Escrita na Receita — bloqueada
reg("PGDASD", "Declarar", ["TRANSDECLARACAO11"]);
reg("DEFIS", "Declarar", ["TRANSDECLARACAO141"]);
reg("REGIMEAPURACAO", "Declarar", ["EFETUAROPCAOREGIME101"]);
reg("DCTFWEB", "Declarar", ["TRANSDECLARACAO310"]);
reg("MIT", "Declarar", ["ENCAPURACAO314"]);
reg("PNRCONTADOR", "Declarar", ["SOLICRENUNCIA262"]);

// Finalidade/base legal padrão (LGPD art. 7º, II e V) — o chamador pode detalhar, nunca omitir.
const FINALIDADE_PADRAO = "Prestação de serviços contábeis e fiscais ao cliente (obrigações acessórias e principais junto à Receita Federal)";
const BASE_LEGAL_PADRAO = "LGPD art. 7º, V (execução de contrato) e II (obrigação legal/regulatória) — CA na qualidade de procuradora do contribuinte";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const onlyDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

// ---------- Produção: tokens (em memória do isolate; reautentica quando expira) ----------
let sapiCache: { access: string; jwt: string; exp: number } | null = null;
let procuradorCache: { token: string; exp: number } | null = null;

async function getSapiTokens() {
  if (sapiCache && sapiCache.exp > Date.now() + 60_000) return sapiCache;
  const cert = Deno.env.get("SERPRO_CERT");
  const key = Deno.env.get("SERPRO_KEY");
  const ck = Deno.env.get("SERPRO_CONSUMER_KEY");
  const cs = Deno.env.get("SERPRO_CONSUMER_SECRET");
  if (!cert || !key || !ck || !cs) throw new Error("Segredos de produção ausentes (SERPRO_CERT, SERPRO_KEY, SERPRO_CONSUMER_KEY, SERPRO_CONSUMER_SECRET)");
  // node:https NÃO faz mTLS no edge runtime — só Deno.createHttpClient (ver memória mtls-supabase-edge)
  const client = Deno.createHttpClient({ cert, key });
  const res = await fetch("https://autenticacao.sapi.serpro.gov.br/authenticate", {
    method: "POST",
    client,
    headers: {
      "Authorization": `Basic ${btoa(`${ck}:${cs}`)}`,
      "Role-Type": "TERCEIROS",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  } as RequestInit);
  const body = await res.json().catch(() => ({}));
  client.close();
  if (!res.ok || !body.access_token || !body.jwt_token) {
    throw new Error(`Falha na autenticação Serpro (HTTP ${res.status})`);
  }
  sapiCache = { access: body.access_token, jwt: body.jwt_token, exp: Date.now() + Number(body.expires_in ?? 1800) * 1000 };
  return sapiCache;
}

// Autentica Procurador: o CNPJ AUTOR (com as procurações) assina um Termo XML; o Serpro devolve um token
// válido até a meia-noite do dia seguinte. Reenvio do mesmo termo válido responde 304 com o token no header etag.
async function getProcuradorToken(tokens: { access: string; jwt: string }) {
  if (AUTOR_NI === CONTRATANTE_NI) return null;
  if (procuradorCache && procuradorCache.exp > Date.now() + 60_000) return procuradorCache.token;
  const termo = Deno.env.get("SERPRO_TERMO_ASSINADO_B64");
  if (!termo) throw new Error("SERPRO_TERMO_ASSINADO_B64 ausente (Termo de Autorização assinado pelo CNPJ autor)");
  const body = {
    contratante: { numero: CONTRATANTE_NI, tipo: 2 },
    autorPedidoDados: { numero: AUTOR_NI, tipo: 2 },
    contribuinte: { numero: AUTOR_NI, tipo: 2 },
    pedidoDados: {
      idSistema: "AUTENTICAPROCURADOR",
      idServico: "ENVIOXMLASSINADO81",
      versaoSistema: "1.0",
      dados: JSON.stringify({ xml: termo }),
    },
  };
  const res = await fetch(`${BASE_URL}/Apoiar`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${tokens.access}`, "jwt_token": tokens.jwt, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body),
  });
  let token: string | null = null;
  let exp = Date.now() + 6 * 3600_000;
  if (res.status === 304) {
    const m = /autenticar_procurador_token:([^"]+)/.exec(res.headers.get("etag") ?? "");
    token = m?.[1] ?? null;
    const e = Date.parse(res.headers.get("expires") ?? "");
    if (!Number.isNaN(e)) exp = e;
  } else if (res.ok) {
    const j = await res.json().catch(() => ({}));
    const d = typeof j.dados === "string" ? JSON.parse(j.dados) : j.dados;
    token = d?.autenticar_procurador_token ?? null;
    // data_hora_expiracao vem sem fuso (horário de Brasília)
    const e = Date.parse(`${d?.data_hora_expiracao ?? ""}-03:00`);
    if (!Number.isNaN(e)) exp = e;
  }
  if (!token) throw new Error(`Autentica Procurador falhou (HTTP ${res.status})`);
  procuradorCache = { token, exp };
  return token;
}

// ---------- Handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Só admin do escritório (ou super admin) chama o gateway. verify_jwt garante token válido; aqui checamos o papel.
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData } = await supabase.auth.getUser(bearer);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "Não autenticado" }, 401);
  const { data: profile } = await supabase.from("profiles").select("role,is_super_admin,company_id").eq("user_id", uid).maybeSingle();
  const autorizado = profile?.is_super_admin === true || (profile?.role === "admin" && profile?.company_id === COMPANY_ID);
  if (!autorizado) return json({ error: "Sem permissão" }, 403);

  const payload = await req.json().catch(() => ({}));
  const action: string = payload.action;

  if (action === "health") {
    return json({
      modo: MODE,
      base_url: BASE_URL,
      contratante: CONTRATANTE_NI,
      autor: AUTOR_NI,
      usa_autentica_procurador: AUTOR_NI !== CONTRATANTE_NI,
      segredos_producao: {
        cert: !!Deno.env.get("SERPRO_CERT"),
        key: !!Deno.env.get("SERPRO_KEY"),
        consumer_key: !!Deno.env.get("SERPRO_CONSUMER_KEY"),
        consumer_secret: !!Deno.env.get("SERPRO_CONSUMER_SECRET"),
        termo_autorizacao: !!Deno.env.get("SERPRO_TERMO_ASSINADO_B64"),
      },
      servicos_liberados: Object.entries(CATALOGO).filter(([, t]) => t !== "Declarar").length,
    });
  }

  if (action !== "chamar") return json({ error: "action inválida (use 'health' ou 'chamar')" }, 400);

  const idSistema = String(payload.idSistema ?? "").toUpperCase();
  const idServico = String(payload.idServico ?? "").toUpperCase();
  const tipo = CATALOGO[`${idSistema}.${idServico}`];
  if (!tipo) return json({ error: `Serviço fora do escopo aprovado: ${idSistema}.${idServico}` }, 400);
  if (tipo === "Declarar") {
    return json({ error: "Escrita na Receita (Declarar) está desativada nesta versão. Fase final, com dupla checagem humana." }, 403);
  }

  const contribuinteNi = onlyDigits(payload.contribuinte?.numero);
  const contribuinteTipo = Number(payload.contribuinte?.tipo ?? (contribuinteNi.length === 11 ? 1 : 2));
  if (![11, 14].includes(contribuinteNi.length) && !payload.contribuinte?.lista) {
    return json({ error: "contribuinte.numero inválido (CPF 11 ou CNPJ 14 dígitos)" }, 400);
  }

  // Só cliente com status "Ativo" gera chamada em produção (decisão de Gabriel, 01/10/2026): cliente suspenso por falta de
  // pagamento ("Suspensa - Contabilidade"), ex-cliente, baixado etc. é recusado. Os CNPJs da própria CA e números que não
  // são cliente cadastrado passam. O status é lido do cadastro a cada chamada.
  if (MODE === "producao" && contribuinteNi && contribuinteNi !== CONTRATANTE_NI && contribuinteNi !== AUTOR_NI) {
    const formatado = contribuinteNi.length === 14
      ? contribuinteNi.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
      : contribuinteNi.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    const cid = /^[0-9a-f-]{36}$/i.test(String(payload.contact_id ?? "")) ? String(payload.contact_id) : null;
    const { data: cadastro } = await supabase.from("contacts").select("status_cliente")
      .eq("company_id", COMPANY_ID).or(`document.eq.${contribuinteNi},document.eq.${formatado}${cid ? `,id.eq.${cid}` : ""}`);
    if (cadastro?.length && !cadastro.some((c: { status_cliente: string | null }) => c.status_cliente === "Ativo")) {
      return json({
        error: `Cliente fora do monitoramento (status: ${cadastro[0].status_cliente ?? "sem status"}). O Serpro só é consultado para clientes com status "Ativo".`,
        fora_do_monitoramento: true,
      }, 403);
    }
  }

  const dados = typeof payload.dados === "string" ? payload.dados : payload.dados == null ? "" : JSON.stringify(payload.dados);
  // No trial os números reais não importam (dados simulados); permite override pra usar os números do manual.
  const contratanteNi = MODE === "trial" && payload.trial_contratante ? onlyDigits(payload.trial_contratante) : CONTRATANTE_NI;
  const autorNi = MODE === "trial" && payload.trial_autor ? onlyDigits(payload.trial_autor) : AUTOR_NI;

  const body = {
    contratante: { numero: contratanteNi, tipo: 2 },
    autorPedidoDados: { numero: autorNi, tipo: autorNi.length === 11 ? 1 : 2 },
    contribuinte: { numero: contribuinteNi, tipo: contribuinteTipo },
    pedidoDados: { idSistema, idServico, versaoSistema: String(payload.versaoSistema ?? "1.0"), dados },
  };

  const t0 = Date.now();
  let status = 0;
  let responseId: string | null = null;
  let resposta: any = null;
  let mensagemCodigo: string | null = null;

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json" };
    if (MODE === "producao") {
      const tokens = await getSapiTokens();
      headers["Authorization"] = `Bearer ${tokens.access}`;
      headers["jwt_token"] = tokens.jwt;
      const proc = await getProcuradorToken(tokens);
      if (proc) headers["autenticar_procurador_token"] = proc;
    } else {
      headers["Authorization"] = `Bearer ${TRIAL_BEARER}`;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(`${BASE_URL}/${tipo}`, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal });
    clearTimeout(timer);
    status = res.status;
    responseId = res.headers.get("activityid") ?? res.headers.get("x-request-id");
    const texto = await res.text();
    try { resposta = texto ? JSON.parse(texto) : null; } catch { resposta = { raw: texto.slice(0, 2000) }; }
    // "dados" chega como string JSON escapada
    if (resposta && typeof resposta.dados === "string") {
      try { resposta.dados = JSON.parse(resposta.dados); } catch { /* mantém string (ex.: base64 de PDF) */ }
    }
    mensagemCodigo = resposta?.mensagens?.[0]?.codigo ?? null;
  } catch (e) {
    const abortou = (e as Error)?.name === "AbortError";
    status = abortou ? 504 : 500;
    resposta = {
      error: abortou
        ? "Sem resposta do Serpro em 28 s. NÃO reenviar de imediato: a Receita pode ter concluído. Consulte o status antes."
        : (e as Error).message,
    };
  }

  const cobravel = MODE === "producao" ? (tipo !== "Apoiar" && tipo !== "Monitorar" && [200, 202, 403].includes(status)) : null;
  await supabase.from("serpro_call_log").insert({
    company_id: COMPANY_ID,
    ambiente: MODE,
    tipo_chamada: tipo,
    id_sistema: idSistema,
    id_servico: idServico,
    contribuinte_ni: contribuinteNi || null,
    contact_id: payload.contact_id ?? null,
    status_http: status,
    cobravel,
    duracao_ms: Date.now() - t0,
    response_id: responseId,
    mensagem_codigo: mensagemCodigo,
    acionado_por: uid,
    origem: payload.origem ?? "manual",
    finalidade: payload.finalidade ?? FINALIDADE_PADRAO,
    base_legal: payload.base_legal ?? BASE_LEGAL_PADRAO,
  });

  // Sempre HTTP 200 aqui: o status do Serpro vai dentro do corpo (supabase.functions.invoke esconde o corpo de respostas não-2xx).
  return json({ status, tipo, ambiente: MODE, cobravel, resposta });
});
