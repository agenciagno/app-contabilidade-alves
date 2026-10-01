import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { criarSerpro, jwtRole, onlyDigits, sleep } from "../_shared/serpro-core.ts";
import { pega } from "../_shared/pgdasd-indice.ts";
import { assinar, guardarPdf } from "../_shared/serpro-arquivos.ts";
import { lerRelatorioSitfis } from "../_shared/sitfis-extrair.ts";
import { lerTodas } from "../_shared/paginar.ts";

// ---------------------------------------------------------------------------
// Situação Fiscal (SITFIS, Serpro Integra Contador) — F4 Onda 3, 30/09/2026. Só leitura.
//
// Ações (sempre UM cliente por vez, por clique):
//   gerar  { contact_id, force? }   SOLICITARPROTOCOLO91 (/Apoiar, não cobrada) → espera o tempo informado → RELATORIOSITFIS92 (/Emitir,
//                                   cobrada em 200 E em 202). Guarda o PDF no bucket privado e lê o resultado (sem pendências / com
//                                   pendências / não lido). Se o relatório ainda estiver em processamento (202), o protocolo fica guardado e
//                                   o próximo clique só repete o /Emitir, sem pedir protocolo novo.
//   rotina_sitfis (cron de 5 em 5 min, 19:00 a 19:55 BRT; decisão de Gabriel, 01/10/2026: "consulta bimestral, rodada um em 30/10, sem rodada inaugural"):
//                                   a cada dois meses (dia 30 de outubro, dezembro, fevereiro [último dia], abril, junho e agosto) gera o relatório de TODOS os clientes
//                                   ativos (matriz). Cada disparo faz um lote (até 30): pede os protocolos (grátis), espera o tempo informado UMA vez e emite cada relatório
//                                   (R$ 0,32, cobrado também no 202, por isso a espera). Quem já tem relatório de hoje é pulado; protocolo em aberto (até 10 min) é reaproveitado.
//                                   Cliente sem procuração para a Situação Fiscal (00002) fica de fora. Para após 5 falhas seguidas; limite de solicitações do Serpro (AV02/AV03)
//                                   interrompe os pedidos do lote sem custo e o próximo disparo continua. Um aviso no sino ao fim da rodada. Depois dela, a rotina diária das 08:00 cria a
//                                   tarefa de quem tem pendência. Interruptor: serpro_config.auto_rotina_sitfis (padrão ligado). Admin simula com { dry_run: true, ignorar_data?: true } (não cobra).
//   link   { id }                   link assinado (10 min) do PDF guardado (sem chamada ao Serpro).
//   reler  { id }                   lê de novo o PDF guardado (sem custo), para quando a regra de leitura melhorar.
//
// Só clientes com status "Ativo". Filial é recusada: o relatório é do CNPJ da matriz. Procuração: 00002 (Situação Fiscal).
// ---------------------------------------------------------------------------

const COMPANY_ID = "5cd08fcd-c095-4f08-b3a8-c02b9bf1034e";
const STATUS_MONITORADO = "Ativo";
const RECENTE_MIN = 15;
const PROTOCOLO_VALE_MIN = 10; // protocolo guardado mais velho que isto é descartado (pede um novo)
const ESPERA_MIN_MS = 2000;
const ESPERA_MAX_MS = 50_000;
const BUCKET = "serpro-sitfis";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const { serpro, CONTRATANTE_NI, AUTOR_NI } = criarSerpro(supabase, COMPANY_ID);
const CNPJS_DA_CA = new Set([CONTRATANTE_NI, AUTOR_NI]);

const msgErro = (r: { resposta: any }) => r.resposta?.mensagens?.[0]?.texto ?? r.resposta?.error ?? "Falha na consulta ao Serpro";
const codigo = (r: { resposta: any }) => String(r.resposta?.mensagens?.[0]?.codigo ?? "");

/** "tempoEspera": a documentação diz milissegundos, mas o exemplo dela traz 30. Até 99 lê como segundos; de 100 em diante, milissegundos. */
function esperaMs(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return ESPERA_MIN_MS;
  const ms = n < 100 ? n * 1000 : n;
  return Math.min(Math.max(ms, ESPERA_MIN_MS), ESPERA_MAX_MS);
}

