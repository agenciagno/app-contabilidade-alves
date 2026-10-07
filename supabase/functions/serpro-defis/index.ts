import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { criarSerpro, jwtRole, onlyDigits, sleep } from "../_shared/serpro-core.ts";
import { pega } from "../_shared/pgdasd-indice.ts";
import { lerIndiceDefis } from "../_shared/defis-indice.ts";
import { assinar, guardarPdf } from "../_shared/serpro-arquivos.ts";
import { lerTodas } from "../_shared/paginar.ts";
import { perfilAtivo } from "../_shared/acesso.ts";

// ---------------------------------------------------------------------------
// DEFIS (declaração anual do Simples Nacional, Serpro Integra Contador) — F4 Onda 2, passo 4, 30/09/2026. Só leitura.
//
// Ações (sempre UM cliente por vez, por clique):
//   consultar  { contact_id, force? }          DEFIS.CONSDECLARACAO142 (Consultar): índice de TODAS as DEFIS transmitidas do cliente
//                                              (período não decadente), numa só chamada. Ausência de um ano num cliente consultado = não entregue.
//   documentos { contact_id, ano, force? }     DEFIS.CONSULTIMADECREC143 (Consultar): PDFs da declaração e do recibo da última DEFIS do
//                                              ano-calendário, guardados no bucket privado.
//   rotina_defis (cron 08:20, 08:25 e 08:30 BRT; decisão de Gabriel, 01/10/2026): DUAS rodadas por ano, decididas pela data. Ano-calendário = ano anterior.
//                  · 15/03: consulta o índice de TODOS os clientes do Simples (matriz) que ainda não têm a DEFIS do ano na lista, para a equipe cobrar a tempo;
//                  · dia seguinte ao prazo (31/03, ou o próximo dia útil se cair em fim de semana ou feriado; em 2027 = 01/04): consulta só quem continua sem a DEFIS
//                    do ano e ainda não foi consultado depois do prazo (a consulta depois do prazo é a prova de "não entregue").
//                  Outros dias: nada, sem custo. Fora do escopo: empresa aberta depois do ano-calendário (não tem DEFIS daquele ano), filial, CNPJ da CA e quem não tem
//                  procuração. Até 60 por disparo, para após 5 falhas seguidas. Um aviso no sino ao fim de cada rodada. Interruptor: serpro_config.auto_rotina_defis (padrão ligado).
//                  Admin simula com { dry_run: true, modo?: "marco" | "abril", ignorar_data?: true, ano? } (não cobra).
//   consultar_carteira { ano?, limite? }       Rodada ÚNICA de atualização (aprovada por Gabriel em 01/10/2026, DEFIS de 2025): mesmo escopo da rodada de março, a qualquer
//                  data. Só administrador logado OU chave de uso curto (header x-lote-token, hash em serpro_config.lote_token_hash). Pode ser repetida: quem já foi consultado é pulado.
//   link       { tipo: "declaracao" | "recibo", id }   link assinado (10 min) de um PDF já guardado (sem chamada ao Serpro).
//   publicar   { id, visivel_portal }
//
// Só clientes com status "Ativo". Filial é recusada: a DEFIS é da matriz. Procuração: 00146 (a mesma do PGDAS-D).
// Transmitir DEFIS (DEFIS.TRANSDECLARACAO141) NÃO existe aqui: escrita na Receita é fase final.
// ---------------------------------------------------------------------------

const COMPANY_ID = "5cd08fcd-c095-4f08-b3a8-c02b9bf1034e";
const STATUS_MONITORADO = "Ativo";
const RECENTE_MIN = 15;
const BUCKET = "serpro-pgdasd"; // mesmo bucket privado do PGDAS-D; arquivos da DEFIS ficam em defis-*.pdf

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const { serpro, CONTRATANTE_NI, AUTOR_NI } = criarSerpro(supabase, COMPANY_ID);
const CNPJS_DA_CA = new Set([CONTRATANTE_NI, AUTOR_NI]);
const CODIGOS_PROCURACAO = ["00146", "00006", "00004", "00060", "00002", "00103", "00050", "00051"]; // mesmos do mapa de procurações
const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const dataBRde = (iso: string) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 10);

