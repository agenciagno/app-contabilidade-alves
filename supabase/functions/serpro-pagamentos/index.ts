import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { criarSerpro, jwtRole, onlyDigits, sleep } from "../_shared/serpro-core.ts";
import { avisarConclusoes, concluirTarefaDas, concluirTarefasPorPagamentos } from "../_shared/tarefas-fiscais.ts";

// ---------------------------------------------------------------------------
// Pagamentos (Serpro Integra Contador, PAGTOWEB + evento E0701) — F4 Onda 1, 01/10/2026. Só leitura.
//
// Ações:
//   consultar        { contact_id, competencia: "AAAA-MM", force?, filtros? }  PAGAMENTOS71 (Consultar, cobrado): documentos PAGOS
//                    do cliente. Sem filtros: janela de pagamento do mês de apuração até 6 meses depois (ou hoje); grava tudo e
//                    marca o mês como consultado. Com filtros (busca avançada): grava o que achar, sem marcar mês.
//   comprovante      { pagamento_id }  COMPARRECADACAO72 (Emitir, cobrado): PDF do comprovante, guardado no bucket privado na
//                    1ª vez (depois só entrega link assinado, sem nova chamada ao Serpro).
//   publicar         { pagamento_id, visivel_portal }  curadoria para o futuro portal do cliente.
//   rotina_eventos   rotina diária (cron 07:35 BRT): evento E0701 (grátis, /Monitorar), 1 solicitar + 1 obter. Marca "pagamento novo"
//                    quando a data do evento avança e avisa a equipe. { forcar?: true } ignora a trava de 12 h.
//   rotina_lote_simples / rotina_lote_presumido_real   LOTE DO DIA 30 (aprovado por Gabriel, 01/10/2026; crons de 5 em 5 min às 07:10 e 07:20).
//                    O cron bate todo dia; quem decide é a DATA (dia 30, ou o último dia do mês em fevereiro) e o interruptor de Tech
//                    (serpro_config.auto_lote_pagamentos_simples / _presumido_real, PADRÃO DESLIGADO: desligado não chama o Serpro).
//                    Mesma consulta do clique (PAGAMENTOS71 do mês de apuração anterior, que também conclui tarefas), 1 cliente por vez.
//                    Simples: só quem tem DAS do mês anterior sem pagamento registrado. Presumido e Real: todos (matriz).
//                    Pula quem já foi consultado hoje, quem não tem procuração (sensor "x") e filial. Até 60 clientes por disparo.
//                    Admin logado pode simular com { dry_run: true, ignorar_data?: true } (não cobra).
//
// A Receita só devolve pagamento FEITO: "não pago" nunca vem na resposta. Só clientes com status "Ativo" geram chamada.
// Sem lote na tela: cada consulta é de um cliente por vez. Toda chamada ao Serpro vai para serpro_call_log.
// ---------------------------------------------------------------------------

const COMPANY_ID = "5cd08fcd-c095-4f08-b3a8-c02b9bf1034e";
const STATUS_MONITORADO = "Ativo";
const RECENTE_MIN = 15;
const BUCKET = "serpro-comprovantes";
const msgForaMonitoramento = (status: string | null) =>
  `Cliente fora do monitoramento (status: ${status ?? "sem status"}). O Serpro só é consultado para clientes com status "${STATUS_MONITORADO}".`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const { serpro, eventosPJ, CONTRATANTE_NI, AUTOR_NI } = criarSerpro(supabase, COMPANY_ID);
const CNPJS_DA_CA = new Set([CONTRATANTE_NI, AUTOR_NI]);

// ---------- helpers ----------
const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const dia = (iso: unknown): string | null => (typeof iso === "string" && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null);
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

const TIPO_POR_CODIGO: Record<number, "DARF" | "DAS" | "DAE" | "DJE"> = { 4: "DARF", 7: "DJE", 8: "DARF", 9: "DAS", 10: "DAE" };
function tipoSigla(tipo: any): "DARF" | "DAS" | "DAE" | "DJE" | "OUTRO" {
  const porCodigo = TIPO_POR_CODIGO[parseInt(String(tipo?.codigo ?? ""), 10)];
  if (porCodigo) return porCodigo;
  const d = `${tipo?.descricaoAbreviada ?? ""} ${tipo?.descricao ?? ""}`.toUpperCase();
  if (/SIMPLES/.test(d)) return "DAS";
  if (/\bDARF\b|RECEITAS FEDERAIS/.test(d)) return "DARF";
  if (/\bDAE\b|ESOCIAL/.test(d)) return "DAE";
  if (/\bDJE\b|DEP[ÓO]SITOS? JUDICIA/.test(d)) return "DJE";
  return "OUTRO";
}

