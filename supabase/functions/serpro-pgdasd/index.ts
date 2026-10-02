import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { criarSerpro, jwtRole, onlyDigits, sleep } from "../_shared/serpro-core.ts";
import { lerIndicePgdasd, pega } from "../_shared/pgdasd-indice.ts";
import { lerDeclaracaoPgdasd, type DeclaracaoPgdasd } from "../_shared/pgdasd-extrair.ts";
import { avisarConclusoes, concluirTarefaDas, concluirTarefaFiscal } from "../_shared/tarefas-fiscais.ts";
import { lerTodas } from "../_shared/paginar.ts";
import { loteTokenValido } from "../_shared/lote-token.ts";

// ---------------------------------------------------------------------------
// PGDAS-D e DAS (Serpro Integra Contador, Simples Nacional) — F4 Onda 2, passo 2, 30/09/2026. Só leitura + emissão de DAS.
//
// Ações (sempre UM cliente por vez, por clique):
//   consultar    { contact_id, ano, force? }          CONSDECLARACAO13 (Consultar): índice do ano-calendário inteiro (12 meses numa
//                                                    chamada): declarações transmitidas, DAS emitidos e se estão pagos. Ausência num
//                                                    ano consultado = não transmitida.
//   documentos   { contact_id, periodo: "AAAA-MM", force? }  CONSULTIMADECREC14 (Consultar): PDFs do recibo e da declaração da última
//                                                    transmissão do mês (e da MAED, se houve atraso), guardados no bucket privado.
//   extrato      { das_id }                          CONSEXTRATO16 (Consultar): PDF do extrato do DAS, guardado.
//   gerar_das    { contact_id, periodo, confirmar_emissao: true, dataConsolidacao?, novo? }  GERARDAS12 (Emitir): gera o DAS do mês.
//                                                    Só com confirmação explícita; se já há DAS gerado aqui e ainda no prazo, devolve o
//                                                    arquivo guardado em vez de emitir outro.
//   (conclusão automática) consultar conclui a tarefa fiscal "DAS - Simples Nacional" dos períodos com DAS pago; ler_faturamento conclui a de
//                                                    declaração zerada. Transmitir sozinho não conclui. Ver _shared/tarefas-fiscais.ts.
//   ler_faturamento { contact_id, periodo }          Passo 3: lê o PDF da declaração do mês (regra fixa de texto, sem IA) e grava em
//                                                    serpro_faturamento (receita do mês, RBT12, RBA, limite, sublimite, fator r, regime).
//                                                    Se o PDF já está guardado, não chama o Serpro (custo zero); se não, baixa antes.
//   rotina_pgdas (cron 07:45, 07:50, 07:55 e 08:00 BRT; decisão de Gabriel, 01/10/2026): decide sozinha pela data. Dia 16: consulta o ano de todos os
//                                                    clientes do Simples (quem ainda não foi consultado hoje). Dia seguinte ao prazo (dia 20, próximo dia útil se for
//                                                    fim de semana ou feriado nacional): consulta só quem ainda não transmitiu o mês anterior. Outros dias: nada.
//                                                    Cada disparo faz até 60 clientes (os 4 horários cobrem a carteira); quem já foi feito é pulado. Interruptor:
//                                                    serpro_config.auto_rotina_pgdas. Custa 1 consulta por cliente. Admin pode testar com { modo, dry_run: true } (não cobra).
//   rotina_faturamento (cron 18:20 a 18:55 BRT, de 5 em 5 min; decisão de Gabriel, 01/10/2026, primeira leitura em 30/10; de bimestral para mensal em 02/10/2026): todo mês
//                                                    (dia 30; em fevereiro, o último dia) baixa e lê o PDF da declaração do mês anterior de
//                                                    TODOS os clientes do Simples (CONSULTIMADECREC14, Consultar, R$ 0,24; PDF já guardado não cobra) e grava receita, RBT12, limite,
//                                                    sublimite e fator r em serpro_faturamento. Quem já foi lido (mesma declaração) é pulado. Até 60 por disparo; os 8 horários cobrem a
//                                                    carteira. No fim, avisa no sino quantos estão acima do limite, em atenção ou perto do sublimite. Interruptor:
//                                                    serpro_config.auto_leitura_faturamento (padrão ligado). Admin simula com { dry_run: true, ignorar_data?: true } (não cobra).
//   link         { tipo, id }                        link assinado (10 min) de um PDF já guardado (sem chamada ao Serpro).
//   publicar     { tabela: "das" | "declaracao", id, visivel_portal }
//
// Só clientes com status "Ativo". Filial é recusada: o PGDAS-D é da matriz. Procuração: 00146 (PGDAS-D).
// Transmitir declaração (TRANSDECLARACAO11) NÃO existe aqui: escrita na Receita é fase final.
// ---------------------------------------------------------------------------

const COMPANY_ID = "5cd08fcd-c095-4f08-b3a8-c02b9bf1034e";
const STATUS_MONITORADO = "Ativo";
const RECENTE_MIN = 15;
const BUCKET = "serpro-pgdasd";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const { serpro, MODE, CONTRATANTE_NI, AUTOR_NI } = criarSerpro(supabase, COMPANY_ID);
const CNPJS_DA_CA = new Set([CONTRATANTE_NI, AUTOR_NI]);
const CODIGOS_PROCURACAO = ["00146", "00006", "00004", "00060", "00002", "00103", "00050", "00051"]; // mesmos do mapa de procurações

const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const anoBR = () => Number(hojeBR().slice(0, 4));
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const periodoAAAAMM = (p: unknown): string | null => (/^\d{4}-\d{2}$/.test(String(p ?? "")) ? String(p).replace("-", "") : null);
const msgErro = (r: { resposta: any }) => r.resposta?.mensagens?.[0]?.texto ?? r.resposta?.error ?? "Falha na consulta ao Serpro";
const codigoErro = (r: { resposta: any }) => String(r.resposta?.mensagens?.[0]?.codigo ?? "");

type Resp = { corpo: Record<string, unknown>; http: number };
const resp = (corpo: Record<string, unknown>, http = 200): Resp => ({ corpo, http });

type ContatoPgdasd = { id: string; name: string | null; document: string | null; status_cliente: string | null };

/** Confere se o cliente pode ser consultado: existe, está Ativo, tem CNPJ de 14 dígitos e é matriz (o PGDAS-D é da matriz). */
async function validarCliente(contactId: string): Promise<{ erro?: Resp; contato?: ContatoPgdasd; cnpj?: string }> {
  const { data: c } = await supabase.from("contacts").select("id,name,document,status_cliente").eq("id", contactId).eq("company_id", COMPANY_ID).maybeSingle();
  if (!c) return { erro: resp({ error: "Cliente não encontrado" }, 404) };
  if (c.status_cliente !== STATUS_MONITORADO) {
    return { erro: resp({ ok: false, foraDoMonitoramento: true, error: `Cliente fora do monitoramento (status: ${c.status_cliente ?? "sem status"}). O Serpro só é consultado para clientes com status "${STATUS_MONITORADO}".` }) };
  }
  const cnpj = onlyDigits(c.document);
  if (cnpj.length !== 14) return { erro: resp({ error: "Cliente sem CNPJ válido" }, 400) };
  if (cnpj.slice(8, 12) !== "0001") return { erro: resp({ ok: false, filial: true, error: "Este CNPJ é de filial. O PGDAS-D é transmitido pela matriz: consulte o CNPJ da matriz." }) };
  return { contato: c as ContatoPgdasd, cnpj };
}