const anoBR = () => Number(new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 4));
const msgErro = (r: { resposta: any }) => r.resposta?.mensagens?.[0]?.texto ?? r.resposta?.error ?? "Falha na consulta ao Serpro";

async function carregarCliente(contactId: string) {
  const { data: c } = await supabase.from("contacts").select("id,name,document,status_cliente").eq("id", contactId).eq("company_id", COMPANY_ID).maybeSingle();
  if (!c) return { resp: json({ error: "Cliente não encontrado" }, 404) };
  if (c.status_cliente !== STATUS_MONITORADO) {
    return { resp: json({ ok: false, foraDoMonitoramento: true, error: `Cliente fora do monitoramento (status: ${c.status_cliente ?? "sem status"}). O Serpro só é consultado para clientes com status "${STATUS_MONITORADO}".` }) };
  }
  const cnpj = onlyDigits(c.document);
  if (cnpj.length !== 14) return { resp: json({ error: "Cliente sem CNPJ válido" }, 400) };
  if (cnpj.slice(8, 12) !== "0001") return { resp: json({ ok: false, filial: true, error: "Este CNPJ é de filial. A DEFIS é transmitida pela matriz: consulte o CNPJ da matriz." }) };
  return { contato: c, cnpj };
}

type Resp = { corpo: Record<string, unknown>; http: number };
const resp = (corpo: Record<string, unknown>, http = 200): Resp => ({ corpo, http });

/** Consulta o índice das DEFIS de UM cliente (CONSDECLARACAO142, 1 chamada cobrada) e grava. Serve ao clique, à rotina anual e à rodada de atualização. */
async function consultarCliente(o: { contactId: string; uid: string | null; origem: "manual" | "cron"; force?: boolean; finalidade?: string }): Promise<Resp> {
  const c = await carregarCliente(o.contactId);
  if (c.resp) return { corpo: await c.resp.clone().json(), http: c.resp.status };

  if (!o.force) {
    const { data: ja } = await supabase.from("serpro_defis_consultas").select("consultado_em").eq("contact_id", c.contato!.id).maybeSingle();
    if (ja?.consultado_em && Date.now() - Date.parse(ja.consultado_em) < RECENTE_MIN * 60_000) return resp({ ok: true, recente: true, consultado_em: ja.consultado_em });
  }

  const r = await serpro({
    tipo: "Consultar", idSistema: "DEFIS", idServico: "CONSDECLARACAO142",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: "",
    uid: o.uid, contactId: c.contato!.id, origem: o.origem,
    finalidade: o.finalidade ?? "Consulta das DEFIS transmitidas (declaração anual do Simples Nacional) acionada por usuário para acompanhamento fiscal do cliente",
  });
  if (r.status === 403) return resp({ ok: false, semProcuracao: true, status: 403, error: "Sem procuração eletrônica para a DEFIS deste cliente" });
  // Cliente sem nenhuma DEFIS (empresa nova): o formato exato da resposta ainda não foi visto em produção, então "não há/não existe/nenhuma" vale como lista vazia.
  const texto = String(msgErro(r));
  const semNenhuma = r.status === 404 || (r.status !== 200 && /n[aã]o (h[aá]|existe|foi encontrad|localiz)|nenhuma|sem declara/i.test(texto));
  if (r.status !== 200 && !semNenhuma) return resp({ ok: false, status: r.status, error: texto });

  const lista = semNenhuma ? [] : lerIndiceDefis(r.resposta?.dados);
  const agora = new Date().toISOString();
  let novas = 0;
  if (lista.length) {
    const { data: ex } = await supabase.from("serpro_defis").select("id_defis").eq("contact_id", c.contato!.id).in("id_defis", lista.map((d) => d.id_defis));
    const ja = new Set((ex ?? []).map((e: { id_defis: string }) => e.id_defis));
    novas = lista.filter((d) => !ja.has(d.id_defis)).length;
    // Só as colunas do índice: os PDFs já baixados não são apagados.
    const { error } = await supabase.from("serpro_defis").upsert(
      lista.map((d) => ({ company_id: COMPANY_ID, contact_id: c.contato!.id, ano_calendario: d.ano_calendario, id_defis: d.id_defis, tipo: d.tipo, transmitida_em: d.transmitida_em, sincronizado_em: agora })),
      { onConflict: "contact_id,id_defis" });
    if (error) return resp({ ok: false, error: `Consulta feita, mas não foi possível gravar: ${error.message}` }, 500);
  }
  await supabase.from("serpro_defis_consultas").upsert(
    { contact_id: c.contato!.id, company_id: COMPANY_ID, consultado_em: agora, consultado_por: o.uid, declaracoes: lista.length }, { onConflict: "contact_id" });
  return resp({ ok: true, declaracoes: lista.length, novas, sem_declaracao: lista.length === 0 });
}