function paraLinhas(docs: any[], contactId: string) {
  const vistos = new Map<string, number>();
  return docs.map((d) => {
    const base = `${d.numeroDocumento ?? ""}|${dia(d.dataArrecadacao) ?? ""}|${num(d.valorTotal) ?? ""}`;
    const n = vistos.get(base) ?? 0;
    vistos.set(base, n + 1);
    return {
      company_id: COMPANY_ID,
      contact_id: contactId,
      chave: n === 0 ? base : `${base}#${n}`,
      numero_documento: String(d.numeroDocumento ?? ""),
      tipo_codigo: d.tipo?.codigo != null ? String(d.tipo.codigo) : null,
      tipo_sigla: tipoSigla(d.tipo),
      tipo_descricao: d.tipo?.descricao ?? d.tipo?.descricaoAbreviada ?? null,
      periodo_apuracao: dia(d.periodoApuracao),
      data_arrecadacao: dia(d.dataArrecadacao),
      data_vencimento: dia(d.dataVencimento),
      receita_codigo: d.receitaPrincipal?.codigo != null ? String(d.receitaPrincipal.codigo) : null,
      receita_descricao: d.receitaPrincipal?.descricao ?? null,
      valor_total: num(d.valorTotal),
      valor_principal: num(d.valorPrincipal),
      valor_multa: num(d.valorMulta),
      valor_juros: num(d.valorJuros),
      valor_saldo_total: num(d.valorSaldoTotal),
      desmembramentos: Array.isArray(d.desmembramentos) && d.desmembramentos.length ? d.desmembramentos : null,
      sincronizado_em: new Date().toISOString(),
    };
  });
}

// Busca avançada: só aceita os campos do serviço, com tipo e tamanho conferidos.
function montarFiltros(f: any): Record<string, unknown> | string {
  const out: Record<string, unknown> = {};
  const lista = (v: unknown, re: RegExp) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter((x) => re.test(x)) : []);
  const docs = lista(f?.numeroDocumentoLista, /^\d{1,17}$/);
  const receitas = lista(f?.codigoReceitaLista, /^\d{1,4}$/);
  const tipos = lista(f?.codigoTipoDocumentoLista, /^\d{1,2}$/);
  if (docs.length) out.numeroDocumentoLista = docs;
  if (receitas.length) out.codigoReceitaLista = receitas;
  if (tipos.length) out.codigoTipoDocumentoLista = tipos;
  const di = dia(f?.dataInicial), df = dia(f?.dataFinal);
  if (di || df) out.intervaloDataArrecadacao = { ...(di ? { dataInicial: di } : {}), ...(df ? { dataFinal: df } : {}) };
  const vi = num(f?.valorInicial), vf = num(f?.valorFinal);
  if (vi !== null || vf !== null) out.intervaloValorTotalDocumento = { ...(vi !== null ? { valorInicial: vi } : {}), ...(vf !== null ? { valorFinal: vf } : {}) };
  if (!Object.keys(out).length) return "Informe ao menos um filtro na busca avançada.";
  return out;
}

async function carregarCliente(contactId: string) {
  const { data } = await supabase.from("contacts").select("id,name,document,status_cliente").eq("id", contactId).eq("company_id", COMPANY_ID).maybeSingle();
  return data;
}

// ---------- ações ----------
type Resp = { corpo: Record<string, unknown>; http: number };
const resp = (corpo: Record<string, unknown>, http = 200): Resp => ({ corpo, http });

/**
 * Consulta os pagamentos de UM cliente (PAGAMENTOS71, cobrado) e grava. Serve ao clique da equipe (`consultar`) e ao lote do dia 30.
 * Quem chama decide o aviso: `tarefas_concluidas` vem no resultado (o clique avisa por cliente; o lote avisa uma vez só).
 */
