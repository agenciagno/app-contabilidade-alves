import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { criarSerpro, onlyDigits } from "../_shared/serpro-core.ts";
import { pega } from "../_shared/pgdasd-indice.ts";
import { assinar, guardarPdf } from "../_shared/serpro-arquivos.ts";
import { lerParcelasAbertas, lerPedidos, MODALIDADES, type Modalidade } from "../_shared/parcelamentos-indice.ts";

// ---------------------------------------------------------------------------
// Parcelamentos do Simples Nacional (PARCSN ordinário, PARCSN-ESP, PERTSN, RELPSN) — F4 Onda 3, 30/09/2026.
// Só leitura + emissão da guia da parcela (DAS de parcelamento), tudo por clique de UM cliente.
//
//   consultar   { contact_id, force?, todas? }
//       Por modalidade: PEDIDOSPARC (Consultar) → e, se houver parcelamento "Em parcelamento", PARCELASPARAGERAR (Consultar: parcelas
//       em aberto, atrasadas e a do mês). Na 1ª consulta do cliente vai nas 4 modalidades; depois, só no PARCSN ordinário (que o cliente
//       pode pedir de novo a qualquer hora) e nas modalidades em que ele já teve algum pedido (as outras são programas encerrados).
//       `todas: true` consulta as 4 de novo.
//   gerar_guia  { contact_id, modalidade, parcela: AAAAMM, confirmar_emissao: true, novo? }
//       GERARDAS (Emitir): só para parcela que está na lista de em aberto; se já houve guia da mesma parcela nas últimas 24 h, devolve o
//       arquivo guardado em vez de emitir outra (o Serpro só devolve o PDF, sem vencimento nem valor estruturados).
//   link        { id }     link assinado (10 min) de uma guia guardada (sem chamada ao Serpro).
//
// Só clientes com status "Ativo". Filial é recusada: o parcelamento é do CNPJ da matriz. Procurações: 00076/00188 (ordinário), 00125 (especial),
// 00149/10011 (PERT-SN), 00210 (RELP-SN).
// ---------------------------------------------------------------------------

const COMPANY_ID = "5cd08fcd-c095-4f08-b3a8-c02b9bf1034e";
const STATUS_MONITORADO = "Ativo";
const RECENTE_MIN = 15;
const REUSO_GUIA_HORAS = 24;
const BUCKET = "serpro-parcelamentos";
const CODIGOS_BASE = ["00146", "00006", "00004", "00060", "00002", "00103", "00050", "00051"]; // mesmos do mapa de procurações

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const { serpro } = criarSerpro(supabase, COMPANY_ID);

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
  if (cnpj.slice(8, 12) !== "0001") return { resp: json({ ok: false, filial: true, error: "Este CNPJ é de filial. O parcelamento é do CNPJ da matriz: consulte a matriz." }) };
  return { contato: c, cnpj };
}

/** Cliente mapeado e sem NENHUMA procuração ativa: nem tenta (cada tentativa cobrada voltaria 403). Não mapeado: tenta. */
async function semProcuracaoNenhuma(contactId: string): Promise<boolean> {
  const { data } = await supabase.from("serpro_procuracoes").select("status,data_fim").eq("contact_id", contactId).eq("fonte", "integra_procuracoes").in("codigo_procuracao", CODIGOS_BASE);
  if (!data?.length) return false;
  const hoje = hojeBR();
  return !data.some((r: { status: string; data_fim: string | null }) => r.status === "ativa" && (!r.data_fim || r.data_fim >= hoje));
}

interface ResultadoMod { modalidade: Modalidade; pedidos: number; ativos: number; parcelas: number; semProcuracao?: boolean; erro?: string }