async function consultar(payload: any, uid: string) {
  const r = await consultarCliente({ contactId: String(payload.contact_id ?? ""), uid, origem: "manual", force: !!payload.force });
  return json(r.corpo, r.http);
}

// ---------- rodadas da DEFIS (rotina anual e atualização única) ----------
type Modo = "marco" | "abril";

/** Aviso único por rodada e por dia no sino (admins e quem tem o módulo dashboard_federal). */
async function avisarRodada(titulo: string, corpo: string, hoje: string) {
  try {
    const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true })
      .eq("company_id", COMPANY_ID).eq("type", "serpro_defis").eq("title", titulo).gte("created_at", `${hoje}T03:00:00Z`);
    if ((count ?? 0) > 0) return;
    const { data: alvos } = await supabase.from("profiles").select("user_id")
      .eq("company_id", COMPANY_ID).eq("status_active", true).or("role.in.(admin,super_admin),allowed_modules.cs.{dashboard_federal}");
    if (!alvos?.length) return;
    await supabase.from("notifications").insert(alvos.map((t: { user_id: string }) => ({
      user_id: t.user_id, company_id: COMPANY_ID, type: "serpro_defis", title: titulo, body: corpo, action_url: "/dashboard-federal/defis",
    })));
  } catch (e) {
    console.error("Falha ao avisar a rodada da DEFIS:", String((e as Error).message || e));
  }
}

/**
 * Clientes que uma rodada pode consultar: Simples, Ativo, matriz, CNPJ válido, sem os CNPJs da CA; fora quem abriu a empresa DEPOIS do ano-calendário (não tem DEFIS daquele ano)
 * e quem está mapeado nas procurações sem nenhuma ativa (a tentativa seria cobrada e voltaria 403). `entregues`: quem já tem a DEFIS do ano na lista.
 */
async function carteiraDefis(ano: number) {
  const { data: contatos } = await supabase.from("contacts").select("id,name,display_name,document,data_abertura_receita,data_abertura_rf")
    .eq("company_id", COMPANY_ID).eq("is_active", true).eq("status_cliente", STATUS_MONITORADO).eq("tax_regime", "simples_nacional").order("name");
  // O mapa de procurações passa de 1.000 linhas (teto do banco por consulta): lê em páginas, senão cliente sem procuração parece "sem mapa" e é tentado (cobrado, 403).
  const procs = await lerTodas<{ contact_id: string; status: string; data_fim: string | null }>((de, ate) => supabase.from("serpro_procuracoes").select("contact_id,status,data_fim")
    .eq("company_id", COMPANY_ID).eq("fonte", "integra_procuracoes").in("codigo_procuracao", CODIGOS_PROCURACAO).order("id").range(de, ate));
  const hoje = hojeBR();
  const comMapa = new Map<string, boolean>();
  for (const r of (procs ?? []) as { contact_id: string; status: string; data_fim: string | null }[]) {
    const ativa = r.status === "ativa" && (!r.data_fim || r.data_fim >= hoje);
    comMapa.set(r.contact_id, (comMapa.get(r.contact_id) ?? false) || ativa);
  }
  const { data: consultas } = await supabase.from("serpro_defis_consultas").select("contact_id,consultado_em").eq("company_id", COMPANY_ID).limit(5000);
  const consultadoEm = new Map<string, string>((consultas ?? []).map((c: { contact_id: string; consultado_em: string }) => [c.contact_id, c.consultado_em]));
  const { data: defis } = await supabase.from("serpro_defis").select("contact_id").eq("company_id", COMPANY_ID).eq("ano_calendario", ano).limit(5000);
  const entregues = new Set((defis ?? []).map((d: { contact_id: string }) => d.contact_id));

  const elegiveis = (contatos ?? []).filter((c: any) => {
    const cnpj = onlyDigits(c.document);
    return cnpj.length === 14 && cnpj.slice(8, 12) === "0001" && !CNPJS_DA_CA.has(cnpj);
  });
  const anoAbertura = (c: any) => Number(String(c.data_abertura_receita ?? c.data_abertura_rf ?? "").slice(0, 4)) || null;
  const abertosDepois = elegiveis.filter((c: any) => (anoAbertura(c) ?? 0) > ano);
  const semProcuracao = elegiveis.filter((c: any) => comMapa.has(c.id) && comMapa.get(c.id) === false);
  const fora = new Set([...abertosDepois, ...semProcuracao].map((c: any) => c.id));
  return { elegiveis, tentaveis: elegiveis.filter((c: any) => !fora.has(c.id)), semProcuracao: semProcuracao.length, abertosDepois: abertosDepois.length, consultadoEm, entregues };
}