async function consultarCliente(o: { contactId: string; competencia?: unknown; filtros?: unknown; force?: boolean; uid: string | null; origem: "manual" | "cron"; finalidade?: string }): Promise<Resp & { nome?: string }> {
  const contato = await carregarCliente(o.contactId);
  if (!contato) return resp({ error: "Cliente não encontrado" }, 404);
  if (contato.status_cliente !== STATUS_MONITORADO) return resp({ ok: false, foraDoMonitoramento: true, error: msgForaMonitoramento(contato.status_cliente) });
  const cnpj = onlyDigits(contato.document);
  if (cnpj.length !== 14) return resp({ error: "Cliente sem CNPJ válido" }, 400);

  const avancada = o.filtros && typeof o.filtros === "object";
  const competencia = /^\d{4}-\d{2}$/.test(String(o.competencia ?? "")) ? `${o.competencia}-01` : null;
  if (!avancada && !competencia) return resp({ error: "Informe a competência (AAAA-MM)" }, 400);

  let pedido: Record<string, unknown>;
  if (avancada) {
    const f = montarFiltros(o.filtros);
    if (typeof f === "string") return resp({ error: f }, 400);
    pedido = f;
  } else {
    if (!o.force) {
      const { data: c } = await supabase.from("serpro_pagamentos_consultas").select("consultado_em").eq("contact_id", contato.id).eq("competencia", competencia).maybeSingle();
      if (c?.consultado_em && Date.now() - Date.parse(c.consultado_em) < RECENTE_MIN * 60_000) {
        return resp({ ok: true, recente: true, consultado_em: c.consultado_em });
      }
    }
    const [ano, mes] = competencia!.split("-").map(Number);
    const fim = new Date(Date.UTC(ano, mes - 1 + 7, 0)).toISOString().slice(0, 10); // último dia do mês de apuração + 6
    pedido = { intervaloDataArrecadacao: { dataInicial: competencia, dataFinal: fim < hojeBR() ? fim : hojeBR() } };
  }

  // Páginas de até 100 documentos. "primeiroDaPagina" tratado como posição do 1º item; para se uma página não trouxer nada novo.
  const docs: any[] = [];
  const chaves = new Set<string>();
  let ultimoStatus = 200;
  for (let pagina = 0; pagina < 3; pagina++) {
    const r = await serpro({
      tipo: "Consultar", idSistema: "PAGTOWEB", idServico: "PAGAMENTOS71",
      contribuinte: { numero: cnpj, tipo: 2 },
      dados: JSON.stringify({ ...pedido, primeiroDaPagina: docs.length, tamanhoDaPagina: 100 }),
      uid: o.uid, contactId: contato.id, origem: o.origem,
      finalidade: o.finalidade ?? (avancada
        ? "Busca avançada de pagamentos (PAGTOWEB) acionada por usuário para acompanhamento fiscal do cliente"
        : "Consulta de pagamentos de DARF/DAS/DAE/DJE (PAGTOWEB) acionada por usuário para acompanhamento fiscal do cliente"),
    });
    ultimoStatus = r.status;
    if (r.status === 403) return resp({ ok: false, semProcuracao: true, status: 403, error: "Sem procuração eletrônica para consultar pagamentos deste cliente" });
    if (r.status === 204) break;
    if (r.status !== 200) return resp({ ok: false, status: r.status, error: r.resposta?.mensagens?.[0]?.texto ?? r.resposta?.error ?? "Falha na consulta ao Serpro" });
    const lote = Array.isArray(r.resposta?.dados) ? r.resposta.dados : [];
    // Só descarta o que já veio em página ANTERIOR (repetição = a paginação não avançou); iguais na mesma página são pagamentos reais.
    const chaveDe = (d: any) => `${d.numeroDocumento}|${dia(d.dataArrecadacao)}|${num(d.valorTotal)}`;
    const anteriores = new Set(chaves);
    const novos = lote.filter((d: any) => !anteriores.has(chaveDe(d)));
    for (const d of novos) chaves.add(chaveDe(d));
    docs.push(...novos);
    if (lote.length < 100 || novos.length === 0) break;
  }

  const linhas = paraLinhas(docs, contato.id);
  let novas = 0;
  if (linhas.length) {
    const { data: existentes } = await supabase.from("serpro_pagamentos").select("chave").eq("contact_id", contato.id).in("chave", linhas.map((l) => l.chave));
    const ja = new Set((existentes ?? []).map((e: { chave: string }) => e.chave));
    novas = linhas.filter((l) => !ja.has(l.chave)).length;
    const { error } = await supabase.from("serpro_pagamentos").upsert(linhas, { onConflict: "contact_id,chave" });
    if (error) return resp({ ok: false, error: `Consulta feita, mas não foi possível gravar: ${error.message}` }, 500);
  }

  // Apaga o aviso "pagamento novo" do sensor (consulta posterior à mudança). Só toca esta coluna.
  await supabase.from("serpro_pagamentos_sensor").upsert(
    { contact_id: contato.id, company_id: COMPANY_ID, ultima_consulta_em: new Date().toISOString() }, { onConflict: "contact_id" });

  let doMes = linhas.length;
  if (!avancada) {
    doMes = linhas.filter((l) => l.periodo_apuracao && l.periodo_apuracao.slice(0, 7) === competencia!.slice(0, 7)).length;
    await supabase.from("serpro_pagamentos_consultas").upsert(
      { contact_id: contato.id, company_id: COMPANY_ID, competencia, consultado_em: new Date().toISOString(), consultado_por: o.uid, documentos: doMes },
      { onConflict: "contact_id,competencia" });
  }

  // DAS pago (PAGTOWEB) → conclui a tarefa fiscal "DAS - Simples Nacional" do período (ver _shared/tarefas-fiscais.ts).
  const dasPagos = new Map<string, string>();
  for (const l of linhas) if (l.tipo_sigla === "DAS" && l.periodo_apuracao && !dasPagos.has(l.periodo_apuracao.slice(0, 7))) dasPagos.set(l.periodo_apuracao.slice(0, 7), l.numero_documento);
  let tarefasConcluidas = 0;
  for (const [periodo, numero] of dasPagos) tarefasConcluidas += await concluirTarefaDas(supabase, COMPANY_ID, contato.id, periodo, "pago", `DAS nº ${numero} com pagamento confirmado pela Receita`);
  // DARF pago com PIS e COFINS (ou IRPJ e CSLL) no período → conclui "PIS/ COFINS" (ou "IRPJ/ CSLL") do mesmo mês.
  tarefasConcluidas += await concluirTarefasPorPagamentos(supabase, COMPANY_ID, contato.id,
    linhas.filter((l) => l.tipo_sigla === "DARF" && l.periodo_apuracao).map((l) => l.periodo_apuracao!.slice(0, 7)));
  return { ...resp({ ok: true, status: ultimoStatus, documentos: linhas.length, do_mes: doMes, novos: novas, tarefas_concluidas: tarefasConcluidas }), nome: contato.name ?? "Cliente" };
}

