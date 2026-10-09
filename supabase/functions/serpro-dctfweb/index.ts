import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { criarSerpro, jwtRole, onlyDigits, sleep } from "../_shared/serpro-core.ts";
import { assinar, guardarPdf } from "../_shared/serpro-arquivos.ts";
import { lerApuracoesMit, pdfDoRecibo, semDeclaracaoDctfweb } from "../_shared/dctfweb-mit.ts";
import { pega } from "../_shared/pgdasd-indice.ts";
import { avisarConclusoes, concluirTarefaFiscal } from "../_shared/tarefas-fiscais.ts";
import { lerTodas } from "../_shared/paginar.ts";
import { loteTokenValido } from "../_shared/lote-token.ts";
import { perfilAtivo } from "../_shared/acesso.ts";

// ---------------------------------------------------------------------------
// DCTFWeb e MIT (Serpro Integra Contador) — F4 Onda 4, fase 1 (quem entregou), 30/09/2026. Só leitura.
//
//   consultar { contact_id, competencia: "AAAA-MM", force? }
//       1) DCTFWEB.CONSRECIBO32 (Consultar, categoria GERAL_MENSAL): recibo da declaração do mês. MG08 = não há declaração transmitida.
//       2) MIT.LISTAAPURACOES317 (Consultar): todas as apurações do ANO da competência numa chamada.
//       São duas consultas cobradas por clique. Uma parte pode falhar sem derrubar a outra.
//   link      { id }   link assinado (10 min) do recibo da DCTFWeb já guardado (sem chamada ao Serpro).
//   gerar_guia { contact_id, competencia: "AAAA-MM", confirmar_emissao: true, data_pagamento?: "AAAA-MM-DD", novo? }
//       DCTFWEB.GERARGUIA31 (Emitir, cobrado; Rodada 5, 09/10/2026): guia (DARF) da declaração mais recente da competência, categoria GERAL_MENSAL.
//       `data_pagamento` vira DataAcolhimentoProposta (inteiro aaaammdd; a Receita só aceita dia útil do mês corrente, de hoje em diante).
//       Sem `novo`, uma guia já emitida HOJE para a mesma competência e a mesma data é devolvida sem emitir outra (não cobra de novo).
//   link_guia { id }   link assinado (10 min) de uma guia já emitida.
//       `andamento: true` em gerar_guia (09/10/2026) usa GERARGUIAANDAMENTO313: guia da declaração ainda em andamento (antes de transmitir).
//   declaracao { contact_id, competencia, formato: "pdf" | "xml" }   DCTFWEB.CONSDECCOMPLETA33 (PDF) ou CONSXMLDECLARACAO38 (XML), Consultar:
//       guarda o arquivo da declaração e devolve um link. Já guardado: devolve sem consultar.
//   rotina_eventos   rotina diária (cron 07:40 BRT): evento E0301 (grátis, /Monitorar), 1 solicitar + 1 obter para todos os clientes do escopo.
//       O E0301 só diz que a DCTFWeb do CNPJ foi atualizada (eSocial/Reinf/SERO recebido ou declaração transmitida), sem dizer qual.
//       Marca "movimento novo" quando a data avança e avisa a equipe; quem consulta é a equipe, por clique. { forcar?: true } ignora a trava de 12 h.
//   rotina_dctfweb   rotina MENSAL (cron 20:00 a 20:25 BRT; decisão de Gabriel, 01/10/2026), só no dia 30 (em fevereiro, o último dia do mês): consulta, como no clique
//       (recibo da DCTFWeb do MÊS ANTERIOR + apurações da MIT do ano), APENAS os clientes marcados como "movimento novo" pelo sensor gratuito acima.
//       Quem não teve movimento desde a última consulta não é consultado nem cobrado. Sem rodada de atualização antes: a primeira é em 30/10/2026.
//       Fora do escopo: filial, CNPJ da CA, sensor com "x" (sem procuração) e quem está mapeado sem nenhuma procuração ativa. Não repete no mesmo dia quem já foi tentado
//       (cada tentativa é cobrada). Até 20 clientes por disparo e 100 s; para após 5 falhas seguidas. Um aviso no sino ao fim. Interruptor: serpro_config.auto_rotina_dctfweb
//       (padrão ligado). Admin simula com { dry_run: true, ignorar_data?: true, competencia? } (não cobra).
//
// Só clientes com status "Ativo". Filial é recusada (declarações da matriz). Procuração: 00103 (DCTFWeb).
// Transmitir DCTFWeb/encerrar MIT NÃO existe aqui: escrita na Receita é fase final. A guia (GERARGUIA31) entrou na Rodada 5 (gerar_guia).
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
type Resp = { corpo: Record<string, unknown>; http: number };
const resp = (corpo: Record<string, unknown>, http = 200): Resp => ({ corpo, http });

