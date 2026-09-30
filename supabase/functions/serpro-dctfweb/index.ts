import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { criarSerpro, jwtRole, onlyDigits } from "../_shared/serpro-core.ts";
import { assinar, guardarPdf } from "../_shared/serpro-arquivos.ts";
import { lerApuracoesMit, pdfDoRecibo, semDeclaracaoDctfweb } from "../_shared/dctfweb-mit.ts";
import { concluirTarefaFiscal } from "../_shared/tarefas-fiscais.ts";

// ---------------------------------------------------------------------------
// DCTFWeb e MIT (Serpro Integra Contador) — F4 Onda 4, fase 1 (quem entregou), 30/09/2026. Só leitura.
//
//   consultar { contact_id, competencia: "AAAA-MM", force? }
//       1) DCTFWEB.CONSRECIBO32 (Consultar, categoria GERAL_MENSAL): recibo da declaração do mês. MG08 = não há declaração transmitida.
//       2) MIT.LISTAAPURACOES317 (Consultar): todas as apurações do ANO da competência numa chamada.
//       São duas consultas cobradas por clique. Uma parte pode falhar sem derrubar a outra.
//   link      { id }   link assinado (10 min) do recibo da DCTFWeb já guardado (sem chamada ao Serpro).
//   rotina_eventos   rotina diária (cron 07:40 BRT): evento E0301 (grátis, /Monitorar), 1 solicitar + 1 obter para todos os clientes do escopo.
//       O E0301 só diz que a DCTFWeb do CNPJ foi atualizada (eSocial/Reinf/SERO recebido ou declaração transmitida), sem dizer qual.
//       Marca "movimento novo" quando a data avança e avisa a equipe; quem consulta é a equipe, por clique. { forcar?: true } ignora a trava de 12 h.
//
// Só clientes com status "Ativo". Filial é recusada (declarações da matriz). Procuração: 00103 (DCTFWeb).
// Transmitir DCTFWeb/encerrar MIT NÃO existe aqui: escrita na Receita é fase final. A guia (GERARGUIA31) é a fase 2.
// ---------------------------------------------------------------------------

const COMPANY_ID = "5cd08fcd-c095-4f08-b3a8-c02b9bf1034e";
const STATUS_MONITORADO = "Ativo";
const RECENTE_MIN = 15;
const BUCKET = "serpro-dctfweb";
const CODIGOS_BASE = ["00146", "00006", "00004", "00060", "00002", "00103", "00050", "00051"]; // mesmos do mapa de procurações

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const { serpro, eventosPJ, CONTRATANTE_NI, AUTOR_NI } = criarSerpro(supabase, COMPANY_ID);
const CNPJS_DA_CA = new Set([CONTRATANTE_NI, AUTOR_NI]);
const REGIMES_DO_ESCOPO = ["lucro_presumido", "lucro_real"];

const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const msgErro = (r: { resposta: any }) => String(r.resposta?.mensagens?.[0]?.texto ?? r.resposta?.error ?? "Falha na consulta ao Serpro");

async function carregarCliente(contactId: string) {
  const { data: c } = await supabase.from("contacts").select("id,name,document,status_cliente").eq("id", contactId).eq("company_id", COMPANY_ID).maybeSingle();
  if (!c) return { resp: json({ error: "Cliente não encontrado" }, 404) };
  if (c.status_cliente !== STATUS_MONITORADO) {
    return { resp: json({ ok: false, foraDoMonitoramento: true, error: `Cliente fora do monitoramento (status: ${c.status_cliente ?? "sem status"}). O Serpro só é consultado para clientes com status "${STATUS_MONITORADO}".` }) };
  }
  const cnpj = onlyDigits(c.document);
  if (cnpj.length !== 14) return { resp: json({ error: "Cliente sem CNPJ válido" }, 400) };
  if (cnpj.slice(8, 12) !== "0001") return { resp: json({ ok: false, filial: true, error: "Este CNPJ é de filial. A DCTFWeb e a MIT são da matriz: consulte o CNPJ da matriz." }) };
  return { contato: c, cnpj };
}