/**
 * Uma rodada. `marco`: todos que ainda não têm a DEFIS do ano na lista e não foram consultados hoje. `abril`: só quem continua sem a DEFIS do ano e ainda
 * não foi consultado DEPOIS do prazo. Guardas: 60 clientes e 100 s por disparo; para após 5 falhas seguidas do Serpro.
 */
async function rodarDefis(o: { modo: Modo; ano: number; prazo: string; uid: string | null; origem: "manual" | "cron"; limite: number; simulando: boolean; finalidade: string; tituloBase: string }) {
  const hoje = hojeBR();
  const { tentaveis, semProcuracao, abertosDepois, consultadoEm, entregues } = await carteiraDefis(o.ano);
  const alvo = tentaveis.filter((c: any) => {
    if (entregues.has(c.id)) return false;                     // já entregue: não muda mais
    const q = consultadoEm.get(c.id);
    if (o.modo === "marco") return !q || dataBRde(q) !== hoje;  // março e a atualização única: todos os que ainda não têm a DEFIS (e não foram consultados hoje)
    return !q || dataBRde(q) <= o.prazo;                       // abril: ainda sem DEFIS e não consultado depois do prazo
  });
  const ja_entregues = tentaveis.filter((c: any) => entregues.has(c.id)).length;
  if (o.simulando) {
    return json({ ok: true, dry_run: true, modo: o.modo, hoje, ano_calendario: o.ano, prazo: o.prazo, no_escopo: tentaveis.length, ja_entregues, a_consultar: alvo.length,
      sem_procuracao_pulados: semProcuracao, abertos_depois_do_ano_pulados: abertosDepois, custo_estimado_reais: Math.round(alvo.length * 0.24 * 100) / 100 });
  }

  const inicio = Date.now();
  const resumo = { consultados: 0, com_defis_do_ano: 0, sem_defis_do_ano: 0, erros: 0 };
  const falhas: string[] = [];
  let seguidas = 0, processados = 0;
  for (const c of alvo) {
    if (processados >= o.limite || Date.now() - inicio > 100_000 || seguidas >= 5) break;
    processados++;
    const r = await consultarCliente({ contactId: c.id, uid: o.uid, origem: o.origem, force: true, finalidade: o.finalidade });
    if (r.corpo.ok === true) {
      seguidas = 0;
      resumo.consultados++;
    } else {
      seguidas++;
      resumo.erros++;
      if (falhas.length < 10) falhas.push(`${c.display_name || c.name}: ${String(r.corpo.error ?? r.corpo.status ?? "falha")}`);
    }
    await sleep(150);
  }
  const restantes = alvo.length - processados;

  // Resultado da rodada e aviso no sino quando a lista termina (o último disparo do dia).
  const { data: depois } = await supabase.from("serpro_defis").select("contact_id").eq("company_id", COMPANY_ID).eq("ano_calendario", o.ano).limit(5000);
  const comDefis = new Set((depois ?? []).map((d: { contact_id: string }) => d.contact_id));
  const entreguesAgora = tentaveis.filter((c: any) => comDefis.has(c.id)).length;
  const pendentes = tentaveis.length - entreguesAgora;
  resumo.com_defis_do_ano = entreguesAgora;
  resumo.sem_defis_do_ano = pendentes;
  const dataBR = (iso: string) => iso.split("-").reverse().join("/");
  if (seguidas >= 5) {
    await avisarRodada(`${o.tituloBase} parou por falhas`, `A Receita falhou ${resumo.erros} vezes seguidas. Nada mais foi cobrado. Veja o registro de chamadas em Tech.`, hoje);
  } else if (restantes === 0 && processados > 0) {
    if (o.modo === "abril") {
      await avisarRodada(`Prazo da DEFIS ${o.ano} terminou`, `${pendentes} ${pendentes === 1 ? "cliente do Simples" : "clientes do Simples"} sem DEFIS de ${o.ano} entregue (consulta de hoje, depois do prazo de ${dataBR(o.prazo)}). ${entreguesAgora} entregues.`, hoje);
    } else {
      await avisarRodada(`DEFIS ${o.ano}: ${o.tituloBase.toLowerCase().includes("atualiza") ? "atualização concluída" : "conferência de março"}`,
        `${entreguesAgora} entregues e ${pendentes} ainda sem DEFIS de ${o.ano} (prazo ${dataBR(o.prazo)}). ${abertosDepois} empresas abertas depois de ${o.ano} e ${semProcuracao} sem procuração não entram.`, hoje);
    }
  }
  return json({ ok: true, modo: o.modo, hoje, ano_calendario: o.ano, prazo: o.prazo, no_escopo: tentaveis.length, a_consultar: alvo.length, sem_procuracao_pulados: semProcuracao, abertos_depois_do_ano_pulados: abertosDepois,
    ...resumo, restantes, parou_por_falhas: seguidas >= 5, falhas, segundos: Math.round((Date.now() - inicio) / 1000) });
}