async function consultar(payload: any, uid: string) {
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const contactId = c.contato!.id;
  if (await semProcuracaoNenhuma(contactId)) return json({ ok: false, semProcuracao: true, error: "Este cliente não tem procuração eletrônica ativa. Peça para outorgar no e-CAC e mapeie em Procurações." });

  const { data: feitas } = await supabase.from("serpro_parcelamentos_consultas").select("modalidade,consultado_em,pedidos").eq("contact_id", contactId);
  const porMod = new Map((feitas ?? []).map((f: { modalidade: string; consultado_em: string; pedidos: number }) => [f.modalidade, f]));
  if (!payload.force && feitas?.length) {
    const ultima = Math.max(...feitas.map((f: { consultado_em: string }) => Date.parse(f.consultado_em)));
    if (Date.now() - ultima < RECENTE_MIN * 60_000) return json({ ok: true, recente: true, consultado_em: new Date(ultima).toISOString() });
  }
  const alvo = MODALIDADES.filter((m) => payload.todas === true || m.mod === "PARCSN" || !porMod.has(m.mod) || (porMod.get(m.mod)?.pedidos ?? 0) > 0);

  const resultados: ResultadoMod[] = [];
  for (const m of alvo) {
    const r: ResultadoMod = { modalidade: m.mod, pedidos: 0, ativos: 0, parcelas: 0 };
    const ped = await serpro({
      tipo: "Consultar", idSistema: m.sistema, idServico: m.pedidos,
      contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: "",
      uid, contactId, origem: "manual",
      finalidade: `Consulta dos pedidos de parcelamento do Simples (${m.rotulo}) acionada por usuário para acompanhamento fiscal do cliente`,
    });
    const agora = new Date().toISOString();
    const textoErro = msgErro(ped);
    // Sem nenhum pedido nesta modalidade: o formato exato da resposta ainda não foi visto em produção; "não há/nenhum" vale como lista vazia.
    const vazio = ped.status === 204 || ped.status === 404 || (ped.status !== 200 && ped.status !== 403 && /n[aã]o (h[aá]|existe|possui|foi encontrad|localiz)|nenhum/i.test(textoErro));
    if (ped.status === 403) {
      r.semProcuracao = true;
    } else if (ped.status !== 200 && !vazio) {
      r.erro = textoErro;
      resultados.push(r);
      continue;
    } else {
      const pedidos = vazio ? [] : lerPedidos(ped.resposta?.dados);
      r.pedidos = pedidos.length;
      r.ativos = pedidos.filter((p) => p.ativo).length;
      if (pedidos.length) {
        const { error } = await supabase.from("serpro_parcelamentos").upsert(
          pedidos.map((p) => ({ company_id: COMPANY_ID, contact_id: contactId, modalidade: m.mod, numero: p.numero, data_pedido: p.data_pedido, situacao: p.situacao, data_situacao: p.data_situacao, ativo: p.ativo, sincronizado_em: agora })),
          { onConflict: "contact_id,modalidade,numero" });
        if (error) { r.erro = `Consulta feita, mas não foi possível gravar: ${error.message}`; resultados.push(r); continue; }
      }
      if (r.ativos > 0) {
        const par = await serpro({
          tipo: "Consultar", idSistema: m.sistema, idServico: m.parcelas,
          contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: "",
          uid, contactId, origem: "manual",
          finalidade: `Consulta das parcelas em aberto do parcelamento do Simples (${m.rotulo}) acionada por usuário para o cliente`,
        });
        if (par.status === 200) {
          const parcelas = lerParcelasAbertas(par.resposta?.dados);
          r.parcelas = parcelas.length;
          await supabase.from("serpro_parcelas_abertas").delete().eq("contact_id", contactId).eq("modalidade", m.mod);
          if (parcelas.length) await supabase.from("serpro_parcelas_abertas").insert(parcelas.map((p) => ({ company_id: COMPANY_ID, contact_id: contactId, modalidade: m.mod, parcela: p.parcela, valor: p.valor, sincronizado_em: agora })));
        } else {
          r.erro = par.status === 403 ? "Sem procuração para consultar as parcelas" : msgErro(par);
        }
      } else {
        // Sem parcelamento ativo: não há parcela em aberto para mostrar.
        await supabase.from("serpro_parcelas_abertas").delete().eq("contact_id", contactId).eq("modalidade", m.mod);
      }
    }
    await supabase.from("serpro_parcelamentos_consultas").upsert(
      { contact_id: contactId, company_id: COMPANY_ID, modalidade: m.mod, consultado_em: agora, consultado_por: uid, pedidos: r.pedidos, ativos: r.ativos, sem_procuracao: !!r.semProcuracao, erro: r.erro ?? null },
      { onConflict: "contact_id,modalidade" });
    resultados.push(r);
  }
  const todasFalharam = resultados.length > 0 && resultados.every((r) => r.erro || r.semProcuracao);
  if (todasFalharam && resultados.every((r) => r.semProcuracao)) return json({ ok: false, semProcuracao: true, modalidades: resultados, error: "Sem procuração eletrônica para os parcelamentos deste cliente" });
  if (todasFalharam) return json({ ok: false, modalidades: resultados, error: resultados.find((r) => r.erro)?.erro ?? "Falha na consulta ao Serpro" });
  return json({ ok: true, modalidades: resultados, consultadas: resultados.length, ativos: resultados.reduce((s, r) => s + r.ativos, 0), parcelas: resultados.reduce((s, r) => s + r.parcelas, 0) });
}

