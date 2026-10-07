import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { criarSerpro, jwtRole, onlyDigits } from "../_shared/serpro-core.ts";
import { perfilAtivo } from "../_shared/acesso.ts";

// ---------------------------------------------------------------------------
// Caixa Postal do e-CAC (Serpro Integra Contador) — F4 Fase A, 30/09/2026.
//
// Ações:
//   consultar        { contact_id, force?, ponteiro? }  baixa a LISTA de mensagens de UM cliente (MSGCONTRIBUINTE61,
//                    cobrado, NÃO gera ciência). Guarda, classifica por regra e atualiza o resumo.
//   abrir            { mensagem_id, ciencia_confirmada: true }  lê o CORPO de UMA mensagem (MSGDETALHAMENTO62).
//                    GERA CIÊNCIA da intimação (art. 23 §2º III, Dec. 70.235/72). Só com confirmação explícita.
//   acompanhar       { mensagem_id, situacao?, responsavel_id?, observacoes?, visivel_portal? }
//   acompanhar_cliente { contact_id, observacoes }   (bloco de notas do cliente, Termos de Intimação)
//   avisar           { mensagem_id, canal: email|whatsapp|copiar, mensagem, assunto? }  avisa o CLIENTE (nunca envia o corpo da
//                    intimação); e-mail sai daqui, WhatsApp/copiar só registram o histórico.
//   rotina_eventos   rotina diária (07:30 BRT, cron): EVENTOSATUALIZACAO E0601, grátis (/Monitorar), sem ciência.
//                    { limite?: n } (teste com poucos CNPJs) · { forcar?: true } (ignora a trava de 12 h)
//
// Sem lote na tela: cada consulta é de um cliente por vez. Nada aqui lê corpo em lote.
// Toda chamada ao Serpro é registrada em serpro_call_log (finalidade, base legal, quem pediu).
// Autenticação, chamada e registro em serpro_call_log vêm do núcleo _shared/serpro-core.ts (mesmo SERPRO_MODE das outras funções).
// ---------------------------------------------------------------------------

const COMPANY_ID = "5cd08fcd-c095-4f08-b3a8-c02b9bf1034e";
const RECENTE_MIN = 15; // consultar de novo antes disso pede confirmação (force)
// Só cliente com status "Ativo" entra na rotina e nas consultas (decisão de Gabriel, 01/10/2026): suspenso por falta de
// pagamento ("Suspensa - Contabilidade"), ex-cliente, baixado, inapto etc. não geram nenhuma chamada ao Serpro.
// O status é lido do cadastro a cada chamada, então mudar o cadastro muda o comportamento na hora.
const STATUS_MONITORADO = "Ativo";
const msgForaMonitoramento = (status: string | null) =>
  `Cliente fora do monitoramento (status: ${status ?? "sem status"}). O Serpro só é consultado para clientes com status "${STATUS_MONITORADO}".`;

type Categoria = "intimacao" | "malha" | "exclusao_simples" | "maed" | "cobranca" | "processo" | "informativo";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const { serpro, eventosPJ, CONTRATANTE_NI, AUTOR_NI } = criarSerpro(supabase, COMPANY_ID);
const CNPJS_DA_CA = new Set([CONTRATANTE_NI, AUTOR_NI]);

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
  const { data: contato } = await supabase.from("contacts").select("id,name,document,status_cliente").eq("id", contactId).eq("company_id", COMPANY_ID).maybeSingle();
  if (!contato) return json({ error: "Cliente não encontrado" }, 404);
  if (contato.status_cliente !== STATUS_MONITORADO) return json({ ok: false, foraDoMonitoramento: true, error: msgForaMonitoramento(contato.status_cliente) });
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
  const { data: contato } = await supabase.from("contacts").select("document,status_cliente").eq("id", msg.contact_id).maybeSingle();
  if (contato?.status_cliente !== STATUS_MONITORADO) return json({ ok: false, foraDoMonitoramento: true, error: msgForaMonitoramento(contato?.status_cliente ?? null) });
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

// Bloco de notas do CLIENTE (Termos de Intimação). A nota de cada mensagem continua em `acompanhar`.
async function acompanharCliente(payload: any, uid: string) {
  const contactId = String(payload.contact_id ?? "");
  if (!contactId) return json({ error: "contact_id obrigatório" }, 400);
  const obs = payload.observacoes ? String(payload.observacoes).trim().slice(0, 4000) : "";
  const { data, error } = await supabase.from("serpro_caixa_postal_resumo")
    .update({ observacoes: obs || null, observacoes_atualizadas_em: new Date().toISOString(), observacoes_atualizadas_por: uid })
    .eq("contact_id", contactId).eq("company_id", COMPANY_ID).select("contact_id");
  if (error) return json({ error: error.message }, 500);
  if (!data?.length) return json({ error: "Cliente sem resumo da Caixa Postal" }, 404);
  return json({ ok: true });
}