async function consultar(payload: any, uid: string) {
  const r = await consultarCliente({ contactId: String(payload.contact_id ?? ""), competencia: payload.competencia, filtros: payload.filtros, force: !!payload.force, uid, origem: "manual" });
  if (r.nome && Number(r.corpo.tarefas_concluidas) > 0) await avisarConclusoes(supabase, COMPANY_ID, r.nome, Number(r.corpo.tarefas_concluidas));
  return json(r.corpo, r.http);
}

function bytesDeBase64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function comprovante(payload: any, uid: string) {
  const { data: pg } = await supabase.from("serpro_pagamentos")
    .select("id,contact_id,numero_documento,comprovante_path").eq("id", String(payload.pagamento_id ?? "")).eq("company_id", COMPANY_ID).maybeSingle();
  if (!pg) return json({ error: "Pagamento não encontrado" }, 404);

  const assinar = async (path: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600, { download: `comprovante-${pg.numero_documento}.pdf` });
    if (error || !data?.signedUrl) return json({ ok: false, error: "Não foi possível gerar o link do comprovante" }, 500);
    return json({ ok: true, url: data.signedUrl, jaEmitido: true });
  };
  // Já emitido: só entrega o link (sem nova chamada ao Serpro).
  if (pg.comprovante_path) return await assinar(pg.comprovante_path);

  const contato = await carregarCliente(pg.contact_id);
  if (!contato) return json({ error: "Cliente não encontrado" }, 404);
  if (contato.status_cliente !== STATUS_MONITORADO) return json({ ok: false, foraDoMonitoramento: true, error: msgForaMonitoramento(contato.status_cliente) });
  const cnpj = onlyDigits(contato.document);
  if (cnpj.length !== 14) return json({ error: "Cliente sem CNPJ válido" }, 400);

  const r = await serpro({
    tipo: "Emitir", idSistema: "PAGTOWEB", idServico: "COMPARRECADACAO72",
    contribuinte: { numero: cnpj, tipo: 2 }, dados: JSON.stringify({ numeroDocumento: pg.numero_documento }),
    uid, contactId: contato.id, origem: "manual",
    finalidade: "Emissão individual de comprovante de pagamento (PAGTOWEB) acionada por usuário para o cliente",
  });
  if (r.status === 403) return json({ ok: false, semProcuracao: true, error: "Sem procuração eletrônica para emitir comprovante deste cliente" });
  if (r.status !== 200) return json({ ok: false, status: r.status, error: r.resposta?.mensagens?.[0]?.texto ?? r.resposta?.error ?? "Falha ao emitir o comprovante" });

  // Produção/trial devolvem {"pdf": "<base64>"}; aceita também o base64 solto.
  const d = r.resposta?.dados;
  const b64 = typeof d === "string" ? d : d?.pdf;
  if (!b64 || typeof b64 !== "string") return json({ ok: false, error: "O Serpro não devolveu o PDF do comprovante" }, 502);
  let bytes: Uint8Array;
  try { bytes = bytesDeBase64(b64); } catch { return json({ ok: false, error: "PDF do comprovante veio em formato inesperado" }, 502); }
  if (bytes.length < 100 || String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") return json({ ok: false, error: "O arquivo devolvido não é um PDF válido" }, 502);

  const path = `${COMPANY_ID}/${pg.contact_id}/${pg.id}.pdf`;
  const up = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (up.error) return json({ ok: false, error: `Comprovante emitido, mas não foi possível guardar: ${up.error.message}` }, 500);
  await supabase.from("serpro_pagamentos").update({ comprovante_path: path, comprovante_emitido_em: new Date().toISOString(), comprovante_emitido_por: uid }).eq("id", pg.id);
  const assinado = await assinar(path);
  return assinado;
}