async function carregarCliente(contactId: string) {
  const { data: c } = await supabase.from("contacts").select("id,name,document,status_cliente").eq("id", contactId).eq("company_id", COMPANY_ID).maybeSingle();
  if (!c) return { resp: json({ error: "Cliente não encontrado" }, 404) };
  if (c.status_cliente !== STATUS_MONITORADO) {
    return { resp: json({ ok: false, foraDoMonitoramento: true, error: `Cliente fora do monitoramento (status: ${c.status_cliente ?? "sem status"}). O Serpro só é consultado para clientes com status "${STATUS_MONITORADO}".` }) };
  }
  const cnpj = onlyDigits(c.document);
  if (cnpj.length !== 14) return { resp: json({ error: "Cliente sem CNPJ válido" }, 400) };
  if (cnpj.slice(8, 12) !== "0001") return { resp: json({ ok: false, filial: true, error: "Este CNPJ é de filial. O relatório de situação fiscal é da matriz: consulte o CNPJ da matriz." }) };
  return { contato: c, cnpj };
}

/** Texto do PDF guardado. `unpdf` é carregado só aqui: se a biblioteca falhar, o resto da função continua funcionando. */
async function textoDoPdf(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("npm:unpdf@1.8.1");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

async function lerPdfGuardado(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error("PDF não encontrado no armazenamento");
  return lerRelatorioSitfis(await textoDoPdf(new Uint8Array(await data.arrayBuffer())));
}

const camposDaLeitura = (l: ReturnType<typeof lerRelatorioSitfis>) => ({
  resultado: l.resultado, categorias: l.categorias, confiavel: l.confiavel, avisos: l.avisos,
  certidao_tipo: l.certidao?.tipo ?? null, certidao_emissao: l.certidao?.emissao ?? null, certidao_validade: l.certidao?.validade ?? null,
});

type Resp = { corpo: Record<string, unknown>; http: number };
const resp = (corpo: Record<string, unknown>, http = 200): Resp => ({ corpo, http });
/** Quem pede: clique da equipe (padrão) ou a rotina agendada. */
type Via = { origem: "manual" | "cron"; finalidadeProtocolo?: string; finalidadeEmissao?: string; marcarErro?: boolean };

/** Pede o protocolo do relatório (/Apoiar, não cobrado) e grava o registro "aguardando". */
async function pedirProtocolo(contactId: string, cnpj: string, uid: string | null, via: Via):
  Promise<{ ok: true; registroId: string; protocolo: string; espera: number } | { ok: false; resp: Resp; semProtocolo?: boolean; semProcuracao?: boolean }> {
  const a = await serpro({
    tipo: "Apoiar", idSistema: "SITFIS", idServico: "SOLICITARPROTOCOLO91", versao: "2.0",
    contribuinte: { numero: cnpj, tipo: 2 }, dados: "",
    uid, contactId, origem: via.origem,
    finalidade: via.finalidadeProtocolo ?? "Solicitação do protocolo do relatório de situação fiscal acionada por usuário para acompanhamento fiscal do cliente",
  });
  if (a.status === 403) return { ok: false, semProcuracao: true, resp: resp({ ok: false, semProcuracao: true, status: 403, error: "Sem procuração eletrônica para a Situação Fiscal deste cliente" }) };
  const d = a.resposta?.dados;
  const prot = pega(d, "protocoloRelatorio");
  const espera = esperaMs(pega(d, "tempoEspera"));
  // AV02 (limite de solicitações em processamento) e 503 (AV03) vêm sem protocolo: é só esperar o tempo informado e tentar de novo.
  if (!prot || typeof prot !== "string") {
    const seg = Math.ceil(espera / 1000);
    return { ok: false, semProtocolo: true, resp: resp({ ok: false, aguarde: seg, error: `O Serpro pediu para esperar ${seg} segundos antes de gerar este relatório. Clique de novo depois.`, detalhe: codigo(a) || msgErro(a) }) };
  }
  const { data: novo, error } = await supabase.from("serpro_sitfis").insert({ company_id: COMPANY_ID, contact_id: contactId, solicitado_por: uid, protocolo: prot, status: "aguardando" }).select("id").maybeSingle();
  if (error || !novo) return { ok: false, resp: resp({ ok: false, error: `Protocolo obtido, mas não foi possível gravar: ${error?.message ?? "sem retorno"}` }, 500) };
  return { ok: true, registroId: novo.id as string, protocolo: prot, espera };
}

/** Emite o relatório (/Emitir, cobrado em 200 e em 202), guarda o PDF e lê o resultado. */
async function emitirRelatorio(contactId: string, cnpj: string, registroId: string, protocolo: string, uid: string | null, via: Via): Promise<Resp> {
  const e = await serpro({
    tipo: "Emitir", idSistema: "SITFIS", idServico: "RELATORIOSITFIS92", versao: "2.0",
    contribuinte: { numero: cnpj, tipo: 2 }, dados: JSON.stringify({ protocoloRelatorio: protocolo }),
    uid, contactId, origem: via.origem,
    finalidade: via.finalidadeEmissao ?? "Emissão do relatório de situação fiscal confirmada por usuário para acompanhamento fiscal do cliente",
  });
  // Na rotina, emissão que falha (cobrada) fecha o registro como erro: a rotina não tenta de novo o mesmo cliente no mesmo dia (cada tentativa custa).
  const fechar = async () => { if (via.marcarErro) await supabase.from("serpro_sitfis").update({ status: "erro", protocolo: null, avisos: ["falha na emissão pela rotina bimestral"] }).eq("id", registroId); };
  if (e.status === 403) { await fechar(); return resp({ ok: false, semProcuracao: true, status: 403, error: "Sem procuração eletrônica para a Situação Fiscal deste cliente" }); }
  if (e.status === 202) {
    const seg = Math.ceil(esperaMs(pega(e.resposta?.dados, "tempoEspera")) / 1000);
    return resp({ ok: true, processando: true, aguarde: seg, id: registroId });
  }
  if (e.status !== 200) {
    // ER05 = "inicie uma nova solicitação": o protocolo não serve mais.
    if (/ER05/.test(codigo(e))) await supabase.from("serpro_sitfis").update({ status: "erro", protocolo: null }).eq("id", registroId);
    else await fechar();
    return resp({ ok: false, status: e.status, error: msgErro(e) });
  }

  const b64 = pega(e.resposta?.dados, "pdf");
  const path = await guardarPdf(supabase, BUCKET, `${COMPANY_ID}/${contactId}/sitfis-${registroId}.pdf`, b64);
  if (!path) {
    await supabase.from("serpro_sitfis").update({ status: "erro", protocolo: null, avisos: ["o Serpro devolveu 200 mas o PDF não veio em formato válido"] }).eq("id", registroId);
    return resp({ ok: false, error: "O Serpro respondeu, mas o PDF do relatório não veio em formato válido" }, 502);
  }
  let leitura: Record<string, unknown> = { resultado: "nao_lido", confiavel: false, avisos: ["não consegui ler o PDF: abra o arquivo"], categorias: [] };
  try { leitura = camposDaLeitura(await lerPdfGuardado(path)); } catch (err) { leitura.avisos = [`não consegui ler o PDF: ${(err as Error).message}`]; }
  await supabase.from("serpro_sitfis").update({ status: "pronto", protocolo: null, pdf_path: path, gerado_em: new Date().toISOString(), ...leitura }).eq("id", registroId);
  return resp({ ok: true, id: registroId, resultado: leitura.resultado, confiavel: leitura.confiavel, avisos: leitura.avisos });
}

async function gerar(payload: any, uid: string) {
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const contactId = c.contato!.id;

  if (!payload.force) {
    const { data: ja } = await supabase.from("serpro_sitfis").select("gerado_em").eq("contact_id", contactId).eq("status", "pronto").order("gerado_em", { ascending: false }).limit(1).maybeSingle();
    if (ja?.gerado_em && Date.now() - Date.parse(ja.gerado_em) < RECENTE_MIN * 60_000) return json({ ok: true, recente: true, gerado_em: ja.gerado_em });
  }

  // Solicitação em aberto (um /Emitir anterior voltou 202): repete só o /Emitir, sem pedir protocolo novo.
  const { data: aberta } = await supabase.from("serpro_sitfis").select("id,protocolo,solicitado_em").eq("contact_id", contactId).eq("status", "aguardando")
    .not("protocolo", "is", null).order("solicitado_em", { ascending: false }).limit(1).maybeSingle();
  const via: Via = { origem: "manual" };
  let registroId: string;
  let protocolo: string;
  if (aberta?.protocolo && Date.now() - Date.parse(aberta.solicitado_em) < PROTOCOLO_VALE_MIN * 60_000) {
    registroId = aberta.id; protocolo = aberta.protocolo;
  } else {
    const p = await pedirProtocolo(contactId, c.cnpj!, uid, via);
    if ("resp" in p) return json(p.resp.corpo, p.resp.http);
    registroId = p.registroId; protocolo = p.protocolo;
    await sleep(p.espera + 1000); // esperar o prazo informado evita pagar um 202 (cobrado igual ao 200)
  }
  const r = await emitirRelatorio(contactId, c.cnpj!, registroId, protocolo, uid, via);
  return json(r.corpo, r.http);
}

// ---------- rotina bimestral ----------
const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const dataBRde = (iso: string) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 10);
const LOTE = 30;               // relatórios por disparo
const PRECO_EMITIR = 0.32;     // R$ por relatório (faixa até 500 emissões no ciclo)
/** Dia 30 dos meses pares (out, dez, fev, abr, jun, ago); em fevereiro, o último dia do mês. */
const ehDiaDoBimestre = (hoje: string) => {
  const ano = Number(hoje.slice(0, 4)), mes = Number(hoje.slice(5, 7));
  return mes % 2 === 0 && Number(hoje.slice(8, 10)) === Math.min(30, new Date(Date.UTC(ano, mes, 0)).getUTCDate());
};