// Rotina diária: 2 chamadas /Monitorar (solicitar + obter), não cobradas, sem ciência. Até 1.000 CNPJs por chamada.
async function rotinaEventos(payload: any, uid: string | null, origem: "manual" | "cron") {
  if (!payload.forcar) {
    const desde = new Date(Date.now() - 12 * 3600_000).toISOString();
    const { count } = await supabase.from("serpro_call_log").select("id", { count: "exact", head: true })
      .eq("id_servico", "SOLICEVENTOSPJ132").ilike("finalidade", "%E0601%").gte("created_at", desde).gte("status_http", 200).lt("status_http", 300);
    // Só conta rodada do E0601: as rotinas de Pagamentos (E0701) e DCTFWeb (E0301) usam o mesmo serviço e não podem bloquear esta.
    if ((count ?? 0) > 0) return json({ ok: true, ignorado: "A rotina já rodou nas últimas 12 h." });
  }
  const { data: contatos } = await supabase.from("contacts").select("id,document")
    .eq("company_id", COMPANY_ID).eq("is_active", true).eq("status_cliente", STATUS_MONITORADO);
  let alvo = (contatos ?? []).map((c: any) => ({ id: c.id as string, cnpj: onlyDigits(c.document) }))
    .filter((c) => c.cnpj.length === 14 && !CNPJS_DA_CA.has(c.cnpj));
  if (payload.limite) alvo = alvo.slice(0, Math.min(Number(payload.limite), 1000));
  alvo = alvo.slice(0, 1000);
  if (!alvo.length) return json({ ok: true, ignorado: "Nenhum cliente com CNPJ" });
  const res = await eventosPJ({
    evento: "E0601", cnpjs: alvo.map((c) => c.cnpj), uid, origem, semFallback: !!payload.semFallback,
    finalidade: "Detecção diária de mensagens novas na Caixa Postal (evento E0601, gratuito, sem ciência) para acompanhamento fiscal",
  });
  if (!("linhas" in res)) return json({ ok: false, error: res.erro });

  const porCnpj = new Map(alvo.map((c) => [c.cnpj, c.id]));
  const agora = new Date().toISOString();
  let semProcuracao = 0, comEvento = 0, semEvento = 0;
  const linhas: any[] = [];
  const ausentes: string[] = [];
  const ativos: string[] = [];
  // Estado anterior, para detectar mensagem nova (a data do evento avançou) sem barulho na 1ª vez de cada cliente:
  // sem leitura anterior da rotina, ou sem procuração antes, é só linha de base.
  const { data: antes } = await supabase.from("serpro_caixa_postal_resumo")
    .select("contact_id,evento_ultima_data,evento_verificado_em").eq("company_id", COMPANY_ID).limit(1000);
  const { data: procsAntes } = await supabase.from("serpro_procuracoes")
    .select("contact_id,status").eq("company_id", COMPANY_ID).eq("codigo_procuracao", "00006").limit(1000);
  const estadoAntes = new Map((antes ?? []).map((r: any) => [r.contact_id, r]));
  const procAntes = new Map((procsAntes ?? []).map((p: any) => [p.contact_id, p.status]));
  const novidades: string[] = [];
  // Procuração PERDIDA: o "x" do sensor é grátis e vale para a carteira toda, todo dia. Perdeu = vem "x" agora e antes estava ativa
  // (pela sonda de ontem ou, sem sonda, pelo mapa pago do Integra Procurações). "x" que já era "x" não é novidade.
  const { data: sondaAntes } = await supabase.from("serpro_procuracoes").select("contact_id,status")
    .eq("company_id", COMPANY_ID).eq("codigo_procuracao", "00006").eq("fonte", "sonda_caixa_postal").limit(1000);
  const { data: mapaAntes } = await supabase.from("serpro_procuracoes").select("contact_id,status,data_fim")
    .eq("company_id", COMPANY_ID).eq("codigo_procuracao", "00006").eq("fonte", "integra_procuracoes").limit(1000);
  const sondaPor = new Map<string, string>((sondaAntes ?? []).map((r: any) => [r.contact_id as string, r.status as string] as [string, string]));
  const hojeIso = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const mapaAtiva = new Set<string>((mapaAntes ?? []).filter((r: any) => r.status === "ativa" && (!r.data_fim || r.data_fim >= hojeIso)).map((r: any) => r.contact_id as string));
  const perdidas: string[] = [];
  for (const [cnpj, d] of res.linhas) {
    const id = porCnpj.get(onlyDigits(cnpj));
    if (!id) continue;
    if (d === "x") {
      semProcuracao++; ausentes.push(id);
      if (sondaPor.get(id) === "ativa" || (!sondaPor.has(id) && mapaAtiva.has(id))) perdidas.push(id);
      linhas.push({ contact_id: id, company_id: COMPANY_ID, evento_verificado_em: agora });
      continue;
    }
    ativos.push(id);
    let data: string | null = null;
    if (/^\d{6}$/.test(d)) { data = `20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}`; comEvento++; } else semEvento++;
    const ant: any = estadoAntes.get(id);
    if (data && ant?.evento_verificado_em && procAntes.get(id) === "ativa" && (!ant.evento_ultima_data || data > ant.evento_ultima_data)) novidades.push(id);
    linhas.push({ contact_id: id, company_id: COMPANY_ID, evento_ultima_data: data, evento_verificado_em: agora });
  }
  if (linhas.length) await supabase.from("serpro_caixa_postal_resumo").upsert(linhas, { onConflict: "contact_id" });
  // Bônus grátis: o "x" e o dado atualizam o mapa de procurações (código 00006, sonda da Caixa Postal)
  const marca = (ids: string[], status: "ativa" | "ausente") => ids.length ? supabase.from("serpro_procuracoes").upsert(
    ids.map((id) => ({ company_id: COMPANY_ID, contact_id: id, codigo_procuracao: "00006", status, verificado_em: agora, fonte: "sonda_caixa_postal", resposta: { servico: "EVENTOSATUALIZACAO.E0601" } })),
    { onConflict: "contact_id,codigo_procuracao" }) : Promise.resolve();
  await marca(ausentes, "ausente");
  await marca(ativos, "ativa");
  if (novidades.length) await notificarNovidades(novidades);
  if (perdidas.length) await notificarPerdas(perdidas);
  return json({ ok: true, modo_autor: res.modo, consultados: res.linhas.length, com_evento: comEvento, sem_evento: semEvento, sem_procuracao: semProcuracao, novidades: novidades.length, procuracoes_perdidas: perdidas.length });
}