/**
 * Consulta UM cliente (recibo da DCTFWeb da competência + apurações da MIT do ano: 2 chamadas cobradas) e grava. Serve ao clique e à rodada mensal.
 * `semAviso`: a rodada soma as tarefas concluídas e avisa uma vez só no fim (em vez de um aviso por cliente).
 */
async function consultarCliente(o: {
  contactId: string; competencia: string; uid: string | null; origem: "manual" | "cron"; force?: boolean; semAviso?: boolean; motivo?: string;
}): Promise<Resp> {
  const c = await carregarCliente(o.contactId);
  if (c.resp) return { corpo: await c.resp.clone().json(), http: c.resp.status };
  const contactId = c.contato!.id;
  const comp = o.competencia;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(comp)) return resp({ error: "Informe a competência (AAAA-MM)" }, 400);
  const [ano, mes] = comp.split("-");
  const competencia = `${comp}-01`;
  if (Number(ano) < 2019 || `${comp}-01` > hojeBR()) return resp({ error: "Competência inválida" }, 400);
  if (await semProcuracaoNenhuma(contactId)) return resp({ ok: false, semProcuracao: true, error: "Este cliente não tem procuração eletrônica ativa. Peça para outorgar no e-CAC e mapeie em Procurações." });

  if (!o.force) {
    const [{ data: d }, { data: m }] = await Promise.all([
      supabase.from("serpro_dctfweb").select("consultado_em").eq("contact_id", contactId).eq("competencia", competencia).maybeSingle(),
      supabase.from("serpro_mit_consultas").select("consultado_em").eq("contact_id", contactId).eq("ano", Number(ano)).maybeSingle(),
    ]);
    const recente = (t?: string | null) => !!t && Date.now() - Date.parse(t) < RECENTE_MIN * 60_000;
    if (recente(d?.consultado_em) && recente(m?.consultado_em)) return resp({ ok: true, recente: true });
  }

  const agora = new Date().toISOString();
  const porQuem = o.motivo ?? "acionada por usuário para acompanhamento fiscal do cliente";
  let dctf: Parte & { status?: "transmitida" | "sem_declaracao" } = { ok: false };
  let mit: Parte & { apuracoes?: number } = { ok: false };
  let tarefasConcluidas = 0;

  // ---- DCTFWeb
  const r = await serpro({
    tipo: "Consultar", idSistema: "DCTFWEB", idServico: "CONSRECIBO32",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: JSON.stringify({ categoria: 40, anoPA: ano, mesPA: mes }),
    uid: o.uid, contactId, origem: o.origem,
    finalidade: `Consulta do recibo da DCTFWeb (PA ${mes}/${ano}) ${porQuem}`,
  });
  if (r.status === 403) return resp({ ok: false, semProcuracao: true, status: 403, error: "Sem procuração eletrônica para a DCTFWeb deste cliente" });
  if (semDeclaracaoDctfweb(r.resposta)) {
    await supabase.from("serpro_dctfweb").upsert({ company_id: COMPANY_ID, contact_id: contactId, competencia, status: "sem_declaracao", recibo_path: null, consultado_em: agora, consultado_por: o.uid }, { onConflict: "contact_id,competencia" });
    dctf = { ok: true, status: "sem_declaracao" };
  } else if (r.status === 200) {
    const path = await guardarPdf(supabase, BUCKET, `${COMPANY_ID}/${contactId}/dctfweb-${comp}.pdf`, pdfDoRecibo(r.resposta?.dados));
    if (!path) dctf = { ok: false, erro: "O Serpro respondeu, mas o recibo não veio em PDF válido" };
    else {
      await supabase.from("serpro_dctfweb").upsert({ company_id: COMPANY_ID, contact_id: contactId, competencia, status: "transmitida", recibo_path: path, consultado_em: agora, consultado_por: o.uid }, { onConflict: "contact_id,competencia" });
      dctf = { ok: true, status: "transmitida" };
    }
  } else {
    dctf = { ok: false, erro: msgErro(r) };
  }

  // DCTFWeb com recibo → conclui as tarefas fiscais "DCTFWeb" e "EFD-Reinf (DCTF)" da competência (ver _shared/tarefas-fiscais.ts). "Sem declaração" não conclui.
  // A DCTFWeb só é transmitida com a EFD-Reinf do período fechada: decisão de Gabriel (03/10/2026) de tratar o recibo como prova das duas.
  // (O nome "DCTF" que estava aqui não existe no catálogo do Fiscal: a tarefa "DCTFWeb" nunca era concluída.)
  if (dctf.ok && dctf.status === "transmitida") {
    for (const [obrigacao, detalhe] of [
      ["DCTFWeb", `DCTFWeb de ${mes}/${ano} com recibo na Receita`],
      ["EFD-Reinf (DCTF)", `DCTFWeb de ${mes}/${ano} transmitida (recibo na Receita), que só segue com a EFD-Reinf do período fechada`],
    ]) {
      tarefasConcluidas += await concluirTarefaFiscal(supabase, COMPANY_ID, contactId, { obrigacao, periodo: comp, tipo: "transmitted", protocolo: null, detalhe });
    }
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
    uid: o.uid, contactId, origem: o.origem,
    finalidade: `Consulta das apurações da MIT (ano ${ano}) ${porQuem}`,
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
      await supabase.from("serpro_mit_consultas").upsert({ contact_id: contactId, company_id: COMPANY_ID, ano: Number(ano), consultado_em: agora, consultado_por: o.uid, apuracoes: lista.length }, { onConflict: "contact_id,ano" });
      mit = { ok: true, apuracoes: lista.length };
    }
  } else {
    mit = { ok: false, erro: textoMit };
  }

  if (!dctf.ok && !mit.ok) return resp({ ok: false, error: dctf.erro ?? mit.erro ?? "Falha na consulta ao Serpro", dctfweb: dctf, mit });
  if (!o.semAviso) await avisarConclusoes(supabase, COMPANY_ID, c.contato!.name ?? "Cliente", tarefasConcluidas);
  return resp({ ok: true, dctfweb: dctf, mit, tarefas_concluidas: tarefasConcluidas });
}