/** Cliente mapeado e sem NENHUMA procuração ativa: nem tenta (cada tentativa cobrada voltaria 403). Não mapeado: tenta. */
async function semProcuracaoNenhuma(contactId: string): Promise<boolean> {
  const { data } = await supabase.from("serpro_procuracoes").select("status,data_fim").eq("contact_id", contactId).eq("fonte", "integra_procuracoes").in("codigo_procuracao", CODIGOS_BASE);
  if (!data?.length) return false;
  const hoje = hojeBR();
  return !data.some((r: { status: string; data_fim: string | null }) => r.status === "ativa" && (!r.data_fim || r.data_fim >= hoje));
}

type Parte = { ok: boolean; erro?: string; semProcuracao?: boolean };

async function consultar(payload: any, uid: string) {
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const contactId = c.contato!.id;
  const comp = String(payload.competencia ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(comp)) return json({ error: "Informe a competência (AAAA-MM)" }, 400);
  const [ano, mes] = comp.split("-");
  const competencia = `${comp}-01`;
  if (Number(ano) < 2019 || `${comp}-01` > hojeBR()) return json({ error: "Competência inválida" }, 400);
  if (await semProcuracaoNenhuma(contactId)) return json({ ok: false, semProcuracao: true, error: "Este cliente não tem procuração eletrônica ativa. Peça para outorgar no e-CAC e mapeie em Procurações." });

  if (!payload.force) {
    const [{ data: d }, { data: m }] = await Promise.all([
      supabase.from("serpro_dctfweb").select("consultado_em").eq("contact_id", contactId).eq("competencia", competencia).maybeSingle(),
      supabase.from("serpro_mit_consultas").select("consultado_em").eq("contact_id", contactId).eq("ano", Number(ano)).maybeSingle(),
    ]);
    const recente = (t?: string | null) => !!t && Date.now() - Date.parse(t) < RECENTE_MIN * 60_000;
    if (recente(d?.consultado_em) && recente(m?.consultado_em)) return json({ ok: true, recente: true });
  }

  const agora = new Date().toISOString();
  let dctf: Parte & { status?: "transmitida" | "sem_declaracao" } = { ok: false };
  let mit: Parte & { apuracoes?: number } = { ok: false };
  let tarefasConcluidas = 0;

  // ---- DCTFWeb
  const r = await serpro({
    tipo: "Consultar", idSistema: "DCTFWEB", idServico: "CONSRECIBO32",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: JSON.stringify({ categoria: 40, anoPA: ano, mesPA: mes }),
    uid, contactId, origem: "manual",
    finalidade: `Consulta do recibo da DCTFWeb (PA ${mes}/${ano}) acionada por usuário para acompanhamento fiscal do cliente`,
  });
  if (r.status === 403) return json({ ok: false, semProcuracao: true, status: 403, error: "Sem procuração eletrônica para a DCTFWeb deste cliente" });
  if (semDeclaracaoDctfweb(r.resposta)) {
    await supabase.from("serpro_dctfweb").upsert({ company_id: COMPANY_ID, contact_id: contactId, competencia, status: "sem_declaracao", recibo_path: null, consultado_em: agora, consultado_por: uid }, { onConflict: "contact_id,competencia" });
    dctf = { ok: true, status: "sem_declaracao" };
  } else if (r.status === 200) {
    const path = await guardarPdf(supabase, BUCKET, `${COMPANY_ID}/${contactId}/dctfweb-${comp}.pdf`, pdfDoRecibo(r.resposta?.dados));
    if (!path) dctf = { ok: false, erro: "O Serpro respondeu, mas o recibo não veio em PDF válido" };
    else {
      await supabase.from("serpro_dctfweb").upsert({ company_id: COMPANY_ID, contact_id: contactId, competencia, status: "transmitida", recibo_path: path, consultado_em: agora, consultado_por: uid }, { onConflict: "contact_id,competencia" });
      dctf = { ok: true, status: "transmitida" };
    }
  } else {
    dctf = { ok: false, erro: msgErro(r) };
  }

  // DCTFWeb com recibo → conclui a tarefa fiscal "DCTF" da competência (ver _shared/tarefas-fiscais.ts). "Sem declaração" não conclui.
  if (dctf.ok && dctf.status === "transmitida") {
    tarefasConcluidas += await concluirTarefaFiscal(supabase, COMPANY_ID, contactId, {
      obrigacao: "DCTF", periodo: comp, tipo: "transmitted", protocolo: null, detalhe: `DCTFWeb de ${mes}/${ano} com recibo na Receita`,
    });
  }

  // Apaga o aviso "movimento novo" do sensor (consulta posterior à mudança). Só toca esta coluna.
  if (dctf.ok) {
    await supabase.from("serpro_dctfweb_sensor").upsert(
      { contact_id: contactId, company_id: COMPANY_ID, ultima_consulta_em: new Date().toISOString() }, { onConflict: "contact_id" });
  }

  // ---- MIT (o ano inteiro)
  const m = await serpro({
    tipo: "Consultar", idSistema: "MIT", idServico: "LISTAAPURACOES317",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: JSON.stringify({ anoApuracao: Number(ano) }),
    uid, contactId, origem: "manual",
    finalidade: `Consulta das apurações da MIT (ano ${ano}) acionada por usuário para acompanhamento fiscal do cliente`,
  });
  const textoMit = msgErro(m);
  // Ano sem nenhuma apuração: o formato exato da resposta ainda não foi visto em produção; 404/204 ou "não há/nenhum" valem como lista vazia.
  const vazio = m.status === 204 || m.status === 404 || (m.status !== 200 && m.status !== 403 && /n[aã]o (h[aá]|existe|possui|foi encontrad|localiz)|nenhum/i.test(textoMit));
  if (m.status === 403) {
    mit = { ok: false, semProcuracao: true, erro: "Sem procuração para a MIT" };
  } else if (m.status === 200 || vazio) {
    const lista = vazio ? [] : lerApuracoesMit(m.resposta?.dados);
    if (lista.length) {
      const { error } = await supabase.from("serpro_mit_apuracoes").upsert(
        lista.map((a) => ({ company_id: COMPANY_ID, contact_id: contactId, periodo: a.periodo, id_apuracao: a.id_apuracao, situacao: a.situacao, data_encerramento: a.data_encerramento, evento_especial: a.evento_especial, valor_total: a.valor_total, sincronizado_em: agora })),
        { onConflict: "contact_id,periodo,id_apuracao" });
      if (error) mit = { ok: false, erro: `Consulta feita, mas não foi possível gravar: ${error.message}` };
    }
    // MIT encerrada → conclui a tarefa fiscal "MIT" do mesmo período (o ano inteiro vem numa consulta, então pode concluir mais de um mês).
    const encerradas = new Map<string, { id: number; data: string }>();
    for (const a of lista) if (a.situacao === 3 && a.data_encerramento && !encerradas.has(a.periodo.slice(0, 7))) encerradas.set(a.periodo.slice(0, 7), { id: a.id_apuracao, data: a.data_encerramento });
    if (!mit.erro) {
      for (const [periodo, e] of encerradas) {
        tarefasConcluidas += await concluirTarefaFiscal(supabase, COMPANY_ID, contactId, {
          obrigacao: "MIT", periodo, tipo: "transmitted", protocolo: null,
          detalhe: `MIT de ${periodo.slice(5, 7)}/${periodo.slice(0, 4)} encerrada em ${e.data.split("-").reverse().join("/")} (apuração nº ${e.id})`,
        });
      }
    }
    if (!mit.erro && !mit.semProcuracao) {
      await supabase.from("serpro_mit_consultas").upsert({ contact_id: contactId, company_id: COMPANY_ID, ano: Number(ano), consultado_em: agora, consultado_por: uid, apuracoes: lista.length }, { onConflict: "contact_id,ano" });
      mit = { ok: true, apuracoes: lista.length };
    }
  } else {
    mit = { ok: false, erro: textoMit };
  }

  if (!dctf.ok && !mit.ok) return json({ ok: false, error: dctf.erro ?? mit.erro ?? "Falha na consulta ao Serpro", dctfweb: dctf, mit });
  return json({ ok: true, dctfweb: dctf, mit, tarefas_concluidas: tarefasConcluidas });
}