// Um aviso interno por rodada (não um por cliente): lista os primeiros nomes e leva para a tela de Mensagens.
// Vai para admins e para quem tem o módulo dashboard_federal (mesmo critério do ModuleGuard das telas).
async function notificarNovidades(ids: string[]) {
  try {
    const { data: nomes } = await supabase.from("contacts").select("id,name,display_name").in("id", ids.slice(0, 100));
    const lista = (nomes ?? []).map((c: any) => (c.display_name || c.name) as string).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const corpo = lista.slice(0, 5).join(", ") + (ids.length > 5 ? ` e mais ${ids.length - 5}` : "");
    const { data: alvos } = await supabase.from("profiles").select("user_id")
      .eq("company_id", COMPANY_ID).eq("status_active", true).or("role.in.(admin,super_admin),allowed_modules.cs.{dashboard_federal}");
    if (!alvos?.length) return;
    await supabase.from("notifications").insert(alvos.map((t: { user_id: string }) => ({
      user_id: t.user_id,
      company_id: COMPANY_ID,
      type: "serpro_mensagem",
      title: ids.length === 1 ? "Nova mensagem na Caixa Postal (e-CAC)" : `${ids.length} clientes com mensagem nova (e-CAC)`,
      body: corpo,
      action_url: "/dashboard-federal/mensagens?selo=nova",
    })));
  } catch (e) {
    console.error("Falha ao notificar novas mensagens:", String((e as Error).message || e));
  }
}