async function consultar(payload: any, uid: string) {
  const r = await consultarCliente({ contactId: String(payload.contact_id ?? ""), competencia: String(payload.competencia ?? ""), uid, origem: "manual", force: !!payload.force });
  return json(r.corpo, r.http);
}

async function link(payload: any) {
  const { data } = await supabase.from("serpro_dctfweb").select("recibo_path,competencia").eq("id", String(payload.id ?? "")).eq("company_id", COMPANY_ID).maybeSingle();
  if (!data?.recibo_path) return json({ ok: false, error: "Recibo não disponível" });
  const url = await assinar(supabase, BUCKET, data.recibo_path, `recibo-dctfweb-${String(data.competencia).slice(0, 7)}.pdf`);
  return url ? json({ ok: true, url }) : json({ ok: false, error: "Não foi possível gerar o link" }, 500);
}

// ---------- guia (DARF) da DCTFWeb
async function gerarGuia(payload: any, uid: string) {
  if (payload.confirmar_emissao !== true) return json({ error: "Confirme a emissão (registra uma emissão na Receita e é cobrada)" }, 400);
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const contactId = c.contato!.id;
  const comp = String(payload.competencia ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(comp)) return json({ error: "Informe a competência (AAAA-MM)" }, 400);
  const [ano, mes] = comp.split("-");
  const competencia = `${comp}-01`;
  const hoje = hojeBR();
  if (competencia > hoje) return json({ error: "Competência inválida" }, 400);
  const dataPagamento = payload.data_pagamento ? String(payload.data_pagamento) : null;
  if (dataPagamento && (!/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento) || dataPagamento < hoje || dataPagamento.slice(0, 7) !== hoje.slice(0, 7))) {
    return json({ ok: false, error: "A data de pagamento precisa ser um dia útil do mês corrente, de hoje em diante." });
  }
  if (await semProcuracaoNenhuma(contactId)) return json({ ok: false, semProcuracao: true, error: "Este cliente não tem procuração eletrônica ativa. Peça para outorgar no e-CAC e mapeie em Procurações." });

  const andamento = payload.andamento === true;
  // Já emitida hoje, mesma competência e mesma data de pagamento: devolve a guardada (não emite nem cobra de novo).
  if (!payload.novo) {
    let q = supabase.from("serpro_dctfweb_guias").select("id,pdf_path").eq("contact_id", contactId).eq("competencia", competencia).eq("andamento", andamento)
      .gte("emitido_em", `${hoje}T03:00:00Z`).order("emitido_em", { ascending: false }).limit(1);
    q = dataPagamento ? q.eq("data_pagamento", dataPagamento) : q.is("data_pagamento", null);
    const { data: ja } = await q.maybeSingle();
    if (ja?.pdf_path) {
      const url = await assinar(supabase, BUCKET, ja.pdf_path, `guia-dctfweb-${comp}.pdf`);
      if (url) return json({ ok: true, jaGerado: true, url, id: ja.id });
    }
  }

  const dados: Record<string, unknown> = { categoria: "GERAL_MENSAL", anoPA: ano, mesPA: mes };
  if (dataPagamento) dados.DataAcolhimentoProposta = Number(dataPagamento.replace(/-/g, ""));
  const r = await serpro({
    tipo: "Emitir", idSistema: "DCTFWEB", idServico: andamento ? "GERARGUIAANDAMENTO313" : "GERARGUIA31",
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: JSON.stringify(dados),
    uid, contactId, origem: "manual",
    finalidade: `Emissão da guia (DARF) da DCTFWeb${andamento ? " em andamento" : ""} (PA ${mes}/${ano}) confirmada por usuário para o cliente`,
  });
  if (r.status === 403) return json({ ok: false, semProcuracao: true, error: "Sem procuração eletrônica para a DCTFWeb deste cliente" });
  if (r.status !== 200) return json({ ok: false, status: r.status, error: msgErro(r) });
  const path = await guardarPdf(supabase, BUCKET, `${COMPANY_ID}/${contactId}/guia-dctfweb-${comp}-${Date.now()}.pdf`, pdfDoRecibo(r.resposta?.dados));
  if (!path) return json({ ok: false, error: "A guia foi emitida, mas o PDF não veio em formato válido" }, 502);
  const { data: nova, error } = await supabase.from("serpro_dctfweb_guias")
    .insert({ company_id: COMPANY_ID, contact_id: contactId, competencia, data_pagamento: dataPagamento, pdf_path: path, emitido_por: uid, andamento }).select("id").single();
  if (error || !nova) return json({ ok: false, error: "A guia foi emitida e guardada, mas o registro falhou" }, 500);
  const url = await assinar(supabase, BUCKET, path, `guia-dctfweb-${comp}.pdf`);
  return json({ ok: true, url, id: nova.id });
}