/** Um aviso por rodada e por dia no sino (admins e quem tem o módulo dashboard_federal). */
async function avisarRodada(titulo: string, corpo: string, hoje: string) {
  try {
    const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true })
      .eq("company_id", COMPANY_ID).eq("type", "serpro_sitfis").eq("title", titulo).gte("created_at", `${hoje}T03:00:00Z`);
    if ((count ?? 0) > 0) return;
    const { data: alvos } = await supabase.from("profiles").select("user_id")
      .eq("company_id", COMPANY_ID).eq("status_active", true).or("role.in.(admin,super_admin),allowed_modules.cs.{dashboard_federal}");
    if (!alvos?.length) return;
    await supabase.from("notifications").insert(alvos.map((t: { user_id: string }) => ({
      user_id: t.user_id, company_id: COMPANY_ID, type: "serpro_sitfis", title: titulo, body: corpo, action_url: "/dashboard-federal/situacao-fiscal",
    })));
  } catch (e) {
    console.error("Falha ao avisar a rodada da Situação Fiscal:", String((e as Error).message || e));
  }
}

/** Clientes da rodada: ativos, matriz, CNPJ válido, sem os CNPJs da CA e sem procuração negada para a Situação Fiscal (00002). */
async function clientesDaRodada() {
  const { data: contatos } = await supabase.from("contacts").select("id,name,display_name,document")
    .eq("company_id", COMPANY_ID).eq("is_active", true).eq("status_cliente", STATUS_MONITORADO).order("name");
  // O mapa de procurações passa de 1.000 linhas (teto do banco por consulta): lê em páginas.
  const procs = await lerTodas<{ contact_id: string; status: string; data_fim: string | null }>((de, ate) => supabase.from("serpro_procuracoes").select("contact_id,status,data_fim")
    .eq("company_id", COMPANY_ID).eq("fonte", "integra_procuracoes").eq("codigo_procuracao", "00002").order("id").range(de, ate));
  const hoje = hojeBR();
  const comMapa = new Map<string, boolean>();
  for (const r of procs) comMapa.set(r.contact_id, (comMapa.get(r.contact_id) ?? false) || (r.status === "ativa" && (!r.data_fim || r.data_fim >= hoje)));
  const elegiveis = (contatos ?? []).filter((c: any) => {
    const cnpj = onlyDigits(c.document);
    return cnpj.length === 14 && cnpj.slice(8, 12) === "0001" && !CNPJS_DA_CA.has(cnpj);
  });
  const semProcuracao = elegiveis.filter((c: any) => comMapa.has(c.id) && comMapa.get(c.id) === false);
  const fora = new Set(semProcuracao.map((c: any) => c.id));
  return { elegiveis, tentaveis: elegiveis.filter((c: any) => !fora.has(c.id)), semProcuracao: semProcuracao.length };
}