async function carregarCliente(contactId: string) {
  const v = await validarCliente(contactId);
  if (v.erro) return { resp: json(v.erro.corpo, v.erro.http) };
  return { contato: v.contato!, cnpj: v.cnpj! };
}

function bytesDeBase64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const ehPdf = (b: Uint8Array) => b.length > 100 && String.fromCharCode(...b.slice(0, 4)) === "%PDF";

/** Guarda um PDF (base64) no bucket privado. Devolve o caminho ou null se o arquivo não for um PDF válido. */
async function guardarPdf(path: string, b64: unknown): Promise<string | null> {
  if (typeof b64 !== "string" || !b64) return null;
  let bytes: Uint8Array;
  try { bytes = bytesDeBase64(b64); } catch { return null; }
  if (!ehPdf(bytes)) return null;
  const up = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
  return up.error ? null : path;
}

async function assinar(path: string, nome: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600, { download: nome });
  return error || !data?.signedUrl ? null : data.signedUrl;
}

// ---------- ações ----------
/**
 * Consulta o ANO de UM cliente (CONSDECLARACAO13, 1 chamada cobrada), grava declarações e DAS e conclui as tarefas "DAS - Simples Nacional"
 * dos períodos com declaração transmitida. Quem chama decide o aviso (um por consulta ou um por lote): `tarefas_concluidas` vem no resultado.
 */
async function consultarCliente(contactId: string, ano: number, uid: string | null, origem: "manual" | "cron", force: boolean, finalidade: string): Promise<Resp & { nome?: string }> {
  const v = await validarCliente(contactId);
  if (v.erro) return v.erro;
  const contato = v.contato!;
  const cnpj = v.cnpj!;

  if (!force) {
    const { data: ja } = await supabase.from("serpro_pgdasd_consultas").select("consultado_em").eq("contact_id", contato.id).eq("ano", ano).maybeSingle();
    if (ja?.consultado_em && Date.now() - Date.parse(ja.consultado_em) < RECENTE_MIN * 60_000) return resp({ ok: true, recente: true, consultado_em: ja.consultado_em });
  }

  const r = await serpro({
    tipo: "Consultar", idSistema: "PGDASD", idServico: "CONSDECLARACAO13",
    contribuinte: { numero: cnpj, tipo: 2 }, dados: JSON.stringify({ anoCalendario: String(ano) }),
    uid, contactId: contato.id, origem, finalidade,
  });
  if (r.status === 403) return resp({ ok: false, semProcuracao: true, status: 403, error: "Sem procuração eletrônica para o PGDAS-D deste cliente" });
  // "Não há declaração transmitida" (MSG_ISN_005 / 027) não é falha: o ano foi consultado e não tem nada.
  const semDeclaracao = r.status !== 200 && /MSG_ISN_0(05|27)/.test(codigoErro(r));
  if (r.status !== 200 && !semDeclaracao) return resp({ ok: false, status: r.status, error: msgErro(r) });

  const lido = semDeclaracao ? { declaracoes: [], das: [] } : lerIndicePgdasd(r.resposta?.dados);
  // A Receita pode listar o mesmo número duas vezes na mesma resposta (ex.: o mesmo DAS em duas operações). O banco recusa a gravação
  // em lote com chave repetida ("cannot affect row a second time"): fica um por número, o último.
  const declaracoes = [...new Map(lido.declaracoes.map((d) => [d.numero_declaracao, d])).values()];
  const das = [...new Map(lido.das.map((d) => [d.numero_das, d])).values()];
  const agora = new Date().toISOString();
  const base = { company_id: COMPANY_ID, contact_id: contato.id, sincronizado_em: agora };

  let novasDecl = 0, novosDas = 0;
  if (declaracoes.length) {
    const { data: ex } = await supabase.from("serpro_pgdasd_declaracoes").select("numero_declaracao").eq("contact_id", contato.id).in("numero_declaracao", declaracoes.map((d) => d.numero_declaracao));
    const ja = new Set((ex ?? []).map((e: { numero_declaracao: string }) => e.numero_declaracao));
    novasDecl = declaracoes.filter((d) => !ja.has(d.numero_declaracao)).length;
    const { error } = await supabase.from("serpro_pgdasd_declaracoes").upsert(
      declaracoes.map((d) => ({ ...base, periodo_apuracao: d.periodo, numero_declaracao: d.numero_declaracao, tipo: d.tipo, transmitida_em: d.transmitida_em, malha: d.malha })),
      { onConflict: "contact_id,numero_declaracao" });
    if (error) return resp({ ok: false, error: `Consulta feita, mas não foi possível gravar: ${error.message}` }, 500);
  }
  if (das.length) {
    const { data: ex } = await supabase.from("serpro_pgdasd_das").select("numero_das").eq("contact_id", contato.id).in("numero_das", das.map((d) => d.numero_das));
    const ja = new Set((ex ?? []).map((e: { numero_das: string }) => e.numero_das));
    novosDas = das.filter((d) => !ja.has(d.numero_das)).length;
    // Só as colunas do índice: o PDF e os valores de um DAS gerado aqui não são apagados.
    const { error } = await supabase.from("serpro_pgdasd_das").upsert(
      das.map((d) => ({ ...base, periodo_apuracao: d.periodo, numero_das: d.numero_das, tipo_operacao: d.tipo_operacao, emitido_em: d.emitido_em, das_pago: d.das_pago })),
      { onConflict: "contact_id,numero_das" });
    if (error) return resp({ ok: false, error: `Consulta feita, mas não foi possível gravar: ${error.message}` }, 500);
  }
  await supabase.from("serpro_pgdasd_consultas").upsert(
    { contact_id: contato.id, company_id: COMPANY_ID, ano, consultado_em: agora, consultado_por: uid, declaracoes: declaracoes.length, das: das.length },
    { onConflict: "contact_id,ano" });
  // O "pago" do índice responde ao aviso "pagamento novo" do sensor de Pagamentos: a consulta apaga o aviso (só esta coluna).
  await supabase.from("serpro_pagamentos_sensor").upsert({ contact_id: contato.id, company_id: COMPANY_ID, ultima_consulta_em: agora }, { onConflict: "contact_id" });

  // Declaração TRANSMITIDA → conclui a tarefa fiscal "DAS - Simples Nacional" do período (decisão de Gabriel, 01/10/2026).
  // Vale a primeira transmissão do período e a data de entrega é a da transmissão. Tarefa já concluída pela equipe é ignorada.
  const primeira = new Map<string, (typeof declaracoes)[number]>();
  for (const d of declaracoes) {
    const a = primeira.get(d.periodo);
    if (!a || (d.transmitida_em ?? "9999") < (a.transmitida_em ?? "9999")) primeira.set(d.periodo, d);
  }
  let tarefasConcluidas = 0;
  for (const [periodo, d] of primeira) {
    tarefasConcluidas += await concluirTarefaFiscal(supabase, COMPANY_ID, contato.id, {
      obrigacao: "DAS - Simples Nacional", periodo, tipo: "transmitted", protocolo: d.numero_declaracao,
      detalhe: `PGDAS-D nº ${d.numero_declaracao} transmitido${d.transmitida_em ? ` em ${d.transmitida_em.slice(0, 10).split("-").reverse().join("/")}` : ""} (informação da Receita)`,
      dataEntrega: d.transmitida_em ? d.transmitida_em.slice(0, 10) : undefined,
    });
  }
  return { ...resp({ ok: true, declaracoes: declaracoes.length, das: das.length, novas: novasDecl + novosDas, sem_declaracao: semDeclaracao, tarefas_concluidas: tarefasConcluidas }), nome: contato.name ?? "Cliente" };
}