async function publicar(payload: any) {
  if (typeof payload.visivel_portal !== "boolean") return json({ error: "visivel_portal inválido" }, 400);
  const { error } = await supabase.from("serpro_pagamentos").update({ visivel_portal: payload.visivel_portal })
    .eq("id", String(payload.pagamento_id ?? "")).eq("company_id", COMPANY_ID);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}

// Rotina diária: evento E0701 (mudança em pagamentos). Só diz que algo mudou; quem consulta o detalhe é a equipe, por clique.
async function rotinaEventos(payload: any, uid: string | null, origem: "manual" | "cron") {
  if (!payload.forcar) {
    const desde = new Date(Date.now() - 12 * 3600_000).toISOString();
    const { count } = await supabase.from("serpro_call_log").select("id", { count: "exact", head: true })
      .eq("id_servico", "SOLICEVENTOSPJ132").ilike("finalidade", "%E0701%").gte("created_at", desde).gte("status_http", 200).lt("status_http", 300);
    if ((count ?? 0) > 0) return json({ ok: true, ignorado: "A rotina de pagamentos já rodou nas últimas 12 h." });
  }
  const { data: contatos } = await supabase.from("contacts").select("id,document")
    .eq("company_id", COMPANY_ID).eq("is_active", true).eq("status_cliente", STATUS_MONITORADO);
  let alvo = (contatos ?? []).map((c: any) => ({ id: c.id as string, cnpj: onlyDigits(c.document) }))
    .filter((c) => c.cnpj.length === 14 && !CNPJS_DA_CA.has(c.cnpj));
  if (payload.limite) alvo = alvo.slice(0, Math.min(Number(payload.limite), 1000));
  alvo = alvo.slice(0, 1000);
  if (!alvo.length) return json({ ok: true, ignorado: "Nenhum cliente ativo com CNPJ" });

  const res = await eventosPJ({
    evento: "E0701", cnpjs: alvo.map((c) => c.cnpj), uid, origem, semFallback: !!payload.semFallback,
    finalidade: "Detecção diária de mudança em pagamentos (evento E0701, gratuito) para acompanhamento fiscal",
  });
  if (!("linhas" in res)) return json({ ok: false, error: res.erro });

  const porCnpj = new Map(alvo.map((c) => [c.cnpj, c.id]));
  const { data: antes } = await supabase.from("serpro_pagamentos_sensor").select("contact_id,evento_ultima_data,evento_verificado_em,mudou_em").eq("company_id", COMPANY_ID).limit(1000);
  const estadoAntes = new Map((antes ?? []).map((r: any) => [r.contact_id, r]));
  const agora = new Date().toISOString();
  const linhas: any[] = [];
  const novidades: string[] = [];
  let semProcuracao = 0, comEvento = 0, semEvento = 0;
  for (const [cnpj, d] of res.linhas) {
    const id = porCnpj.get(onlyDigits(cnpj));
    if (!id) continue;
    const ant: any = estadoAntes.get(id);
    if (d === "x") {
      semProcuracao++;
      linhas.push({ contact_id: id, company_id: COMPANY_ID, evento_ultima_data: ant?.evento_ultima_data ?? null, evento_verificado_em: agora, mudou_em: ant?.mudou_em ?? null, sem_procuracao: true });
      continue;
    }
    let data: string | null = null;
    if (/^\d{6}$/.test(d)) { data = `20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}`; comEvento++; } else semEvento++;
    // "Pagamento novo" só quando a data avança em relação à leitura anterior; a 1ª leitura de cada cliente é só linha de base.
    const avancou = !!(data && ant?.evento_verificado_em && (!ant.evento_ultima_data || data > ant.evento_ultima_data));
    if (avancou) novidades.push(id);
    linhas.push({
      contact_id: id, company_id: COMPANY_ID,
      evento_ultima_data: data ?? ant?.evento_ultima_data ?? null,
      evento_verificado_em: agora,
      mudou_em: avancou ? agora : (ant?.mudou_em ?? null),
      sem_procuracao: false,
    });
  }
  if (linhas.length) await supabase.from("serpro_pagamentos_sensor").upsert(linhas, { onConflict: "contact_id" });
  if (novidades.length) await notificarNovidades(novidades);
  return json({ ok: true, modo_autor: res.modo, consultados: res.linhas.length, com_evento: comEvento, sem_evento: semEvento, sem_procuracao: semProcuracao, novidades: novidades.length });
}