// ---------- declaração completa (PDF) e XML
async function declaracao(payload: any, uid: string) {
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const contactId = c.contato!.id;
  const comp = String(payload.competencia ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(comp)) return json({ error: "Informe a competência (AAAA-MM)" }, 400);
  const xml = payload.formato === "xml";
  const [ano, mes] = comp.split("-");
  const competencia = `${comp}-01`;
  const coluna = xml ? "xml_path" : "declaracao_path";
  const nome = `${xml ? "dctfweb-xml" : "dctfweb-declaracao"}-${comp}.${xml ? "xml" : "pdf"}`;
  const { data: atual } = await supabase.from("serpro_dctfweb").select(`id,${coluna}`).eq("contact_id", contactId).eq("competencia", competencia).maybeSingle();
  const guardado = (atual as Record<string, string | null> | null)?.[coluna];
  if (guardado) {
    const url = await assinar(supabase, BUCKET, guardado, nome);
    if (url) return json({ ok: true, jaGerado: true, url });
  }
  if (await semProcuracaoNenhuma(contactId)) return json({ ok: false, semProcuracao: true, error: "Este cliente não tem procuração eletrônica ativa." });
  const r = await serpro({
    tipo: "Consultar", idSistema: "DCTFWEB", idServico: xml ? "CONSXMLDECLARACAO38" : "CONSDECCOMPLETA33",
    // Mesmo formato do recibo (CONSRECIBO32), já validado em produção: categoria 40 = GERAL_MENSAL.
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: JSON.stringify({ categoria: 40, anoPA: ano, mesPA: mes }),
    uid, contactId, origem: "manual",
    finalidade: `Consulta da ${xml ? "declaração em XML" : "declaração completa"} da DCTFWeb (PA ${mes}/${ano}) acionada por usuário para o cliente`,
  });
  if (r.status === 403) return json({ ok: false, semProcuracao: true, error: "Sem procuração eletrônica para a DCTFWeb deste cliente" });
  if (semDeclaracaoDctfweb(r.resposta)) return json({ ok: false, error: "Não há declaração transmitida para esta competência." });
  if (r.status !== 200) return json({ ok: false, status: r.status, error: msgErro(r) });
  const dados = typeof r.resposta?.dados === "string" ? (() => { try { return JSON.parse(r.resposta.dados); } catch { return r.resposta.dados; } })() : r.resposta?.dados;
  let path: string | null = null;
  if (xml) {
    const b64 = pega(dados, "XMLStringBase64");
    if (typeof b64 === "string" && b64.length > 20) {
      const bin = atob(b64.replace(/\s/g, ""));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const p = `${COMPANY_ID}/${contactId}/${nome.replace(/\.xml$/, "")}-${Date.now()}.xml`;
      const up = await supabase.storage.from(BUCKET).upload(p, bytes, { contentType: "application/xml", upsert: true });
      path = up.error ? null : p;
    }
  } else {
    path = await guardarPdf(supabase, BUCKET, `${COMPANY_ID}/${contactId}/${nome.replace(/\.pdf$/, "")}-${Date.now()}.pdf`, pdfDoRecibo(dados));
  }
  if (!path) return json({ ok: false, error: `A Receita respondeu, mas o ${xml ? "XML" : "PDF"} não veio em formato válido` }, 502);
  if (atual) await supabase.from("serpro_dctfweb").update({ [coluna]: path }).eq("id", (atual as { id: string }).id);
  else await supabase.from("serpro_dctfweb").upsert({ company_id: COMPANY_ID, contact_id: contactId, competencia, status: "transmitida", [coluna]: path, consultado_em: new Date().toISOString(), consultado_por: uid }, { onConflict: "contact_id,competencia" });
  const url = await assinar(supabase, BUCKET, path, nome);
  return json({ ok: true, url });
}