async function link(payload: any) {
  const { data } = await supabase.from("serpro_dctfweb").select("recibo_path,competencia").eq("id", String(payload.id ?? "")).eq("company_id", COMPANY_ID).maybeSingle();
  if (!data?.recibo_path) return json({ ok: false, error: "Recibo não disponível" });
  const url = await assinar(supabase, BUCKET, data.recibo_path, `recibo-dctfweb-${String(data.competencia).slice(0, 7)}.pdf`);
  return url ? json({ ok: true, url }) : json({ ok: false, error: "Não foi possível gerar o link" }, 500);
}

// Rotina diária: evento E0301 (DCTFWeb atualizada). Só diz que algo mudou; quem consulta o detalhe é a equipe, por clique.
async function rotinaEventos(payload: any, uid: string | null, origem: "manual" | "cron") {
  if (!payload.forcar) {
    const desde = new Date(Date.now() - 12 * 3600_000).toISOString();
    const { count } = await supabase.from("serpro_call_log").select("id", { count: "exact", head: true })
      .eq("id_servico", "SOLICEVENTOSPJ132").ilike("finalidade", "%E0301%").gte("created_at", desde).gte("status_http", 200).lt("status_http", 300);
    if ((count ?? 0) > 0) return json({ ok: true, ignorado: "A rotina da DCTFWeb já rodou nas últimas 12 h." });
  }
  // Mesmo escopo da tela: clientes Ativos do Lucro Presumido e do Real. Filial fica de fora (a DCTFWeb é da matriz).
  const { data: contatos } = await supabase.from("contacts").select("id,document")
    .eq("company_id", COMPANY_ID).eq("is_active", true).eq("status_cliente", STATUS_MONITORADO).in("tax_regime", REGIMES_DO_ESCOPO);
  let alvo = (contatos ?? []).map((c: any) => ({ id: c.id as string, cnpj: onlyDigits(c.document) }))
    .filter((c) => c.cnpj.length === 14 && c.cnpj.slice(8, 12) === "0001" && !CNPJS_DA_CA.has(c.cnpj));
  if (payload.limite) alvo = alvo.slice(0, Math.min(Number(payload.limite), 1000));
  alvo = alvo.slice(0, 1000);
  if (!alvo.length) return json({ ok: true, ignorado: "Nenhum cliente ativo do Presumido ou do Real com CNPJ de matriz" });

  const res = await eventosPJ({
    evento: "E0301", cnpjs: alvo.map((c) => c.cnpj), uid, origem, semFallback: !!payload.semFallback,
    finalidade: "Detecção diária de movimento na DCTFWeb (evento E0301, gratuito) para acompanhamento fiscal",
  });
  if (!("linhas" in res)) return json({ ok: false, error: res.erro });

  const porCnpj = new Map(alvo.map((c) => [c.cnpj, c.id]));
  const { data: antes } = await supabase.from("serpro_dctfweb_sensor").select("contact_id,evento_ultima_data,evento_verificado_em,mudou_em").eq("company_id", COMPANY_ID).limit(1000);
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
    // "Movimento novo" só quando a data avança em relação à leitura anterior; a 1ª leitura de cada cliente é só linha de base.
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
  if (linhas.length) await supabase.from("serpro_dctfweb_sensor").upsert(linhas, { onConflict: "contact_id" });
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
      type: "serpro_dctfweb",
      title: ids.length === 1 ? "Movimento na DCTFWeb de um cliente" : `${ids.length} clientes com movimento na DCTFWeb`,
      body: corpo,
      action_url: "/dashboard-federal/dctfweb-mit",
    })));
  } catch (e) {
    console.error("Falha ao notificar movimento na DCTFWeb:", String((e as Error).message || e));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const payload = await req.json().catch(() => ({}));

  // Cron chama com a chave anon (padrão do projeto). Só a rotina de eventos aceita isso, e ela tem trava de 12 h.
  if (payload.action === "rotina_eventos" && (bearer === Deno.env.get("SUPABASE_ANON_KEY") || jwtRole(bearer) === "anon")) {
    return await rotinaEventos({ ...payload, forcar: false, limite: undefined, semFallback: false }, null, "cron");
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
    case "link": return await link(payload);
    case "rotina_eventos":
      if (!admin) return json({ error: "Só administradores rodam a rotina manualmente" }, 403);
      return await rotinaEventos(payload, uid, "manual");
    default: return json({ error: "action inválida (consultar | link | rotina_eventos)" }, 400);
  }
});