/** Prazo da DEFIS do ano-calendário: 31/03 do ano seguinte; fim de semana ou feriado nacional passa ao próximo dia útil (função do banco). */
async function prazoDaDefis(ano: number): Promise<string> {
  const { data } = await supabase.rpc("serpro_proximo_dia_util", { p_data: `${ano + 1}-03-31` });
  return typeof data === "string" && /^\d{4}-\d{2}-\d{2}/.test(data) ? data.slice(0, 10) : `${ano + 1}-03-31`;
}

/** Rotina anual: o cron bate todo dia; quem decide é o interruptor (padrão ligado) e a DATA. */
async function rotinaDefis(payload: any, uid: string | null) {
  const hoje = hojeBR();
  const simulando = !!uid && payload.dry_run === true;
  const { data: cfg } = await supabase.from("serpro_config").select("auto_rotina_defis").eq("company_id", COMPANY_ID).maybeSingle();
  if (!simulando && cfg?.auto_rotina_defis === false) return json({ ok: true, desligada: true });

  const ano = uid && Number.isInteger(Number(payload.ano)) && Number(payload.ano) >= 2018 ? Number(payload.ano) : Number(hoje.slice(0, 4)) - 1;
  const prazo = await prazoDaDefis(ano);
  const dia = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  let modo: Modo | null = hoje === `${ano + 1}-03-15` ? "marco" : hoje === dia(prazo, 1) ? "abril" : null;
  if (uid && (payload.modo === "marco" || payload.modo === "abril")) modo = payload.modo;
  if (!modo && uid && payload.ignorar_data === true) modo = "marco";
  if (!modo) return json({ ok: true, nada_a_fazer: true, hoje, ano_calendario: ano, prazo });

  return await rodarDefis({
    modo, ano, prazo, uid, origem: uid ? "manual" : "cron", limite: 60, simulando,
    tituloBase: modo === "marco" ? "Conferência de março" : "Prazo da DEFIS",
    finalidade: modo === "marco"
      ? `Rotina anual da DEFIS (15 de março): conferir quem já entregou a DEFIS do ano-calendário ${ano}, para a equipe cobrar antes do prazo de ${prazo.split("-").reverse().join("/")}`
      : `Rotina anual da DEFIS (dia seguinte ao prazo): conferir quem continua sem a DEFIS do ano-calendário ${ano} depois do prazo de ${prazo.split("-").reverse().join("/")}`,
  });
}