// Aviso interno de procuração perdida (um por rodada): admins e quem tem o módulo dashboard_federal.
async function notificarPerdas(ids: string[]) {
  try {
    const { data: nomes } = await supabase.from("contacts").select("id,name,display_name").in("id", ids.slice(0, 100));
    const lista = (nomes ?? []).map((c: any) => (c.display_name || c.name) as string).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const corpo = lista.slice(0, 5).join(", ") + (ids.length > 5 ? ` e mais ${ids.length - 5}` : "") + ". O sensor diário da Receita não reconhece mais a procuração. Peça ao cliente para outorgar de novo.";
    const { data: alvos } = await supabase.from("profiles").select("user_id")
      .eq("company_id", COMPANY_ID).eq("status_active", true).or("role.in.(admin,super_admin),allowed_modules.cs.{dashboard_federal}");
    if (!alvos?.length) return;
    await supabase.from("notifications").insert(alvos.map((t: { user_id: string }) => ({
      user_id: t.user_id, company_id: COMPANY_ID, type: "serpro_procuracao",
      title: ids.length === 1 ? "Cliente perdeu a procuração" : `${ids.length} clientes perderam a procuração`,
      body: corpo, action_url: "/dashboard-federal/procuracoes",
    })));
  } catch (e) {
    console.error("Falha ao notificar procurações perdidas:", String((e as Error).message || e));
  }
}

// Aviso ao cliente sobre uma mensagem da Caixa Postal. Nunca leva o corpo da intimação: só o texto que a equipe revisou.
// E-mail sai por aqui (API de e-mail da Hostinger, mesmos segredos do boleto-notificar-cliente); WhatsApp abre no navegador
// do usuário (wa.me) e esta ação só registra o histórico.
async function avisar(payload: any, uid: string) {
  const canal = String(payload.canal ?? "");
  if (!["email", "whatsapp", "copiar"].includes(canal)) return json({ error: "Canal inválido" }, 400);
  const texto = String(payload.mensagem ?? "").trim().slice(0, 4000);
  if (!texto) return json({ error: "Escreva a mensagem ao cliente" }, 400);
  const { data: msg } = await supabase.from("serpro_caixa_postal_mensagens")
    .select("id,contact_id").eq("id", String(payload.mensagem_id ?? "")).eq("company_id", COMPANY_ID).maybeSingle();
  if (!msg) return json({ error: "Mensagem não encontrada" }, 404);
  const { data: contato } = await supabase.from("contacts").select("email,whatsapp,phone").eq("id", msg.contact_id).maybeSingle();
  const { data: perfil } = await supabase.from("profiles").select("id").eq("user_id", uid).eq("company_id", COMPANY_ID).maybeSingle();

  let destino: string | null = null;
  if (canal === "email") {
    destino = contato?.email ?? null;
    if (!destino) return json({ error: "Cliente não tem e-mail cadastrado." }, 400);
    const token = Deno.env.get("HOSTINGER_MAIL_API_TOKEN");
    const resourceId = Deno.env.get("HOSTINGER_MAIL_RESOURCE_ID");
    if (!token || !resourceId) return json({ error: "E-mail não configurado (faltam os segredos da Hostinger)." }, 500);
    const assunto = String(payload.assunto ?? "").trim().slice(0, 200) || "Comunicação da Receita Federal para a sua empresa";
    const res = await fetch(`https://api.mail.hostinger.com/api/v1/mailboxes/${resourceId}/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: [destino], subject: assunto, text: texto }),
    });
    if (!res.ok) return json({ error: `Falha ao enviar e-mail (HTTP ${res.status})` }, 502);
  } else if (canal === "whatsapp") {
    destino = contato?.whatsapp || contato?.phone || null;
  }

  const { error } = await supabase.from("serpro_caixa_postal_avisos").insert({
    company_id: COMPANY_ID, mensagem_id: msg.id, contact_id: msg.contact_id, canal, destino, mensagem: texto, enviado_por: perfil?.id ?? null,
  });
  if (error) return json({ ok: true, aviso: "Aviso enviado, mas o histórico não foi gravado." });
  return json({ ok: true });
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
  const { data: perfil } = await perfilAtivo(bearer, uid, "role,is_super_admin,company_id");
  const admin = perfil?.is_super_admin === true || (perfil?.role === "admin" && perfil?.company_id === COMPANY_ID);
  const equipe = admin || (perfil?.role === "colaborador" && perfil?.company_id === COMPANY_ID);
  if (!equipe) return json({ error: "Sem permissão" }, 403);

  switch (action) {
    case "consultar": return await consultar(payload, uid);
    case "abrir": return await abrir(payload, uid);
    case "acompanhar": return await acompanhar(payload, uid);
    case "acompanhar_cliente": return await acompanharCliente(payload, uid);
    case "avisar": return await avisar(payload, uid);
    case "rotina_eventos":
      if (!admin) return json({ error: "Só administradores rodam a rotina manualmente" }, 403);
      return await rotinaEventos(payload, uid, "manual");
    default: return json({ error: "action inválida (consultar | abrir | acompanhar | acompanhar_cliente | avisar | rotina_eventos)" }, 400);
  }
});