/**
 * Rotina bimestral (decisão de Gabriel, 01/10/2026). O cron bate de 5 em 5 minutos; quem decide é o interruptor (padrão ligado) e a DATA. Cada disparo faz um lote:
 * pede os protocolos (grátis), espera uma vez e emite. Guardas: 100 s de relógio, 5 falhas seguidas, limite de solicitações do Serpro interrompe os pedidos sem custo.
 */
async function rotinaSitfis(payload: any, uid: string | null) {
  const hoje = hojeBR();
  const simulando = !!uid && payload.dry_run === true;
  const { data: cfg } = await supabase.from("serpro_config").select("auto_rotina_sitfis").eq("company_id", COMPANY_ID).maybeSingle();
  if (!simulando && cfg?.auto_rotina_sitfis === false) return json({ ok: true, desligada: true });
  if (!(uid && payload.ignorar_data === true) && !ehDiaDoBimestre(hoje)) return json({ ok: true, nada_a_fazer: true, hoje });

  const { elegiveis, tentaveis, semProcuracao } = await clientesDaRodada();
  // Hoje: quem já tem relatório pronto, quem falhou na emissão (não repete no mesmo dia: cada emissão custa) e quem já gastou 3 solicitações (relatório que não fecha).
  const { data: deHoje } = await supabase.from("serpro_sitfis").select("contact_id,status,solicitado_em").eq("company_id", COMPANY_ID).gte("solicitado_em", `${hoje}T03:00:00Z`).limit(5000);
  const doDia = ((deHoje ?? []) as { contact_id: string; status: string; solicitado_em: string }[]).filter((r) => dataBRde(r.solicitado_em) === hoje);
  const jaFeitos = new Set<string>(), falhouHoje = new Set<string>(), tentativas = new Map<string, number>();
  for (const r of doDia) {
    if (r.status === "pronto") jaFeitos.add(r.contact_id);
    if (r.status === "erro") falhouHoje.add(r.contact_id);
    tentativas.set(r.contact_id, (tentativas.get(r.contact_id) ?? 0) + 1);
  }
  const alvo = tentaveis.filter((c: any) => !jaFeitos.has(c.id) && !falhouHoje.has(c.id) && (tentativas.get(c.id) ?? 0) < 3);
  if (simulando) {
    return json({ ok: true, dry_run: true, hoje, no_escopo: tentaveis.length, ja_feitos_hoje: tentaveis.length - alvo.length, a_gerar: alvo.length, sem_procuracao_pulados: semProcuracao,
      custo_estimado_reais: Math.round(alvo.length * PRECO_EMITIR * 100) / 100, disparos_necessarios: Math.ceil(alvo.length / LOTE) });
  }

  const inicio = Date.now();
  const lote = alvo.slice(0, LOTE);
  const via: Via = {
    origem: uid ? "manual" : "cron", marcarErro: true,
    finalidadeProtocolo: "Rotina bimestral da Situação Fiscal: solicitar o protocolo do relatório de situação fiscal, para acompanhamento fiscal da carteira",
    finalidadeEmissao: "Rotina bimestral da Situação Fiscal: emitir o relatório de situação fiscal da carteira, para acompanhamento fiscal do cliente",
  };
  // Protocolos em aberto (menos de 10 min, de um disparo que não terminou): só falta emitir.
  const { data: abertas } = await supabase.from("serpro_sitfis").select("id,contact_id,protocolo,solicitado_em").eq("company_id", COMPANY_ID).eq("status", "aguardando").not("protocolo", "is", null).limit(5000);
  const aberta = new Map<string, { id: string; protocolo: string }>();
  for (const r of (abertas ?? []) as { id: string; contact_id: string; protocolo: string; solicitado_em: string }[]) {
    if (Date.now() - Date.parse(r.solicitado_em) < PROTOCOLO_VALE_MIN * 60_000 && !aberta.has(r.contact_id)) aberta.set(r.contact_id, { id: r.id, protocolo: r.protocolo });
  }

  // Fase 1: pede os protocolos (grátis). Limite de solicitações (AV02/AV03) interrompe os pedidos: o próximo disparo continua.
  const prontos: { c: any; cnpj: string; registroId: string; protocolo: string }[] = [];
  let maiorEspera = 0, pediuNovo = false, falhasDePedido = 0, semProtocolo = false;
  const falhas: string[] = [];
  for (const c of lote) {
    const cnpj = onlyDigits(c.document);
    const ab = aberta.get(c.id);
    if (ab) { prontos.push({ c, cnpj, registroId: ab.id, protocolo: ab.protocolo }); continue; }
    const p = await pedirProtocolo(c.id, cnpj, uid, via);
    if ("resp" in p) {
      if (p.semProtocolo) { semProtocolo = true; break; }
      falhasDePedido++;
      if (falhas.length < 10) falhas.push(`${c.display_name || c.name}: ${String(p.resp.corpo.error ?? "falha")}`);
      continue;
    }
    pediuNovo = true;
    maiorEspera = Math.max(maiorEspera, p.espera);
    prontos.push({ c, cnpj, registroId: p.registroId, protocolo: p.protocolo });
    await sleep(100);
  }
  // Espera UMA vez o maior tempo informado (emitir antes dá 202, que é cobrado igual).
  if (pediuNovo) await sleep(maiorEspera + 1000);

  // Fase 2: emite. Para ao estourar o relógio (os protocolos continuam valendo 10 min) ou após 5 falhas seguidas.
  const resumo = { gerados: 0, com_pendencias: 0, sem_pendencias: 0, a_conferir: 0, processando: 0, erros: falhasDePedido };
  let seguidas = 0, emitidos = 0;
  for (const r of prontos) {
    if (Date.now() - inicio > 100_000 || seguidas >= 5) break;
    emitidos++;
    const e = await emitirRelatorio(r.c.id, r.cnpj, r.registroId, r.protocolo, uid, via);
    if (e.corpo.ok === true && e.corpo.processando === true) { resumo.processando++; seguidas = 0; }
    else if (e.corpo.ok === true) {
      seguidas = 0; resumo.gerados++;
      if (e.corpo.confiavel !== true) resumo.a_conferir++;
      else if (e.corpo.resultado === "com_pendencias") resumo.com_pendencias++;
      else if (e.corpo.resultado === "sem_pendencias") resumo.sem_pendencias++;
      else resumo.a_conferir++;
    } else {
      seguidas++; resumo.erros++;
      if (falhas.length < 10) falhas.push(`${r.c.display_name || r.c.name}: ${String(e.corpo.error ?? e.corpo.status ?? "falha")}`);
    }
    await sleep(100);
  }
  const restantes = alvo.length - (resumo.gerados + resumo.processando + resumo.erros);

  // Fim da rodada (último disparo do dia): resumo com TODOS os relatórios de hoje, inclusive os de disparos anteriores.
  if (seguidas >= 5) {
    await avisarRodada("Situação fiscal: rodada parou por falhas", `A Receita falhou ${resumo.erros} vezes seguidas. Nada mais foi cobrado. Veja o registro de chamadas em Tech.`, hoje);
  } else if (restantes <= 0 && resumo.gerados > 0 && resumo.processando === 0 && !semProtocolo) {
    const { data: todos } = await supabase.from("serpro_sitfis").select("resultado,confiavel").eq("company_id", COMPANY_ID).eq("status", "pronto").gte("gerado_em", `${hoje}T03:00:00Z`).limit(5000);
    const lista = (todos ?? []) as { resultado: string | null; confiavel: boolean }[];
    const com = lista.filter((x) => x.confiavel && x.resultado === "com_pendencias").length;
    const sem = lista.filter((x) => x.confiavel && x.resultado === "sem_pendencias").length;
    const conferir = lista.length - com - sem;
    const falharam = falhouHoje.size + resumo.erros;
    await avisarRodada("Situação fiscal: rodada bimestral concluída",
      `${lista.length} relatórios gerados de ${tentaveis.length} clientes · ${com} com pendências · ${sem} sem pendências · ${conferir} a conferir${falharam ? ` · ${falharam} falharam (sem nova tentativa hoje)` : ""}. ${semProcuracao} sem procuração não entram. A tarefa de quem tem pendência é criada amanhã às 08:00.`, hoje);
  }
  return json({ ok: true, hoje, no_escopo: tentaveis.length, sem_procuracao_pulados: semProcuracao, a_gerar: alvo.length, lote: lote.length, protocolos_pedidos: prontos.length, ...resumo, restantes: Math.max(restantes, 0),
    parou_por_limite_do_serpro: semProtocolo, parou_por_falhas: seguidas >= 5, falhas, segundos: Math.round((Date.now() - inicio) / 1000), elegiveis: elegiveis.length });
}