// Um aviso interno por rodada (não um por cliente). Vai para admins e para quem tem o módulo dashboard_federal.
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
      type: "serpro_pagamento",
      title: ids.length === 1 ? "Pagamento novo na Receita" : `${ids.length} clientes com pagamento novo na Receita`,
      body: corpo,
      action_url: "/dashboard-federal/pagamentos",
    })));
  } catch (e) {
    console.error("Falha ao notificar pagamentos novos:", String((e as Error).message || e));
  }
}


// ---------- lote do dia 30 ----------
type ModoLote = "simples" | "presumido_real";
const LOTES: Record<ModoLote, { acao: string; coluna: string; regimes: string[]; rotulo: string }> = {
  simples: { acao: "rotina_lote_simples", coluna: "auto_lote_pagamentos_simples", regimes: ["simples_nacional"], rotulo: "Simples" },
  presumido_real: { acao: "rotina_lote_presumido_real", coluna: "auto_lote_pagamentos_presumido_real", regimes: ["lucro_presumido", "lucro_real"], rotulo: "Presumido e Real" },
};
const dataBRde = (iso: string) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 10);
/** Dia 30; em fevereiro, o último dia do mês. */
const ehDiaDoLote = (hoje: string) => Number(hoje.slice(8, 10)) === Math.min(30, new Date(Date.UTC(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)), 0)).getUTCDate());

/** Clientes do regime que o lote pode tentar: Ativo, matriz, CNPJ válido, sem os CNPJs da CA e sem procuração negada (o sensor diário devolveu "x"). */
async function clientesDoLote(modo: ModoLote) {
  const { data: contatos } = await supabase.from("contacts").select("id,name,display_name,document")
    .eq("company_id", COMPANY_ID).eq("is_active", true).eq("status_cliente", STATUS_MONITORADO).in("tax_regime", LOTES[modo].regimes).order("name");
  const { data: sensor } = await supabase.from("serpro_pagamentos_sensor").select("contact_id").eq("company_id", COMPANY_ID).eq("sem_procuracao", true).limit(2000);
  const semProcuracao = new Set((sensor ?? []).map((r: { contact_id: string }) => r.contact_id));
  const elegiveis = (contatos ?? []).filter((c: any) => {
    const cnpj = onlyDigits(c.document);
    return cnpj.length === 14 && cnpj.slice(8, 12) === "0001" && !CNPJS_DA_CA.has(cnpj);
  });
  return { elegiveis, tentaveis: elegiveis.filter((c: any) => !semProcuracao.has(c.id)), semProcuracao: elegiveis.length - elegiveis.filter((c: any) => !semProcuracao.has(c.id)).length };
}

/** Contatos com DAS do mês de apuração (AAAA-MM) e nenhum pagamento registrado: nem a marca "pago" do PGDAS nem documento DAS em Pagamentos. */
async function dasSemPagamento(competencia: string): Promise<Set<string>> {
  const pa = `${competencia}-01`;
  const proximo = new Date(Date.UTC(Number(competencia.slice(0, 4)), Number(competencia.slice(5, 7)), 1)).toISOString().slice(0, 10);
  const { data: das } = await supabase.from("serpro_pgdasd_das").select("contact_id,das_pago").eq("company_id", COMPANY_ID).eq("periodo_apuracao", pa).limit(5000);
  const { data: docs } = await supabase.from("serpro_pagamentos").select("contact_id").eq("company_id", COMPANY_ID).eq("tipo_sigla", "DAS").gte("periodo_apuracao", pa).lt("periodo_apuracao", proximo).limit(5000);
  const pagos = new Set((docs ?? []).map((d: { contact_id: string }) => d.contact_id));
  const comDas = new Map<string, boolean>();
  for (const d of (das ?? []) as { contact_id: string; das_pago: boolean | null }[]) comDas.set(d.contact_id, (comDas.get(d.contact_id) ?? false) || d.das_pago === true);
  return new Set([...comDas].filter(([id, pago]) => !pago && !pagos.has(id)).map(([id]) => id));
}