async function consultar(payload: any, uid: string) {
  const ano = Number(payload.ano);
  if (!Number.isInteger(ano) || ano < 2018 || ano > anoBR()) return json({ error: "Ano inválido" }, 400);
  const r = await consultarCliente(String(payload.contact_id ?? ""), ano, uid, "manual", !!payload.force,
    `Consulta do índice de declarações e DAS do PGDAS-D (ano ${ano}) acionada por usuário para acompanhamento fiscal do cliente`);
  if (r.nome && Number(r.corpo.tarefas_concluidas) > 0) await avisarConclusoes(supabase, COMPANY_ID, r.nome, Number(r.corpo.tarefas_concluidas));
  return json(r.corpo, r.http);
}

/**
 * Clientes do Simples que uma consulta em lote pode tentar: Ativo, matriz, CNPJ válido, sem os CNPJs da CA. Cliente mapeado nas procurações sem NENHUMA
 * ativa fica de fora (a tentativa seria cobrada e voltaria 403). `consultadoEm`: última consulta do ANO por cliente.
 */
async function carteiraDoSimples(ano: number) {
  const { data: contatos } = await supabase.from("contacts").select("id,name,display_name,document")
    .eq("company_id", COMPANY_ID).eq("is_active", true).eq("status_cliente", STATUS_MONITORADO).eq("tax_regime", "simples_nacional").order("name");
  const { data: consultas } = await supabase.from("serpro_pgdasd_consultas").select("contact_id,consultado_em").eq("company_id", COMPANY_ID).eq("ano", ano).limit(1000);
  const consultadoEm = new Map<string, string>((consultas ?? []).map((c: any) => [c.contact_id as string, c.consultado_em as string]));
  // O mapa de procurações passa de 1.000 linhas (teto do banco por consulta): lê em páginas, senão cliente sem procuração parece "sem mapa" e é tentado (cobrado, 403).
  const procs = await lerTodas<{ contact_id: string; status: string; data_fim: string | null }>((de, ate) => supabase.from("serpro_procuracoes").select("contact_id,status,data_fim")
    .eq("company_id", COMPANY_ID).eq("fonte", "integra_procuracoes").in("codigo_procuracao", CODIGOS_PROCURACAO).order("id").range(de, ate));
  const hoje = hojeBR();
  const comMapa = new Map<string, boolean>();
  for (const r of (procs ?? []) as { contact_id: string; status: string; data_fim: string | null }[]) {
    const ativa = r.status === "ativa" && (!r.data_fim || r.data_fim >= hoje);
    comMapa.set(r.contact_id, (comMapa.get(r.contact_id) ?? false) || ativa);
  }
  const elegiveis = (contatos ?? []).filter((c: any) => {
    const cnpj = onlyDigits(c.document);
    return cnpj.length === 14 && cnpj.slice(8, 12) === "0001" && !CNPJS_DA_CA.has(cnpj);
  });
  const ehSemProcuracao = (c: any) => comMapa.has(c.id) && comMapa.get(c.id) === false;
  return { elegiveis, semProcuracao: elegiveis.filter(ehSemProcuracao), tentaveis: elegiveis.filter((c: any) => !ehSemProcuracao(c)), consultadoEm };
}

/**
 * Consulta o ano de cada cliente da lista, um por vez. Guardas: no máximo `limite` clientes por chamada e 100 s de relógio; para depois de 5 falhas seguidas
 * (uma falha de serviço da Receita não vira cobrança em série). Quem chama decide o que fazer com o resumo.
 */
async function consultarLista(lista: any[], o: { ano: number; uid: string | null; origem: "manual" | "cron"; finalidade: string; limite: number }) {
  const inicio = Date.now();
  const resumo = { consultados: 0, transmitidas: 0, sem_declaracao_no_ano: 0, erros: 0, tarefas_concluidas: 0 };
  const falhas: string[] = [];
  let seguidas = 0, processados = 0;
  for (const c of lista) {
    if (processados >= o.limite || Date.now() - inicio > 100_000 || seguidas >= 5) break;
    processados++;
    const r = await consultarCliente(c.id, o.ano, o.uid, o.origem, true, o.finalidade);
    if (r.corpo.ok === true) {
      seguidas = 0;
      resumo.consultados++;
      resumo.tarefas_concluidas += Number(r.corpo.tarefas_concluidas ?? 0);
      if (r.corpo.sem_declaracao === true || Number(r.corpo.declaracoes ?? 0) === 0) resumo.sem_declaracao_no_ano++; else resumo.transmitidas++;
    } else {
      seguidas++;
      resumo.erros++;
      if (falhas.length < 10) falhas.push(`${c.display_name || c.name}: ${String(r.corpo.error ?? r.corpo.status ?? "falha")}`);
    }
    await sleep(150);
  }
  return { ...resumo, restantes: lista.length - processados, parou_por_falhas: seguidas >= 5, falhas, segundos: Math.round((Date.now() - inicio) / 1000) };
}

/**
 * Passe ÚNICO na carteira do Simples (aprovado por Gabriel em 01/10/2026; não é rotina agendada): consulta o ano de cada cliente que ainda não
 * foi consultado nas últimas 24 h. No máximo `limite` clientes por chamada (padrão 40, teto 60). Pode ser chamada de novo: quem já foi consultado é pulado.
 * Um aviso-resumo no fim.
 */
async function consultarCarteira(payload: any, uid: string | null) {
  const ano = Number(payload.ano) || anoBR();
  if (!Number.isInteger(ano) || ano < 2018 || ano > anoBR()) return json({ error: "Ano inválido" }, 400);
  const limite = Math.max(1, Math.min(Number(payload.limite) || 40, 60));

  const { elegiveis, semProcuracao, tentaveis, consultadoEm } = await carteiraDoSimples(ano);
  const pendentes = tentaveis.filter((c: any) => !(consultadoEm.has(c.id) && Date.now() - Date.parse(consultadoEm.get(c.id)!) < 24 * 3600_000));
  const r = await consultarLista(pendentes, { ano, uid, origem: "manual", limite,
    finalidade: `Consulta do índice do PGDAS-D (ano ${ano}) no primeiro passe da carteira do Simples, aprovado por Gabriel em 01/10/2026, para acompanhamento fiscal` });
  if (r.tarefas_concluidas > 0) await avisarConclusoes(supabase, COMPANY_ID, `${r.consultados} ${r.consultados === 1 ? "cliente" : "clientes"} do Simples (consulta da carteira)`, r.tarefas_concluidas);
  return json({ ok: true, ano, ...r, sem_procuracao_pulados: semProcuracao.length, ja_consultados: elegiveis.length - pendentes.length - semProcuracao.length });
}

const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
const dataBRde = (iso: string) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 10);