async function linkGuia(payload: any) {
  const { data } = await supabase.from("serpro_dctfweb_guias").select("pdf_path,competencia").eq("id", String(payload.id ?? "")).eq("company_id", COMPANY_ID).maybeSingle();
  if (!data?.pdf_path) return json({ ok: false, error: "Guia não disponível" });
  const url = await assinar(supabase, BUCKET, data.pdf_path, `guia-dctfweb-${String(data.competencia).slice(0, 7)}.pdf`);
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
    .filter((c) => c.cnpj.length === 14 && c.cnpj.slice(8, 12) === "0001");
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

// ---------- rotina mensal (dia 30): consulta paga só de quem está com "movimento novo" ----------
const PRECO_CONSULTAR = 0.24;       // R$ por chamada (faixa até 300 no ciclo; acima disso o Serpro cobra menos)
const CHAMADAS_POR_CLIENTE = 2;     // recibo da DCTFWeb + apurações da MIT
const LIMITE_POR_DISPARO = 20;
const dataBRde = (iso: string) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 10);

/** Dia 30 de cada mês; em fevereiro, o último dia do mês. */
const ehDiaDaRodada = (hoje: string) => {
  const ano = Number(hoje.slice(0, 4)), mes = Number(hoje.slice(5, 7));
  return Number(hoje.slice(8, 10)) === Math.min(30, new Date(Date.UTC(ano, mes, 0)).getUTCDate());
};
/** Competência da rodada: o mês anterior ao da rodada (a DCTFWeb do mês que acabou de fechar). */
const competenciaDaRodada = (hoje: string) => {
  const ano = Number(hoje.slice(0, 4)), mes = Number(hoje.slice(5, 7));
  return mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
};
const siglaComp = (comp: string) => `${comp.slice(5, 7)}/${comp.slice(0, 4)}`;

/**
 * Um aviso por título e por dia no sino (admins e quem tem o módulo dashboard_federal). Tipo próprio (serpro_dctfweb_rodada): o serpro_dctfweb é o aviso DIÁRIO
 * de movimento, que aparece no sino de Mensagens e-CAC; o das rodadas fica nas Notificações Federais.
 */
async function avisarRodada(titulo: string, corpo: string, hoje: string) {
  try {
    const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true })
      .eq("company_id", COMPANY_ID).eq("type", "serpro_dctfweb_rodada").eq("title", titulo).gte("created_at", `${hoje}T03:00:00Z`);
    if ((count ?? 0) > 0) return;
    const { data: alvos } = await supabase.from("profiles").select("user_id")
      .eq("company_id", COMPANY_ID).eq("status_active", true).or("role.in.(admin,super_admin),allowed_modules.cs.{dashboard_federal}");
    if (!alvos?.length) return;
    await supabase.from("notifications").insert(alvos.map((t: { user_id: string }) => ({
      user_id: t.user_id, company_id: COMPANY_ID, type: "serpro_dctfweb_rodada", title: titulo, body: corpo, action_url: "/dashboard-federal/dctfweb-mit",
    })));
  } catch (e) {
    console.error("Falha ao avisar a rodada da DCTFWeb:", String((e as Error).message || e));
  }
}