async function link(payload: any) {
  const { data } = await supabase.from("serpro_sitfis").select("id,contact_id,pdf_path,gerado_em").eq("id", String(payload.id ?? "")).eq("company_id", COMPANY_ID).maybeSingle();
  if (!data?.pdf_path) return json({ ok: false, error: "Relatório ainda não disponível" });
  const dia = (data.gerado_em ?? "").slice(0, 10);
  const url = await assinar(supabase, BUCKET, data.pdf_path, `situacao-fiscal-${dia}.pdf`);
  return url ? json({ ok: true, url }) : json({ ok: false, error: "Não foi possível gerar o link" }, 500);
}

async function reler(payload: any) {
  const { data } = await supabase.from("serpro_sitfis").select("id,pdf_path").eq("id", String(payload.id ?? "")).eq("company_id", COMPANY_ID).maybeSingle();
  if (!data?.pdf_path) return json({ ok: false, error: "Relatório ainda não disponível" });
  try {
    const leitura = camposDaLeitura(await lerPdfGuardado(data.pdf_path));
    await supabase.from("serpro_sitfis").update(leitura).eq("id", data.id);
    return json({ ok: true, resultado: leitura.resultado, confiavel: leitura.confiavel, avisos: leitura.avisos });
  } catch (e) {
    return json({ ok: false, error: `Não consegui ler o PDF: ${(e as Error).message}` });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const payload = await req.json().catch(() => ({}));
  // Rotina bimestral: cron com a chave anon; quem decide é o interruptor e a data (fora do dia 30 dos meses pares, não cobra nada).
  if (payload.action === "rotina_sitfis" && (bearer === Deno.env.get("SUPABASE_ANON_KEY") || jwtRole(bearer) === "anon")) {
    return await rotinaSitfis({}, null);
  }

  const { data: userData } = await supabase.auth.getUser(bearer);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "Não autenticado" }, 401);
  const { data: perfil } = await supabase.from("profiles").select("role,is_super_admin,company_id").eq("user_id", uid).maybeSingle();
  const admin = perfil?.is_super_admin === true || (perfil?.role === "admin" && perfil?.company_id === COMPANY_ID);
  const equipe = admin || (perfil?.role === "colaborador" && perfil?.company_id === COMPANY_ID);
  if (!equipe) return json({ error: "Sem permissão" }, 403);

  switch (payload.action) {
    case "gerar": return await gerar(payload, uid);
    case "rotina_sitfis":
      if (!admin) return json({ error: "Só administradores rodam a rotina manualmente" }, 403);
      return await rotinaSitfis(payload, uid);
    case "link": return await link(payload);
    case "reler": return await reler(payload);
    default: return json({ error: "action inválida (gerar | rotina_sitfis | link | reler)" }, 400);
  }
});