/** Rodada ÚNICA de atualização (aprovada por Gabriel em 01/10/2026): escopo da rodada de março, a qualquer data. Não depende do interruptor da rotina anual. */
async function consultarCarteira(payload: any, uid: string | null) {
  const ano = Number(payload.ano) || anoBR() - 1;
  if (!Number.isInteger(ano) || ano < 2018 || ano > anoBR()) return json({ error: "Ano inválido" }, 400);
  const limite = Math.max(1, Math.min(Number(payload.limite) || 40, 60));
  return await rodarDefis({
    modo: "marco", ano, prazo: await prazoDaDefis(ano), uid, origem: "manual", limite, simulando: false, tituloBase: "Atualização das DEFIS",
    finalidade: `Consulta do índice das DEFIS na rodada de atualização da DEFIS do ano-calendário ${ano}, aprovada por Gabriel em 01/10/2026, para acompanhamento fiscal da carteira do Simples`,
  });
}

async function documentos(payload: any, uid: string) {
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const ano = Number(payload.ano);
  if (!Number.isInteger(ano) || ano < 2018 || ano > anoBR()) return json({ error: "Ano inválido" }, 400);

  const { data: vigente } = await supabase.from("serpro_defis").select("id,id_defis,recibo_path,declaracao_path")
    .eq("contact_id", c.contato!.id).eq("ano_calendario", ano).order("transmitida_em", { ascending: false }).limit(1).maybeSingle();
  if (!vigente) return json({ ok: false, error: "Não há DEFIS deste ano na lista. Consulte o cliente primeiro." });
  // Já baixado: não chama o Serpro de novo (cada chamada é cobrada).
  if (vigente.recibo_path && vigente.declaracao_path && !payload.force) return json({ ok: true, jaBaixado: true, id: vigente.id });

  const r = await serpro({
    tipo: "Consultar", idSistema: "DEFIS", idServico: "CONSULTIMADECREC143",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: JSON.stringify({ ano }),
    uid, contactId: c.contato!.id, origem: "manual",
    finalidade: `Consulta da declaração e do recibo da DEFIS (ano-calendário ${ano}) acionada por usuário para o cliente`,
  });
  if (r.status === 403) return json({ ok: false, semProcuracao: true, error: "Sem procuração eletrônica para a DEFIS deste cliente" });
  if (r.status !== 200) return json({ ok: false, status: r.status, error: msgErro(r) });

  const d = r.resposta?.dados;
  const idDefis = String(pega(d, "idDefis") ?? "");
  if (!idDefis) return json({ ok: false, error: "O Serpro não devolveu a DEFIS deste ano" }, 502);
  const { data: alvo } = await supabase.from("serpro_defis").select("id").eq("contact_id", c.contato!.id).eq("id_defis", idDefis).maybeSingle();
  if (!alvo) return json({ ok: false, error: `A Receita devolveu a DEFIS nº ${idDefis}, que ainda não está na lista. Consulte o cliente de novo e tente outra vez.` });

  const pasta = `${COMPANY_ID}/${c.contato!.id}`;
  const recibo = await guardarPdf(supabase, BUCKET, `${pasta}/defis-recibo-${idDefis}.pdf`, pega(d, "reciboPdf"));
  const decl = await guardarPdf(supabase, BUCKET, `${pasta}/defis-declaracao-${idDefis}.pdf`, pega(d, "declaracaoPdf"));
  if (!recibo && !decl) return json({ ok: false, error: "O Serpro não devolveu os PDFs da DEFIS" }, 502);
  await supabase.from("serpro_defis").update({ recibo_path: recibo, declaracao_path: decl, documentos_em: new Date().toISOString() }).eq("id", alvo.id);
  return json({ ok: true, id: alvo.id });
}