/** Um aviso por rotina e por dia no sino (admins e quem tem o módulo dashboard_federal). */
async function avisarLote(titulo: string, corpo: string, hoje: string) {
  try {
    const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true })
      .eq("company_id", COMPANY_ID).eq("type", "serpro_pagamento").eq("title", titulo).gte("created_at", `${hoje}T03:00:00Z`);
    if ((count ?? 0) > 0) return;
    const { data: alvos } = await supabase.from("profiles").select("user_id")
      .eq("company_id", COMPANY_ID).eq("status_active", true).or("role.in.(admin,super_admin),allowed_modules.cs.{dashboard_federal}");
    if (!alvos?.length) return;
    await supabase.from("notifications").insert(alvos.map((t: { user_id: string }) => ({
      user_id: t.user_id, company_id: COMPANY_ID, type: "serpro_pagamento", title: titulo, body: corpo, action_url: "/dashboard-federal/pagamentos",
    })));
  } catch (e) {
    console.error("Falha ao avisar o lote do dia 30:", String((e as Error).message || e));
  }
}

/**
 * Lote do dia 30. O cron bate todo dia; quem decide é o interruptor de Tech (padrão desligado) e a DATA. Competência = mês anterior (AAAA-MM).
 * Guardas: no máximo 60 clientes por disparo e 100 s de relógio; para depois de 5 falhas seguidas; quem já foi consultado hoje é pulado.
 */