/**
 * Clientes da rodada: Presumido e Real, Ativo, matriz, CNPJ válido, sem os CNPJs da CA e sem estar mapeado sem nenhuma procuração ativa (a tentativa seria cobrada e voltaria 403).
 * `novo` = o sensor gratuito viu a Receita mexer na DCTFWeb depois da última consulta (mesma regra da tela). Sensor "x" (sem procuração) fica de fora.
 */
async function carteiraDaRodada() {
  const { data: contatos } = await supabase.from("contacts").select("id,name,display_name,document")
    .eq("company_id", COMPANY_ID).eq("is_active", true).eq("status_cliente", STATUS_MONITORADO).in("tax_regime", REGIMES_DO_ESCOPO).order("name");
  // O mapa de procurações passa de 1.000 linhas (teto do banco por consulta): lê em páginas.
  const procs = await lerTodas<{ contact_id: string; status: string; data_fim: string | null }>((de, ate) => supabase.from("serpro_procuracoes").select("contact_id,status,data_fim")
    .eq("company_id", COMPANY_ID).eq("fonte", "integra_procuracoes").in("codigo_procuracao", CODIGOS_BASE).order("id").range(de, ate));
  const hoje = hojeBR();
  const comMapa = new Map<string, boolean>();
  for (const r of procs) comMapa.set(r.contact_id, (comMapa.get(r.contact_id) ?? false) || (r.status === "ativa" && (!r.data_fim || r.data_fim >= hoje)));
  const sensor = await lerTodas<{ contact_id: string; mudou_em: string | null; ultima_consulta_em: string | null; sem_procuracao: boolean }>((de, ate) => supabase.from("serpro_dctfweb_sensor")
    .select("contact_id,mudou_em,ultima_consulta_em,sem_procuracao").eq("company_id", COMPANY_ID).order("contact_id").range(de, ate));
  const sPor = new Map(sensor.map((x) => [x.contact_id, x]));

  const elegiveis = ((contatos ?? []) as { id: string; name: string | null; display_name: string | null; document: string | null }[]).filter((c) => {
    const cnpj = onlyDigits(c.document);
    return cnpj.length === 14 && cnpj.slice(8, 12) === "0001";
  });
  const semProcuracao = elegiveis.filter((c) => comMapa.get(c.id) === false);
  const fora = new Set(semProcuracao.map((c) => c.id));
  const tentaveis = elegiveis.filter((c) => !fora.has(c.id));
  const ehNovo = (id: string) => {
    const sn = sPor.get(id);
    return !!sn?.mudou_em && !sn.sem_procuracao && (!sn.ultima_consulta_em || Date.parse(sn.mudou_em) > Date.parse(sn.ultima_consulta_em));
  };
  return { elegiveis, tentaveis, novos: tentaveis.filter((c) => ehNovo(c.id)), semProcuracao: semProcuracao.length };
}

/** Clientes que já tiveram o recibo da DCTFWeb consultado desde o dia informado, inclusive (qualquer origem). Padrão: hoje. A rodada não repete, porque cada tentativa custa, mesmo quando falha. */
async function tentadosDesde(desde: string, ateOQueFor = false): Promise<Set<string>> {
  const { data } = await supabase.from("serpro_call_log").select("contact_id,created_at")
    .eq("company_id", COMPANY_ID).eq("id_servico", "CONSRECIBO32").gte("created_at", `${desde}T03:00:00Z`).limit(1000);
  return new Set(((data ?? []) as { contact_id: string | null; created_at: string }[]).filter((r) => r.contact_id && (ateOQueFor || dataBRde(r.created_at) === desde)).map((r) => r.contact_id as string));
}
const tentadosHoje = (hoje: string) => tentadosDesde(hoje);