const COLUNA: Record<string, { coluna: string; prefixo: string }> = {
  declaracao: { coluna: "declaracao_path", prefixo: "defis-declaracao" },
  recibo: { coluna: "recibo_path", prefixo: "defis-recibo" },
};

async function link(payload: any) {
  const t = COLUNA[String(payload.tipo ?? "")];
  if (!t) return json({ error: "Tipo de arquivo inválido" }, 400);
  const { data } = await supabase.from("serpro_defis").select("*").eq("id", String(payload.id ?? "")).eq("company_id", COMPANY_ID).maybeSingle();
  const linha = (data ?? {}) as Record<string, string | null>;
  const path = linha[t.coluna];
  if (!path) return json({ ok: false, error: "Arquivo ainda não baixado" });
  const url = await assinar(supabase, BUCKET, path, `${t.prefixo}-${linha.id_defis ?? ""}.pdf`);
  return url ? json({ ok: true, url }) : json({ ok: false, error: "Não foi possível gerar o link" }, 500);
}

async function publicar(payload: any) {
  if (typeof payload.visivel_portal !== "boolean") return json({ error: "visivel_portal inválido" }, 400);
  const { error } = await supabase.from("serpro_defis").update({ visivel_portal: payload.visivel_portal }).eq("id", String(payload.id ?? "")).eq("company_id", COMPANY_ID);
  return error ? json({ error: error.message }, 500) : json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const payload = await req.json().catch(() => ({}));
  // Rodada única de atualização por chave de uso curto: a chave (guardada só como hash no banco, com validade curta) é criada por quem tem acesso ao banco.
  if (payload.action === "consultar_carteira" && req.headers.get("x-lote-token")) {
    const dados = new TextEncoder().encode(String(req.headers.get("x-lote-token")));
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", dados))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const { data: cfg } = await supabase.from("serpro_config").select("lote_token_hash,lote_token_expira").eq("company_id", COMPANY_ID).maybeSingle();
    if (cfg?.lote_token_hash && cfg.lote_token_hash === hash && cfg.lote_token_expira && Date.parse(cfg.lote_token_expira) > Date.now()) {
      return await consultarCarteira(payload, null);
    }
    return json({ error: "Chave da rodada inválida ou vencida" }, 403);
  }

  // Rotina anual: cron com a chave anon; quem decide é o interruptor e a data (fora de 15/03 e do dia seguinte ao prazo, não cobra nada).
  if (payload.action === "rotina_defis" && (bearer === Deno.env.get("SUPABASE_ANON_KEY") || jwtRole(bearer) === "anon")) {
    return await rotinaDefis({}, null);
  }

  const { data: userData } = await supabase.auth.getUser(bearer);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "Não autenticado" }, 401);
  const { data: perfil } = await perfilAtivo(bearer, uid, "role,is_super_admin,company_id");
  const admin = perfil?.is_super_admin === true || (perfil?.role === "admin" && perfil?.company_id === COMPANY_ID);
  const equipe = admin || (perfil?.role === "colaborador" && perfil?.company_id === COMPANY_ID);
  if (!equipe) return json({ error: "Sem permissão" }, 403);

  switch (payload.action) {
    case "consultar": return await consultar(payload, uid);
    case "rotina_defis":
      if (!admin) return json({ error: "Só administradores rodam a rotina manualmente" }, 403);
      return await rotinaDefis(payload, uid);
    case "consultar_carteira":
      if (!admin) return json({ error: "Só administradores consultam a carteira" }, 403);
      return await consultarCarteira(payload, uid);
    case "documentos": return await documentos(payload, uid);
    case "link": return await link(payload);
    case "publicar": return await publicar(payload);
    default: return json({ error: "action inválida (consultar | rotina_defis | consultar_carteira | documentos | link | publicar)" }, 400);
  }
});