async function rotinaLote(modo: ModoLote, payload: any, uid: string | null) {
  const L = LOTES[modo];
  const hoje = hojeBR();
  const simulando = !!uid && payload.dry_run === true;
  const { data: cfg } = await supabase.from("serpro_config").select(L.coluna).eq("company_id", COMPANY_ID).maybeSingle();
  if (!simulando && (cfg as Record<string, unknown> | null)?.[L.coluna] !== true) return json({ ok: true, desligada: true });
  if (!(uid && payload.ignorar_data === true) && !ehDiaDoLote(hoje)) return json({ ok: true, nada_a_fazer: true, hoje });

  const competencia = new Date(Date.UTC(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const { elegiveis, tentaveis, semProcuracao } = await clientesDoLote(modo);
  const { data: consultas } = await supabase.from("serpro_pagamentos_consultas").select("contact_id,consultado_em").eq("company_id", COMPANY_ID).eq("competencia", `${competencia}-01`).limit(3000);
  const feitosHoje = new Set((consultas ?? []).filter((c: { consultado_em: string }) => dataBRde(c.consultado_em) === hoje).map((c: { contact_id: string }) => c.contact_id));
  const semPagamento = modo === "simples" ? await dasSemPagamento(competencia) : null;
  const alvo = tentaveis.filter((c: any) => !feitosHoje.has(c.id) && (!semPagamento || semPagamento.has(c.id)));
  const mes = `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;

  if (simulando) {
    return json({ ok: true, dry_run: true, modo, hoje, competencia, a_consultar: alvo.length, sem_procuracao_pulados: semProcuracao, custo_estimado_reais: Math.round(alvo.length * 0.24 * 100) / 100,
      clientes: alvo.slice(0, 80).map((c: any) => c.display_name || c.name) });
  }

  const inicio = Date.now();
  const resumo = { consultados: 0, com_pagamento_no_mes: 0, erros: 0, tarefas_concluidas: 0 };
  const falhas: string[] = [];
  let seguidas = 0, processados = 0;
  for (const c of alvo) {
    if (processados >= 60 || Date.now() - inicio > 100_000 || seguidas >= 5) break;
    processados++;
    const r = await consultarCliente({
      contactId: c.id, competencia, force: true, uid, origem: uid ? "manual" : "cron",
      finalidade: modo === "simples"
        ? `Lote do dia 30 (Simples): conferir em Pagamentos se o DAS de ${mes} foi pago, para acompanhamento fiscal do cliente`
        : `Lote do dia 30 (Presumido e Real): conferir em Pagamentos os DARF pagos de ${mes}, para acompanhamento fiscal do cliente`,
    });
    if (r.corpo.ok === true) {
      seguidas = 0;
      resumo.consultados++;
      resumo.tarefas_concluidas += Number(r.corpo.tarefas_concluidas ?? 0);
      if (Number(r.corpo.do_mes ?? 0) > 0) resumo.com_pagamento_no_mes++;
    } else {
      seguidas++;
      resumo.erros++;
      if (falhas.length < 10) falhas.push(`${c.display_name || c.name}: ${String(r.corpo.error ?? r.corpo.status ?? "falha")}`);
    }
    await sleep(150);
  }
  const restantes = alvo.length - processados;
  if (resumo.tarefas_concluidas > 0) await avisarConclusoes(supabase, COMPANY_ID, `${resumo.consultados} ${resumo.consultados === 1 ? "cliente" : "clientes"} do ${L.rotulo} (lote do dia 30)`, resumo.tarefas_concluidas);

  // Aviso no sino quando o lote termina (o último disparo do dia): quanto foi conferido e o que ainda está sem pagamento.
  if (seguidas >= 5) {
    await avisarLote(`Lote do dia 30 (${L.rotulo}) parou por falhas`, `A Receita falhou ${resumo.erros} vezes seguidas. Nada mais foi cobrado. Veja o registro de chamadas em Tech.`, hoje);
  } else if (restantes === 0 && alvo.length > 0) {
    const feitos = elegiveis.filter((c: any) => feitosHoje.has(c.id) || alvo.some((a: any) => a.id === c.id)).length;
    if (modo === "simples") {
      const ainda = [...(await dasSemPagamento(competencia))].filter((id) => elegiveis.some((c: any) => c.id === id)).length;
      await avisarLote("Lote do dia 30 (Simples) concluído", `${feitos} ${feitos === 1 ? "cliente conferido" : "clientes conferidos"} em Pagamentos. ${ainda} DAS de ${mes} ${ainda === 1 ? "continua" : "continuam"} sem pagamento registrado na Receita.`, hoje);
    } else {
      await avisarLote("Lote do dia 30 (Presumido e Real) concluído", `${feitos} ${feitos === 1 ? "cliente conferido" : "clientes conferidos"} em Pagamentos (competência ${mes})${resumo.tarefas_concluidas ? `, ${resumo.tarefas_concluidas} ${resumo.tarefas_concluidas === 1 ? "tarefa concluída" : "tarefas concluídas"}` : ""}.`, hoje);
    }
  }
  return json({ ok: true, modo, hoje, competencia, a_consultar: alvo.length, sem_procuracao_pulados: semProcuracao, ...resumo, restantes, parou_por_falhas: seguidas >= 5, falhas, segundos: Math.round((Date.now() - inicio) / 1000) });
}

// ---------- entrada ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const payload = await req.json().catch(() => ({}));
  const action: string = payload.action;

  // Cron chama com a chave anon (padrão do projeto). Só a rotina de eventos aceita isso, e ela tem trava de 12 h.
  if (action === "rotina_eventos" && (bearer === Deno.env.get("SUPABASE_ANON_KEY") || jwtRole(bearer) === "anon")) {
    return await rotinaEventos({ ...payload, forcar: false, limite: undefined, semFallback: false }, null, "cron");
  }

  // Lote do dia 30: o cron chama com a chave anon, mas quem decide é o interruptor (padrão desligado) e a data; fora do dia 30 não cobra nada.
  const modoLote = (Object.keys(LOTES) as ModoLote[]).find((m) => LOTES[m].acao === action);
  if (modoLote && (bearer === Deno.env.get("SUPABASE_ANON_KEY") || jwtRole(bearer) === "anon")) return await rotinaLote(modoLote, {}, null);

  const { data: userData } = await supabase.auth.getUser(bearer);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "Não autenticado" }, 401);
  const { data: perfil } = await supabase.from("profiles").select("role,is_super_admin,company_id").eq("user_id", uid).maybeSingle();
  const admin = perfil?.is_super_admin === true || (perfil?.role === "admin" && perfil?.company_id === COMPANY_ID);
  const equipe = admin || (perfil?.role === "colaborador" && perfil?.company_id === COMPANY_ID);
  if (!equipe) return json({ error: "Sem permissão" }, 403);

  switch (action) {
    case "consultar": return await consultar(payload, uid);
    case "comprovante": return await comprovante(payload, uid);
    case "publicar": return await publicar(payload);
    case "rotina_eventos":
      if (!admin) return json({ error: "Só administradores rodam a rotina manualmente" }, 403);
      return await rotinaEventos(payload, uid, "manual");
    case "rotina_lote_simples":
    case "rotina_lote_presumido_real":
      if (!admin) return json({ error: "Só administradores rodam o lote manualmente" }, 403);
      return await rotinaLote(modoLote!, payload, uid);
    default: return json({ error: "action inválida (consultar | comprovante | publicar | rotina_eventos | rotina_lote_simples | rotina_lote_presumido_real)" }, 400);
  }
});