/** Rotina mensal: o cron bate todo dia; quem decide é o interruptor (padrão ligado) e a DATA (dia 30). */
async function rotinaDctfweb(payload: any, uid: string | null, unica = false) {
  const hoje = hojeBR();
  // `adm`: administrador logado OU chave de uso curto (rodada única de atualização). Só `adm` simula, ignora a data e escolhe parâmetros.
  const adm = !!uid || unica;
  const simulando = adm && payload.dry_run === true;
  const { data: cfg } = await supabase.from("serpro_config").select("auto_rotina_dctfweb").eq("company_id", COMPANY_ID).maybeSingle();
  if (!simulando && !unica && cfg?.auto_rotina_dctfweb === false) return json({ ok: true, desligada: true });
  if (!(adm && payload.ignorar_data === true) && !ehDiaDaRodada(hoje)) return json({ ok: true, nada_a_fazer: true, hoje });

  const comp = adm && /^\d{4}-(0[1-9]|1[0-2])$/.test(String(payload.competencia ?? "")) ? String(payload.competencia) : competenciaDaRodada(hoje);
  const limite = adm ? Math.max(1, Math.min(Number(payload.limite) || LIMITE_POR_DISPARO, LIMITE_POR_DISPARO)) : LIMITE_POR_DISPARO;
  const { tentaveis, novos, semProcuracao } = await carteiraDaRodada();
  const tentados = await tentadosHoje(hoje);
  // Rodada de atualização (`todos`): consulta a carteira inteira do escopo, não só o "movimento novo"; quem já foi consultado desde a data informada fica de fora.
  const todos = adm && payload.todos === true;
  const jaConsultados = todos && /^\d{4}-\d{2}-\d{2}$/.test(String(payload.pular_consultados_desde ?? "")) ? await tentadosDesde(String(payload.pular_consultados_desde), true) : new Set<string>();
  const alvo = (todos ? tentaveis : novos).filter((c) => !tentados.has(c.id) && !jaConsultados.has(c.id));
  if (simulando) {
    return json({ ok: true, dry_run: true, hoje, competencia: comp, no_escopo: tentaveis.length, com_movimento_novo: novos.length, a_consultar: alvo.length,
      sem_procuracao_pulados: semProcuracao, custo_estimado_reais: Math.round(alvo.length * CHAMADAS_POR_CLIENTE * PRECO_CONSULTAR * 100) / 100 });
  }

  const inicio = Date.now();
  const resumo = { consultados: 0, com_recibo: 0, sem_declaracao: 0, parciais: 0, erros: 0, tarefas_concluidas: 0 };
  const falhas: string[] = [];
  let seguidas = 0, processados = 0;
  for (const c of alvo) {
    if (processados >= limite || Date.now() - inicio > 100_000 || seguidas >= 5) break;
    processados++;
    const r = await consultarCliente({
      contactId: c.id, competencia: comp, uid, origem: adm ? "manual" : "cron", force: true, semAviso: true,
      motivo: unica
        ? `na rodada de atualização da DCTFWeb e da MIT (aprovada por Gabriel em 01/10/2026, antes da primeira rodada mensal), de todos os clientes do Presumido e do Real, para acompanhamento fiscal`
        : `na rodada mensal da DCTFWeb e da MIT (dia 30) de cliente com movimento novo informado pela Receita (evento E0301), para acompanhamento fiscal`,
    });
    if (r.corpo.ok === true) {
      seguidas = 0;
      resumo.consultados++;
      const d = r.corpo.dctfweb as { ok: boolean; status?: string }, m = r.corpo.mit as { ok: boolean };
      if (d.status === "transmitida") resumo.com_recibo++;
      else if (d.status === "sem_declaracao") resumo.sem_declaracao++;
      if (!d.ok || !m.ok) resumo.parciais++;
      resumo.tarefas_concluidas += Number(r.corpo.tarefas_concluidas) || 0;
    } else {
      seguidas++;
      resumo.erros++;
      if (falhas.length < 10) falhas.push(`${c.display_name || c.name}: ${String(r.corpo.error ?? r.corpo.status ?? "falha")}`);
    }
    await sleep(150);
  }
  const restantes = alvo.length - processados;
  if (resumo.tarefas_concluidas > 0) await avisarConclusoes(supabase, COMPANY_ID, `${resumo.consultados} ${resumo.consultados === 1 ? "cliente" : "clientes"} (rodada mensal da DCTFWeb e MIT)`, resumo.tarefas_concluidas);

  if (seguidas >= 5) {
    await avisarRodada("DCTFWeb e MIT: rodada mensal parou por falhas", `A Receita falhou ${resumo.erros} vezes seguidas. Nada mais foi cobrado hoje. Veja o registro de chamadas em Tech.`, hoje);
  } else if (restantes === 0) {
    // Resumo do dia lido do que ficou gravado: vale para os vários disparos da noite, e um aviso só por dia.
    const tentadosAgora = await tentadosHoje(hoje);
    const { data: gravados } = await supabase.from("serpro_dctfweb").select("contact_id,status,consultado_em").eq("company_id", COMPANY_ID).eq("competencia", `${comp}-01`).gte("consultado_em", `${hoje}T03:00:00Z`).limit(1000);
    const doDia = ((gravados ?? []) as { status: string; consultado_em: string }[]).filter((g) => dataBRde(g.consultado_em) === hoje);
    const recibos = doDia.filter((g) => g.status === "transmitida").length;
    const sem = doDia.filter((g) => g.status === "sem_declaracao").length;
    const semResultado = tentadosAgora.size - doDia.length;
    if (tentadosAgora.size === 0) {
      await avisarRodada("DCTFWeb e MIT: nenhum cliente com movimento novo", `Nenhum cliente do Presumido ou do Real teve movimento novo na Receita desde a última consulta. Nada foi consultado nem cobrado.`, hoje);
    } else {
      await avisarRodada(`DCTFWeb e MIT de ${siglaComp(comp)}: ${unica ? "atualização concluída" : "rodada mensal concluída"}`,
        `${tentadosAgora.size} ${unica ? (tentadosAgora.size === 1 ? "cliente consultado" : "clientes consultados") : (tentadosAgora.size === 1 ? "cliente com movimento novo consultado" : "clientes com movimento novo consultados")}: ${recibos} com recibo da DCTFWeb, ${sem} sem declaração`
          + (semResultado > 0 ? `, ${semResultado} sem resultado (consulte pelo botão)` : "") + ". Veja na tela DCTFWeb e MIT.", hoje);
    }
  }
  return json({ ok: true, hoje, competencia: comp, no_escopo: tentaveis.length, com_movimento_novo: novos.length, a_consultar: alvo.length, sem_procuracao_pulados: semProcuracao,
    ...resumo, restantes, parou_por_falhas: seguidas >= 5, falhas, segundos: Math.round((Date.now() - inicio) / 1000) });
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

  // Cron chama com a chave anon (padrão do projeto). Só as duas rotinas aceitam isso: a de eventos (grátis, trava de 12 h) e a mensal (decide pelo interruptor e pela data).
  const ehCron = bearer === Deno.env.get("SUPABASE_ANON_KEY") || jwtRole(bearer) === "anon";
  if (payload.action === "rotina_eventos" && ehCron) {
    return await rotinaEventos({ ...payload, forcar: false, limite: undefined, semFallback: false }, null, "cron");
  }
  // Rodada única de atualização por chave de uso curto (ver _shared/lote-token.ts): mesma rotina, a qualquer data, sem depender do interruptor.
  if (payload.action === "rotina_dctfweb" && req.headers.get("x-lote-token")) {
    if (!(await loteTokenValido(supabase, COMPANY_ID, req))) return json({ error: "Chave da rodada inválida ou vencida" }, 403);
    return await rotinaDctfweb(payload, null, true);
  }
  if (payload.action === "rotina_dctfweb" && ehCron) return await rotinaDctfweb({}, null);

  const { data: userData } = await supabase.auth.getUser(bearer);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "Não autenticado" }, 401);
  const { data: perfil } = await perfilAtivo(bearer, uid, "role,is_super_admin,company_id");
  const admin = perfil?.is_super_admin === true || (perfil?.role === "admin" && perfil?.company_id === COMPANY_ID);
  const equipe = admin || (perfil?.role === "colaborador" && perfil?.company_id === COMPANY_ID);
  if (!equipe) return json({ error: "Sem permissão" }, 403);

  switch (payload.action) {
    case "consultar": return await consultar(payload, uid);
    case "link": return await link(payload);
    case "gerar_guia": return await gerarGuia(payload, uid);
    case "link_guia": return await linkGuia(payload);
    case "declaracao": return await declaracao(payload, uid);
    case "rotina_eventos":
      if (!admin) return json({ error: "Só administradores rodam a rotina manualmente" }, 403);
      return await rotinaEventos(payload, uid, "manual");
    case "rotina_dctfweb":
      if (!admin) return json({ error: "Só administradores rodam a rotina manualmente" }, 403);
      return await rotinaDctfweb(payload, uid);
    default: return json({ error: "action inválida (consultar | link | gerar_guia | link_guia | declaracao | rotina_eventos | rotina_dctfweb)" }, 400);
  }
});