async function gerarGuia(payload: any, uid: string) {
  // Gerar guia registra uma emissão na Receita: só com confirmação explícita de quem clicou.
  if (payload.confirmar_emissao !== true) return json({ error: "Emissão não confirmada. Gerar a guia registra uma emissão na Receita e precisa de confirmação explícita." }, 400);
  const c = await carregarCliente(String(payload.contact_id ?? ""));
  if (c.resp) return c.resp;
  const contactId = c.contato!.id;
  const m = MODALIDADES.find((x) => x.mod === payload.modalidade);
  if (!m) return json({ error: "Modalidade inválida" }, 400);
  const parcela = Number(payload.parcela);
  if (!/^\d{6}$/.test(String(parcela))) return json({ error: "Parcela inválida (AAAAMM)" }, 400);

  const { data: aberta } = await supabase.from("serpro_parcelas_abertas").select("id").eq("contact_id", contactId).eq("modalidade", m.mod).eq("parcela", parcela).maybeSingle();
  if (!aberta) return json({ ok: false, error: "Esta parcela não está na lista de parcelas em aberto. Consulte o cliente de novo antes de gerar a guia." });

  if (!payload.novo) {
    const desde = new Date(Date.now() - REUSO_GUIA_HORAS * 3600_000).toISOString();
    const { data: ja } = await supabase.from("serpro_parcelas_guias").select("id,pdf_path,gerado_em").eq("contact_id", contactId).eq("modalidade", m.mod).eq("parcela", parcela)
      .gte("gerado_em", desde).order("gerado_em", { ascending: false }).limit(1).maybeSingle();
    if (ja?.pdf_path) {
      const url = await assinar(supabase, BUCKET, ja.pdf_path, `guia-${m.mod}-${parcela}.pdf`);
      if (url) return json({ ok: true, jaGerado: true, url, id: ja.id, gerado_em: ja.gerado_em });
    }
  }

  const r = await serpro({
    tipo: "Emitir", idSistema: m.sistema, idServico: m.das,
    contribuinte: { numero: c.cnpj!, tipo: 2 }, dados: JSON.stringify({ parcelaParaEmitir: parcela }),
    uid, contactId, origem: "manual",
    finalidade: `Emissão da guia da parcela ${String(parcela).slice(4)}/${String(parcela).slice(0, 4)} do parcelamento do Simples (${m.rotulo}) confirmada por usuário para o cliente`,
  });
  if (r.status === 403) return json({ ok: false, semProcuracao: true, error: "Sem procuração eletrônica para emitir a guia deste parcelamento" });
  if (r.status !== 200) return json({ ok: false, status: r.status, error: msgErro(r) });
  const agora = new Date().toISOString();
  const path = await guardarPdf(supabase, BUCKET, `${COMPANY_ID}/${contactId}/guia-${m.mod}-${parcela}-${Date.now()}.pdf`, pega(r.resposta?.dados, "docArrecadacaoPdfB64"));
  if (!path) return json({ ok: false, error: "A guia foi emitida, mas o PDF não veio em formato válido" }, 502);
  const { data: nova } = await supabase.from("serpro_parcelas_guias").insert({ company_id: COMPANY_ID, contact_id: contactId, modalidade: m.mod, parcela, pdf_path: path, gerado_em: agora, gerado_por: uid }).select("id").maybeSingle();
  const url = await assinar(supabase, BUCKET, path, `guia-${m.mod}-${parcela}.pdf`);
  return json({ ok: true, url, id: nova?.id ?? null, gerado_em: agora });
}

async function link(payload: any) {
  const { data } = await supabase.from("serpro_parcelas_guias").select("pdf_path,modalidade,parcela").eq("id", String(payload.id ?? "")).eq("company_id", COMPANY_ID).maybeSingle();
  if (!data?.pdf_path) return json({ ok: false, error: "Guia não encontrada" });
  const url = await assinar(supabase, BUCKET, data.pdf_path, `guia-${data.modalidade}-${data.parcela}.pdf`);
  return url ? json({ ok: true, url }) : json({ ok: false, error: "Não foi possível gerar o link" }, 500);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const payload = await req.json().catch(() => ({}));
  const { data: userData } = await supabase.auth.getUser(bearer);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "Não autenticado" }, 401);
  const { data: perfil } = await supabase.from("profiles").select("role,is_super_admin,company_id").eq("user_id", uid).maybeSingle();
  const admin = perfil?.is_super_admin === true || (perfil?.role === "admin" && perfil?.company_id === COMPANY_ID);
  const equipe = admin || (perfil?.role === "colaborador" && perfil?.company_id === COMPANY_ID);
  if (!equipe) return json({ error: "Sem permissão" }, 403);

  switch (payload.action) {
    case "consultar": return await consultar(payload, uid);
    case "gerar_guia": return await gerarGuia(payload, uid);
    case "link": return await link(payload);
    default: return json({ error: "action inválida (consultar | gerar_guia | link)" }, 400);
  }
});