/**
 * Rotina automática do PGDAS-D (decisão de Gabriel, 01/10/2026). Quem decide o que fazer é a DATA, nunca o pedido: o cron só bate à porta.
 *  · dia 16: carteira inteira (quem ainda não foi consultado hoje) para saber, antes do prazo, quem já transmitiu o mês anterior e como estão os DAS;
 *  · dia seguinte ao prazo: só quem ainda não transmitiu o mês anterior e não foi consultado depois do prazo (a consulta depois do prazo é a prova de "não transmitida");
 *  · demais dias: nada, sem chamada ao Serpro.
 * O prazo vem de serpro_vencimento_mensal (dia 20; fim de semana e feriado nacional passam ao próximo dia útil). Interruptor: serpro_config.auto_rotina_pgdas.
 * Cada disparo faz até 60 clientes; os disparos de 5 em 5 minutos cobrem a carteira, e quem já foi feito é pulado (não cobra de novo).
 * Administrador logado pode testar com { modo: "todos" | "pendentes", dry_run: true }: mostra quantos seriam consultados, sem chamar o Serpro.
 */
async function rotinaPgdas(payload: any, uid: string | null) {
  const hoje = hojeBR();
  const { data: cfg } = await supabase.from("serpro_config").select("auto_rotina_pgdas").eq("company_id", COMPANY_ID).maybeSingle();
  if (cfg?.auto_rotina_pgdas === false) return json({ ok: true, desligada: true });

  const { data: prazoBanco, error: ePrazo } = await supabase.rpc("serpro_vencimento_mensal", { p_dia: hoje });
  if (ePrazo || !prazoBanco) return json({ ok: false, error: `Não foi possível calcular o prazo do mês: ${ePrazo?.message ?? "sem resposta"}` }, 500);
  const prazo = String(prazoBanco);
  const pa = new Date(Date.UTC(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7); // mês anterior (AAAA-MM)
  const ano = Number(pa.slice(0, 4));

  let modo: "todos" | "pendentes" | null = hoje.slice(8, 10) === "16" ? "todos" : diasEntre(prazo, hoje) === 1 ? "pendentes" : null;
  if (uid && (payload.modo === "todos" || payload.modo === "pendentes")) modo = payload.modo;
  if (!modo) return json({ ok: true, nada_a_fazer: true, hoje, prazo });

  const { semProcuracao, tentaveis, consultadoEm } = await carteiraDoSimples(ano);
  let alvo: any[];
  if (modo === "todos") {
    alvo = tentaveis.filter((c: any) => { const q = consultadoEm.get(c.id); return !q || dataBRde(q) !== hoje; });
  } else {
    const { data: decl } = await supabase.from("serpro_pgdasd_declaracoes").select("contact_id").eq("company_id", COMPANY_ID).eq("periodo_apuracao", `${pa}-01`).limit(2000);
    const transmitiu = new Set((decl ?? []).map((d: { contact_id: string }) => d.contact_id));
    alvo = tentaveis.filter((c: any) => { const q = consultadoEm.get(c.id); return !transmitiu.has(c.id) && !(q && dataBRde(q) > prazo); });
  }
  const mes = `${pa.slice(5, 7)}/${pa.slice(0, 4)}`;
  if (uid && payload.dry_run === true) {
    return json({ ok: true, dry_run: true, modo, hoje, prazo, pa, ano, a_consultar: alvo.length, sem_procuracao_pulados: semProcuracao.length, custo_estimado_reais: Math.round(alvo.length * 0.24 * 100) / 100 });
  }

  const r = await consultarLista(alvo, {
    ano, uid, origem: uid ? "manual" : "cron", limite: 60,
    finalidade: modo === "todos"
      ? `Rotina automática do PGDAS-D no dia 16 (índice do ano ${ano}): conferir, antes do prazo, quem já transmitiu a declaração de ${mes} e a situação dos DAS, para acompanhamento fiscal da carteira`
      : `Rotina automática do PGDAS-D no dia seguinte ao prazo (índice do ano ${ano}): conferir quem ainda não transmitiu a declaração de ${mes}, para acompanhamento fiscal do cliente`,
  });
  if (r.tarefas_concluidas > 0) await avisarConclusoes(supabase, COMPANY_ID, `${r.consultados} ${r.consultados === 1 ? "cliente" : "clientes"} do Simples (rotina automática do PGDAS-D)`, r.tarefas_concluidas);
  return json({ ok: true, modo, hoje, prazo, pa, ano, a_consultar: alvo.length, sem_procuracao_pulados: semProcuracao.length, ...r });
}

/** Quem está pedindo: clique da equipe (padrão) ou rotina agendada. A rotina não avisa por cliente (um aviso só no fim). */
type Via = { origem: "manual" | "cron"; finalidade?: string; semAviso?: boolean };

async function documentos(payload: any, uid: string | null, via?: Via) {
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const aaaamm = periodoAAAAMM(payload.periodo);
  if (!aaaamm) return json({ error: "Informe o período (AAAA-MM)" }, 400);
  const periodo = `${aaaamm.slice(0, 4)}-${aaaamm.slice(4, 6)}-01`;

  const { data: vigente } = await supabase.from("serpro_pgdasd_declaracoes").select("id,numero_declaracao,recibo_path,declaracao_path")
    .eq("contact_id", c.contato!.id).eq("periodo_apuracao", periodo).order("transmitida_em", { ascending: false }).limit(1).maybeSingle();
  if (!vigente) return json({ ok: false, error: "Não há declaração deste período na lista. Atualize o ano primeiro." });
  // Já baixado: não chama o Serpro de novo (cada chamada é cobrada).
  if (vigente.recibo_path && vigente.declaracao_path && !payload.force) return json({ ok: true, jaBaixado: true, id: vigente.id });

  const r = await serpro({
    tipo: "Consultar", idSistema: "PGDASD", idServico: "CONSULTIMADECREC14",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: JSON.stringify({ periodoApuracao: aaaamm }),
    uid, contactId: c.contato!.id, origem: via?.origem ?? "manual",
    finalidade: via?.finalidade ?? `Consulta da declaração e do recibo do PGDAS-D (PA ${aaaamm.slice(4)}/${aaaamm.slice(0, 4)}) acionada por usuário para o cliente`,
  });
  if (r.status === 403) return json({ ok: false, semProcuracao: true, error: "Sem procuração eletrônica para o PGDAS-D deste cliente" });
  if (r.status !== 200) return json({ ok: false, status: r.status, error: msgErro(r) });

  const d = r.resposta?.dados;
  const numero = String(pega(d, "numeroDeclaracao") ?? "");
  if (!numero) return json({ ok: false, error: "O Serpro não devolveu a declaração deste período" }, 502);
  const { data: alvo } = await supabase.from("serpro_pgdasd_declaracoes").select("id").eq("contact_id", c.contato!.id).eq("numero_declaracao", numero).maybeSingle();
  if (!alvo) return json({ ok: false, error: `A Receita devolveu a declaração nº ${numero}, que ainda não está na lista. Atualize o ano e tente de novo.` });

  const pasta = `${COMPANY_ID}/${c.contato!.id}`;
  const recibo = await guardarPdf(`${pasta}/recibo-${numero}.pdf`, pega(pega(d, "recibo"), "pdf"));
  const decl = await guardarPdf(`${pasta}/declaracao-${numero}.pdf`, pega(pega(d, "declaracao"), "pdf"));
  if (!recibo && !decl) return json({ ok: false, error: "O Serpro não devolveu os PDFs da declaração" }, 502);
  const maed = pega(d, "maed");
  const maedNotif = await guardarPdf(`${pasta}/maed-notificacao-${numero}.pdf`, pega(maed, "pdfNotificacao"));
  const maedDarf = await guardarPdf(`${pasta}/maed-darf-${numero}.pdf`, pega(maed, "pdfDarf"));
  await supabase.from("serpro_pgdasd_declaracoes").update({
    recibo_path: recibo, declaracao_path: decl, maed_notificacao_path: maedNotif, maed_darf_path: maedDarf, documentos_em: new Date().toISOString(),
  }).eq("id", alvo.id);
  return json({ ok: true, id: alvo.id, com_maed: !!(maedNotif || maedDarf) });
}

async function extrato(payload: any, uid: string) {
  const { data: das } = await supabase.from("serpro_pgdasd_das").select("id,contact_id,numero_das,extrato_path").eq("id", String(payload.das_id ?? "")).eq("company_id", COMPANY_ID).maybeSingle();
  if (!das) return json({ error: "DAS não encontrado" }, 404);
  if (das.extrato_path) return json({ ok: true, jaBaixado: true, id: das.id });
  const c = await carregarCliente(das.contact_id);
  if (c.resp) return c.resp;

  const r = await serpro({
    tipo: "Consultar", idSistema: "PGDASD", idServico: "CONSEXTRATO16",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: JSON.stringify({ numeroDas: das.numero_das }),
    uid, contactId: c.contato!.id, origem: "manual",
    finalidade: "Consulta do extrato do DAS (PGDAS-D) acionada por usuário para o cliente",
  });
  if (r.status === 403) return json({ ok: false, semProcuracao: true, error: "Sem procuração eletrônica para o PGDAS-D deste cliente" });
  if (r.status !== 200) return json({ ok: false, status: r.status, error: msgErro(r) });
  const path = await guardarPdf(`${COMPANY_ID}/${c.contato!.id}/extrato-${das.numero_das}.pdf`, pega(pega(r.resposta?.dados, "extrato"), "pdf"));
  if (!path) return json({ ok: false, error: "O Serpro não devolveu o PDF do extrato" }, 502);
  await supabase.from("serpro_pgdasd_das").update({ extrato_path: path }).eq("id", das.id);
  return json({ ok: true, id: das.id });
}

async function gerarDas(payload: any, uid: string) {
  // Gerar DAS registra uma emissão na Receita: só com confirmação explícita de quem clicou.
  if (payload.confirmar_emissao !== true) return json({ error: "Emissão não confirmada. Gerar o DAS registra uma emissão na Receita e precisa de confirmação explícita." }, 400);
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const aaaamm = periodoAAAAMM(payload.periodo);
  if (!aaaamm) return json({ error: "Informe o período (AAAA-MM)" }, 400);
  const periodo = `${aaaamm.slice(0, 4)}-${aaaamm.slice(4, 6)}-01`;

  // Já existe DAS gerado aqui para o período e ainda no prazo: entrega o arquivo guardado (não emite outro).
  if (!payload.novo) {
    const { data: ja } = await supabase.from("serpro_pgdasd_das").select("id,numero_das,vencimento,limite_acolhimento,valor_total,das_path")
      .eq("contact_id", c.contato!.id).eq("periodo_apuracao", periodo).not("das_path", "is", null).order("emitido_em", { ascending: false }).limit(1).maybeSingle();
    // O documento serve enquanto puder ser pago: vale a data limite de acolhimento (DAS vencido é consolidado até ela); sem ela, o vencimento.
    const validoAte = ja?.limite_acolhimento ?? ja?.vencimento ?? null;
    if (ja?.das_path && (!validoAte || validoAte >= hojeBR())) {
      const url = await assinar(ja.das_path, `das-${ja.numero_das}.pdf`);
      if (url) return json({ ok: true, jaGerado: true, url, numero_das: ja.numero_das, vencimento: ja.vencimento, valor_total: ja.valor_total, id: ja.id });
    }
  }

  const dados: Record<string, string> = { periodoApuracao: aaaamm };
  if (/^\d{8}$/.test(String(payload.dataConsolidacao ?? ""))) dados.dataConsolidacao = String(payload.dataConsolidacao);
  const r = await serpro({
    tipo: "Emitir", idSistema: "PGDASD", idServico: "GERARDAS12",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: JSON.stringify(dados),
    uid, contactId: c.contato!.id, origem: "manual",
    finalidade: `Emissão do DAS do PGDAS-D (PA ${aaaamm.slice(4)}/${aaaamm.slice(0, 4)}) confirmada por usuário para o cliente`,
  });
  if (r.status === 403) return json({ ok: false, semProcuracao: true, error: "Sem procuração eletrônica para o PGDAS-D deste cliente" });
  if (r.status !== 200) return json({ ok: false, status: r.status, error: msgErro(r) });

  const bruto = r.resposta?.dados;
  const das = Array.isArray(bruto) ? bruto[0] : bruto;
  // O trial devolve "detalhamentoDas" (a documentação diz "detalhamento"): aceita os dois.
  const det = pega(das, "detalhamentoDas", "detalhamento");
  const numero = String(pega(det, "numeroDocumento") ?? "");
  if (!numero) return json({ ok: false, error: "O Serpro não devolveu os dados do DAS" }, 502);
  const path = await guardarPdf(`${COMPANY_ID}/${c.contato!.id}/das-${numero}.pdf`, pega(das, "pdf"));
  if (!path) return json({ ok: false, error: "O DAS foi gerado, mas o PDF não veio em formato válido" }, 502);

  const venc = String(pega(det, "dataVencimento") ?? "");
  const limite = String(pega(det, "dataLimiteAcolhimento") ?? "");
  const dataDe = (v: string) => (/^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null);
  const val = pega(det, "valores");
  const campos = {
    tipo_operacao: "Geração de DAS", emitido_em: new Date().toISOString(),
    vencimento: dataDe(venc), limite_acolhimento: dataDe(limite),
    valor_principal: num(pega(val, "principal")), valor_multa: num(pega(val, "multa")), valor_juros: num(pega(val, "juros")), valor_total: num(pega(val, "total")),
    composicao: Array.isArray(pega(det, "composicao")) ? pega(det, "composicao") : null, das_path: path, sincronizado_em: new Date().toISOString(),
  };
  const { data: existente } = await supabase.from("serpro_pgdasd_das").select("id").eq("contact_id", c.contato!.id).eq("numero_das", numero).maybeSingle();
  let id: string | null = existente?.id ?? null;
  if (existente) {
    await supabase.from("serpro_pgdasd_das").update(campos).eq("id", existente.id);
  } else {
    const { data: novo } = await supabase.from("serpro_pgdasd_das")
      .insert({ company_id: COMPANY_ID, contact_id: c.contato!.id, periodo_apuracao: periodo, numero_das: numero, das_pago: false, ...campos }).select("id").maybeSingle();
    id = novo?.id ?? null;
  }
  const url = await assinar(path, `das-${numero}.pdf`);
  return json({ ok: true, url, numero_das: numero, vencimento: campos.vencimento, valor_total: campos.valor_total, id });
}

// ---------- faturamento (passo 3) ----------
/** Texto do PDF guardado. `unpdf` é carregado só aqui: se a biblioteca falhar, o resto da função continua funcionando. */
async function textoDoPdf(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error("PDF não encontrado no armazenamento");
  const bytes = new Uint8Array(await data.arrayBuffer());
  const { extractText, getDocumentProxy } = await import("npm:unpdf@1.8.1");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

interface DeclaracaoBase { id: string; contact_id: string; numero_declaracao: string; periodo_apuracao: string; tipo: string; transmitida_em: string | null; declaracao_path: string | null }

async function declaracaoDoPeriodo(contactId: string, periodo: string): Promise<DeclaracaoBase | null> {
  const { data } = await supabase.from("serpro_pgdasd_declaracoes").select("id,contact_id,numero_declaracao,periodo_apuracao,tipo,transmitida_em,declaracao_path")
    .eq("contact_id", contactId).eq("periodo_apuracao", periodo).order("transmitida_em", { ascending: false }).limit(1).maybeSingle();
  return (data as DeclaracaoBase | null) ?? null;
}

/** Lê o PDF da declaração, confere com o que o índice disse e grava. Nunca inventa número: o que não fecha vira aviso e `confiavel` = false. */
async function lerEGravar(decl: DeclaracaoBase, cnpj: string) {
  const d: DeclaracaoPgdasd = lerDeclaracaoPgdasd(await textoDoPdf(decl.declaracao_path!));
  const avisos = [...d.avisos];
  let confiavel = d.confiavel;
  const barra = (texto: string) => { avisos.push(texto); confiavel = false; };
  if (d.numero_declaracao && d.numero_declaracao !== decl.numero_declaracao) barra(`o PDF é da declaração ${d.numero_declaracao}, não da ${decl.numero_declaracao}`);
  if (d.periodo_apuracao && d.periodo_apuracao !== decl.periodo_apuracao.slice(0, 7)) barra(`o PDF é do período ${d.periodo_apuracao}, não de ${decl.periodo_apuracao.slice(0, 7)}`);
  // O trial devolve CNPJ fictício: a conferência do CNPJ só vale em produção.
  if (MODE === "producao" && d.cnpj_matriz && onlyDigits(d.cnpj_matriz) !== cnpj) barra("o CNPJ do PDF não é o do cliente");

  const linha = {
    company_id: COMPANY_ID, contact_id: decl.contact_id, declaracao_id: decl.id,
    periodo_apuracao: decl.periodo_apuracao, numero_declaracao: decl.numero_declaracao,
    tipo: d.tipo ?? (decl.tipo === "retificadora" ? "retificadora" : "original"), transmitida_em: d.transmissao ?? decl.transmitida_em,
    regime_apuracao: d.regime,
    rpa_total: d.rpa?.total ?? null, rbt12_total: d.rbt12?.total ?? null, rba_total: d.rba?.total ?? null, rbaa_total: d.rbaa?.total ?? null,
    limite_total: d.limite?.total ?? null, sublimite: d.sublimite,
    fator_r_aplica: d.fator_r_aplica, fator_r_texto: d.fator_r_texto,
    confiavel, avisos, dados: d, lido_em: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("serpro_faturamento").upsert(linha, { onConflict: "contact_id,numero_declaracao" }).select("id").maybeSingle();
  if (error) throw new Error(`não foi possível gravar a leitura: ${error.message}`);
  // Declaração zerada (receita e débito zero, leitura confiável) → conclui a tarefa fiscal do período como "ZERADO".
  let tarefasConcluidas = 0;
  if (confiavel && d.rpa?.total === 0 && d.debito_declarado?.total === 0) {
    tarefasConcluidas = await concluirTarefaDas(supabase, COMPANY_ID, decl.contact_id, decl.periodo_apuracao, "zerado", `declaração nº ${decl.numero_declaracao} transmitida sem receita e sem débito`);
  }
  return { id: data?.id as string | undefined, confiavel, avisos, tarefasConcluidas };
}

async function lerFaturamento(payload: any, uid: string | null, via?: Via) {
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const aaaamm = periodoAAAAMM(payload.periodo);
  if (!aaaamm) return json({ error: "Informe o período (AAAA-MM)" }, 400);
  const periodo = `${aaaamm.slice(0, 4)}-${aaaamm.slice(4, 6)}-01`;

  let decl = await declaracaoDoPeriodo(c.contato!.id, periodo);
  if (!decl) return json({ ok: false, error: "Não há declaração deste período na lista. Atualize o ano primeiro." });
  let baixou = false;
  if (!decl.declaracao_path) {
    // PDF ainda não guardado: baixa pela mesma rotina do botão "Declaração (PDF)" (1 consulta ao Serpro, cobrada uma vez).
    const resp = await documentos({ contact_id: c.contato!.id, periodo: payload.periodo }, uid, via);
    const j = await resp.clone().json().catch(() => null);
    if (!j?.ok) return resp;
    baixou = true;
    decl = await declaracaoDoPeriodo(c.contato!.id, periodo);
    if (!decl?.declaracao_path) return json({ ok: false, error: "O Serpro não devolveu o PDF da declaração" }, 502);
  }
  try {
    const f = await lerEGravar(decl, c.cnpj!);
    if (!via?.semAviso) await avisarConclusoes(supabase, COMPANY_ID, c.contato!.name ?? "Cliente", f.tarefasConcluidas);
    return json({ ok: true, baixou, id: f.id, confiavel: f.confiavel, avisos: f.avisos, tarefas_concluidas: f.tarefasConcluidas });
  } catch (e) {
    return json({ ok: false, baixou, error: `O PDF está guardado, mas não consegui lê-lo: ${(e as Error).message}` });
  }
}

// ---------- rotina mensal de faturamento ----------
const LIMITE_SIMPLES = 4_800_000;
/** Dia 30 de todo mês; em fevereiro, o último dia do mês. */
const ehDiaDaRodada = (hoje: string) => {
  const ano = Number(hoje.slice(0, 4)), mes = Number(hoje.slice(5, 7));
  return Number(hoje.slice(8, 10)) === Math.min(30, new Date(Date.UTC(ano, mes, 0)).getUTCDate());
};

/** Mesmos cortes da tela de Faturamento (src/hooks/useSerproFaturamento.ts): base = maior entre RBA e RBT12; 80% atenção, 95% crítico; sublimite perto a partir de 80%. */
function nivelDaLeitura(f: { rba_total: number | null; rbt12_total: number | null; limite_total: number | null; sublimite: number | null; confiavel: boolean | null }) {
  if (!f.confiavel) return { limite: null as string | null, sublimite: null as string | null };
  const a = f.rba_total, b = f.rbt12_total;
  if (a === null && b === null) return { limite: null, sublimite: null };
  const base = ((a ?? -1) >= (b ?? -1) ? a : b) as number;
  const lim = f.limite_total && f.limite_total > 0 ? f.limite_total : LIMITE_SIMPLES;
  const p = (base / lim) * 100;
  const limite = p > 100 ? "acima" : p >= 95 ? "critico" : p >= 80 ? "atencao" : "regular";
  const sublimite = !f.sublimite ? null : base > f.sublimite ? "acima" : base >= 0.8 * f.sublimite ? "perto" : "regular";
  return { limite, sublimite };
}

/** Um aviso por rotina e por dia no sino (admins e quem tem o módulo dashboard_federal). */
async function avisarRotina(titulo: string, corpo: string, hoje: string) {
  try {
    const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true })
      .eq("company_id", COMPANY_ID).eq("type", "serpro_faturamento").eq("title", titulo).gte("created_at", `${hoje}T03:00:00Z`);
    if ((count ?? 0) > 0) return;
    const { data: alvos } = await supabase.from("profiles").select("user_id")
      .eq("company_id", COMPANY_ID).eq("status_active", true).or("role.in.(admin,super_admin),allowed_modules.cs.{dashboard_federal}");
    if (!alvos?.length) return;
    await supabase.from("notifications").insert(alvos.map((t: { user_id: string }) => ({
      user_id: t.user_id, company_id: COMPANY_ID, type: "serpro_faturamento", title: titulo, body: corpo, action_url: "/dashboard-federal/faturamento",
    })));
  } catch (e) {
    console.error("Falha ao avisar a leitura de faturamento:", String((e as Error).message || e));
  }
}

/**
 * Rotina mensal de faturamento (decisão de Gabriel, 01/10/2026; de bimestral para mensal em 02/10/2026). O cron bate todo dia, em 8 horários; quem decide é o interruptor de Tech
 * (padrão ligado) e a DATA. Mês de referência = mês anterior. Lê a declaração vigente de cada cliente do Simples que já está no índice e ainda não foi lida.
 * Guardas: até 60 clientes e 100 s por disparo; para depois de 5 falhas seguidas do Serpro (PDF que não consigo ler não conta como falha do Serpro e não custa nada de novo).
 */
async function rotinaFaturamento(payload: any, uid: string | null, unica = false) {
  const hoje = hojeBR();
  // `adm`: administrador logado OU chave de uso curto (rodada única de atualização). Só `adm` simula, ignora a data e escolhe o mês.
  const adm = !!uid || unica;
  const simulando = adm && payload.dry_run === true;
  const { data: cfg } = await supabase.from("serpro_config").select("auto_leitura_faturamento").eq("company_id", COMPANY_ID).maybeSingle();
  if (!simulando && !unica && cfg?.auto_leitura_faturamento === false) return json({ ok: true, desligada: true });
  if (!(adm && payload.ignorar_data === true) && !ehDiaDaRodada(hoje)) return json({ ok: true, nada_a_fazer: true, hoje });

  // Mês de referência: o anterior ao de hoje. Na rodada de atualização (adm) pode ser outro mês ("AAAA-MM"), ex.: o último com o prazo do PGDAS-D já vencido.
  const pa = adm && /^\d{4}-(0[1-9]|1[0-2])$/.test(String(payload.mes_de_referencia ?? ""))
    ? String(payload.mes_de_referencia)
    : new Date(Date.UTC(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const periodo = `${pa}-01`;
  const mes = `${pa.slice(5, 7)}/${pa.slice(0, 4)}`;
  const { tentaveis, semProcuracao } = await carteiraDoSimples(Number(pa.slice(0, 4)));

  // Declaração vigente de cada cliente no mês (a mais recente transmitida) e o que já foi lido dela.
  const { data: decls } = await supabase.from("serpro_pgdasd_declaracoes").select("contact_id,numero_declaracao,transmitida_em,declaracao_path")
    .eq("company_id", COMPANY_ID).eq("periodo_apuracao", periodo).order("transmitida_em", { ascending: false }).limit(5000);
  const vigente = new Map<string, { numero: string; path: string | null }>();
  for (const d of (decls ?? []) as { contact_id: string; numero_declaracao: string; declaracao_path: string | null }[]) {
    if (!vigente.has(d.contact_id)) vigente.set(d.contact_id, { numero: d.numero_declaracao, path: d.declaracao_path });
  }
  const { data: lidas } = await supabase.from("serpro_faturamento").select("contact_id,numero_declaracao").eq("company_id", COMPANY_ID).eq("periodo_apuracao", periodo).limit(5000);
  const jaLido = new Set((lidas ?? []).map((r: { contact_id: string; numero_declaracao: string }) => `${r.contact_id}|${r.numero_declaracao}`));
  const comDeclaracao = tentaveis.filter((c: any) => vigente.has(c.id));
  // Quem já teve o PDF pedido HOJE e continua sem ele guardado (ex.: a Receita devolveu uma declaração que ainda não está na lista) não é cobrado de novo no mesmo dia:
  // sem isso, cada disparo da rodada repetiria a chamada paga do mesmo cliente.
  const { data: pedidos } = await supabase.from("serpro_call_log").select("contact_id,created_at")
    .eq("company_id", COMPANY_ID).eq("id_servico", "CONSULTIMADECREC14").gte("created_at", `${hoje}T03:00:00Z`).limit(1000);
  const pedidoHoje = new Set(((pedidos ?? []) as { contact_id: string | null; created_at: string }[]).filter((r) => r.contact_id && dataBRde(r.created_at) === hoje).map((r) => r.contact_id as string));
  const alvo = comDeclaracao.filter((c: any) => !jaLido.has(`${c.id}|${vigente.get(c.id)!.numero}`) && !(pedidoHoje.has(c.id) && !vigente.get(c.id)!.path));
  const aBaixar = alvo.filter((c: any) => !vigente.get(c.id)!.path).length;

  if (simulando) {
    return json({ ok: true, dry_run: true, hoje, mes_de_referencia: pa, com_declaracao: comDeclaracao.length, ja_lidos: comDeclaracao.length - alvo.length, a_ler: alvo.length,
      a_baixar_cobrado: aBaixar, ja_com_pdf_gratis: alvo.length - aBaixar, sem_procuracao_pulados: semProcuracao.length, custo_estimado_reais: Math.round(aBaixar * 0.24 * 100) / 100 });
  }

  const inicio = Date.now();
  const resumo = { lidos: 0, baixados: 0, a_conferir: 0, erros: 0, tarefas_concluidas: 0 };
  const falhas: string[] = [];
  let seguidas = 0, processados = 0;
  for (const c of alvo) {
    if (processados >= 60 || Date.now() - inicio > 100_000 || seguidas >= 5) break;
    processados++;
    const resp = await lerFaturamento({ contact_id: c.id, periodo: pa }, uid, {
      origem: adm ? "manual" : "cron", semAviso: true,
      finalidade: `${unica ? "Rodada de atualização do faturamento do Simples (aprovada por Gabriel em 01/10/2026, antes da primeira rodada mensal)" : "Rotina mensal de faturamento do Simples"}: baixar a declaração do PGDAS-D de ${mes} e ler receita e limites, para acompanhamento fiscal da carteira`,
    });
    const j = await resp.json().catch(() => null);
    if (j?.ok === true) {
      seguidas = 0;
      resumo.lidos++;
      if (j.baixou === true) resumo.baixados++;
      if (j.confiavel === false) resumo.a_conferir++;
      resumo.tarefas_concluidas += Number(j.tarefas_concluidas ?? 0);
    } else {
      // PDF guardado que não consegui ler não é falha do Serpro (e tentar de novo não cobra): não conta para a parada.
      if (!String(j?.error ?? "").startsWith("O PDF está guardado")) seguidas++;
      resumo.erros++;
      if (falhas.length < 10) falhas.push(`${c.display_name || c.name}: ${String(j?.error ?? j?.status ?? "falha")}`);
    }
    await sleep(150);
  }
  const restantes = alvo.length - processados;
  if (resumo.tarefas_concluidas > 0) await avisarConclusoes(supabase, COMPANY_ID, `${resumo.lidos} ${resumo.lidos === 1 ? "cliente" : "clientes"} do Simples (leitura mensal de faturamento)`, resumo.tarefas_concluidas);

  if (seguidas >= 5) {
    await avisarRotina("Leitura de faturamento do Simples parou por falhas", `A Receita falhou ${resumo.erros} vezes seguidas. Nada mais foi cobrado. Veja o registro de chamadas em Tech.`, hoje);
  } else if (restantes === 0 && processados > 0) {
    // Fim da rodada: resumo dos alertas com TODAS as leituras do mês (inclusive as feitas em disparos anteriores).
    const { data: todas } = await supabase.from("serpro_faturamento").select("rba_total,rbt12_total,limite_total,sublimite,confiavel").eq("company_id", COMPANY_ID).eq("periodo_apuracao", periodo).limit(5000);
    let acima = 0, atencao = 0, perto = 0, aConferir = 0;
    for (const f of (todas ?? []) as any[]) {
      if (!f.confiavel) { aConferir++; continue; }
      const n = nivelDaLeitura(f);
      if (n.limite === "acima" || n.sublimite === "acima") acima++;
      if (n.limite === "atencao" || n.limite === "critico") atencao++;
      if (n.sublimite === "perto") perto++;
    }
    await avisarRotina(unica ? "Atualização do faturamento do Simples concluída" : "Leitura de faturamento do Simples concluída",
      `${(todas ?? []).length} declarações de ${mes} lidas · ${acima} acima do limite ou sublimite · ${atencao} em atenção (80% do limite ou mais) · ${perto} perto do sublimite · ${aConferir} com leitura a conferir.`, hoje);
  }
  return json({ ok: true, hoje, mes_de_referencia: pa, a_ler: alvo.length, a_baixar_cobrado: aBaixar, sem_procuracao_pulados: semProcuracao.length, ...resumo, restantes, parou_por_falhas: seguidas >= 5, falhas, segundos: Math.round((Date.now() - inicio) / 1000) });
}

const PASTA_TIPO: Record<string, { tabela: "serpro_pgdasd_declaracoes" | "serpro_pgdasd_das"; coluna: string; prefixo: string }> = {
  declaracao: { tabela: "serpro_pgdasd_declaracoes", coluna: "declaracao_path", prefixo: "declaracao" },
  recibo: { tabela: "serpro_pgdasd_declaracoes", coluna: "recibo_path", prefixo: "recibo" },
  maed_notificacao: { tabela: "serpro_pgdasd_declaracoes", coluna: "maed_notificacao_path", prefixo: "maed-notificacao" },
  maed_darf: { tabela: "serpro_pgdasd_declaracoes", coluna: "maed_darf_path", prefixo: "maed-darf" },
  das: { tabela: "serpro_pgdasd_das", coluna: "das_path", prefixo: "das" },
  extrato: { tabela: "serpro_pgdasd_das", coluna: "extrato_path", prefixo: "extrato" },
};

async function link(payload: any) {
  const t = PASTA_TIPO[String(payload.tipo ?? "")];
  if (!t) return json({ error: "Tipo de arquivo inválido" }, 400);
  const { data } = await supabase.from(t.tabela).select("*").eq("id", String(payload.id ?? "")).eq("company_id", COMPANY_ID).maybeSingle();
  const linha = (data ?? {}) as Record<string, string | null>;
  const path = linha[t.coluna];
  if (!path) return json({ ok: false, error: "Arquivo ainda não baixado" });
  const nome = `${t.prefixo}-${linha.numero_declaracao ?? linha.numero_das ?? ""}.pdf`;
  const url = await assinar(path, nome);
  return url ? json({ ok: true, url }) : json({ ok: false, error: "Não foi possível gerar o link" }, 500);
}

async function publicar(payload: any) {
  if (typeof payload.visivel_portal !== "boolean") return json({ error: "visivel_portal inválido" }, 400);
  const tabela = payload.tabela === "das" ? "serpro_pgdasd_das" : payload.tabela === "declaracao" ? "serpro_pgdasd_declaracoes" : null;
  if (!tabela) return json({ error: "tabela inválida" }, 400);
  const { error } = await supabase.from(tabela).update({ visivel_portal: payload.visivel_portal }).eq("id", String(payload.id ?? "")).eq("company_id", COMPANY_ID);
  return error ? json({ error: error.message }, 500) : json({ ok: true });
}

// ---------- entrada ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const payload = await req.json().catch(() => ({}));

  // Passe único da carteira por chave de uso único: a chave (guardada só como hash no banco, com validade curta) é criada por quem tem acesso ao banco.
  if (payload.action === "consultar_carteira" && req.headers.get("x-lote-token")) {
    const dados = new TextEncoder().encode(String(req.headers.get("x-lote-token")));
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", dados))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const { data: cfg } = await supabase.from("serpro_config").select("lote_token_hash,lote_token_expira").eq("company_id", COMPANY_ID).maybeSingle();
    if (cfg?.lote_token_hash && cfg.lote_token_hash === hash && cfg.lote_token_expira && Date.parse(cfg.lote_token_expira) > Date.now()) {
      return await consultarCarteira(payload, null);
    }
    return json({ error: "Chave do passe inválida ou vencida" }, 403);
  }

  // Rodada única de atualização do faturamento por chave de uso curto (ver _shared/lote-token.ts): mesma rotina, a qualquer data, sem depender do interruptor.
  if (payload.action === "rotina_faturamento" && req.headers.get("x-lote-token")) {
    if (!(await loteTokenValido(supabase, COMPANY_ID, req))) return json({ error: "Chave da rodada inválida ou vencida" }, 403);
    return await rotinaFaturamento(payload, null, true);
  }

  // Cron chama com a chave anon (padrão do projeto). A rotina decide pela DATA e tem teto por disparo: pedido repetido ou fora de hora não cobra nada.
  if (payload.action === "rotina_pgdas" && (bearer === Deno.env.get("SUPABASE_ANON_KEY") || jwtRole(bearer) === "anon")) {
    return await rotinaPgdas({}, null);
  }

  // Rotina mensal de faturamento: cron com a chave anon; quem decide é o interruptor e a data (fora do dia, não cobra nada).
  if (payload.action === "rotina_faturamento" && (bearer === Deno.env.get("SUPABASE_ANON_KEY") || jwtRole(bearer) === "anon")) {
    return await rotinaFaturamento({}, null);
  }

  const { data: userData } = await supabase.auth.getUser(bearer);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "Não autenticado" }, 401);
  const { data: perfil } = await supabase.from("profiles").select("role,is_super_admin,company_id").eq("user_id", uid).maybeSingle();
  const admin = perfil?.is_super_admin === true || (perfil?.role === "admin" && perfil?.company_id === COMPANY_ID);
  const equipe = admin || (perfil?.role === "colaborador" && perfil?.company_id === COMPANY_ID);
  if (!equipe) return json({ error: "Sem permissão" }, 403);

  switch (payload.action) {
    case "consultar": return await consultar(payload, uid);
    case "consultar_carteira":
      if (!admin) return json({ error: "Só administradores consultam a carteira" }, 403);
      return await consultarCarteira(payload, uid);
    case "rotina_pgdas":
      if (!admin) return json({ error: "Só administradores rodam a rotina manualmente" }, 403);
      return await rotinaPgdas(payload, uid);
    case "rotina_faturamento":
      if (!admin) return json({ error: "Só administradores rodam a rotina manualmente" }, 403);
      return await rotinaFaturamento(payload, uid);
    case "documentos": return await documentos(payload, uid);
    case "extrato": return await extrato(payload, uid);
    case "gerar_das": return await gerarDas(payload, uid);
    case "ler_faturamento": return await lerFaturamento(payload, uid);
    case "link": return await link(payload);
    case "publicar": return await publicar(payload);
    default: return json({ error: "action inválida (consultar | consultar_carteira | rotina_pgdas | rotina_faturamento | documentos | extrato | gerar_das | ler_faturamento | link | publicar)" }, 400);
  }
});
