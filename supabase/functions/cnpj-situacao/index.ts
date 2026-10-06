import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { lerTodas } from "../_shared/paginar.ts";

// ---------------------------------------------------------------------------
// Monitor semanal da situação cadastral do CNPJ (decisão de Gabriel, 06/10/2026: fonte gratuita, rotina aos domingos).
//
// Fonte: cnpj.ws pública (3 consultas por minuto) e, se falhar, BrasilAPI. As duas vêm da base aberta da Receita, que é mensal:
// uma mudança pode levar semanas para aparecer. A API paga do Serpro (Consulta CNPJ) seria a base atual; trocar de fonte é trocar `consultar()`.
//
// Ações (corpo JSON):
//   rotina  Confere até 3 clientes que ainda não foram conferidos nos últimos 3 dias (o cron roda de minuto em minuto no domingo de manhã;
//           3 por minuto respeita o limite do cnpj.ws, e quem falha só volta à fila depois de 15 min). Se a situação mudou, grava em
//           contacts.situacao_cadastral (o trigger contacts_sync_status_receita ajusta o status do cliente), registra em cnpj_situacao_log
//           e avisa no sino admins e o responsável fiscal do cliente (tipo cnpj_situacao, sino Gerais).
//           Só entra contato do tipo "cliente", com CNPJ de 14 caracteres e status fora de Baixada, Ex-cliente, Ex-Colaborador e Cancelada - Receita Federal.
//           Opcionais (admin autenticado ou cron): contact_ids (confere esses, mesmo já conferidos), limite (até 10).
//           Só admin autenticado: dry_run (não grava nada e devolve o detalhe).
//   resumo  Um aviso por dia aos admins: quantos foram conferidos, quantas mudanças e quem ficou sem consulta (cron de domingo, 09:00 BRT).
//
// A resposta do cron (chave anon) traz só contagens, nunca nomes de clientes.
// ---------------------------------------------------------------------------

const COMPANY_ID = "5cd08fcd-c095-4f08-b3a8-c02b9bf1034e";
const LOTE = 3;
const LOTE_MAX = 10;
const VALIDADE_DIAS = 3;   // conferido nos últimos 3 dias = em dia (o domingo seguinte está a 7 dias)
const REPETIR_MIN = 15;    // quem falhou só volta à fila depois disto
const TIMEOUT_MS = 8000;
const TIPO_MONITORADO = "cliente";
const STATUS_FORA = new Set(["Baixada", "Ex-cliente", "Ex-Colaborador", "Cancelada - Receita Federal"]);
const TIPO_AVISO = "cnpj_situacao";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function jwtRole(token: string): string | null {
  try {
    return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))?.role ?? null;
  } catch { return null; }
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const chave = (s?: string | null) => semAcento((s ?? "").trim()).toLowerCase();
const capitalizar = (s: string) => { const t = s.trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
const cnpjLimpo = (d?: string | null) => (d ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : null);
const msgErro = (e: unknown) => (e instanceof DOMException && e.name === "AbortError" ? "timeout" : String((e as Error)?.message ?? e));
const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

// ---------- fontes ----------
type Consulta = { situacao: string; data: string | null; motivo: string | null; fonte: string };

async function buscar(url: string): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    // A BrasilAPI responde 403 ao User-Agent padrão de bibliotecas (testado com o do Node); um próprio resolve.
    const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "ContabilidadeAlves-MonitorCNPJ/1.0" }, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function cnpjWs(cnpj: string): Promise<Consulta> {
  const e = (await buscar(`https://publica.cnpj.ws/cnpj/${cnpj}`))?.estabelecimento;
  if (!e?.situacao_cadastral) throw new Error("resposta sem situação");
  return { situacao: capitalizar(e.situacao_cadastral), data: e.data_situacao_cadastral ?? null, motivo: e.motivo_situacao_cadastral?.descricao ?? null, fonte: "cnpj.ws" };
}

async function brasilApi(cnpj: string): Promise<Consulta> {
  const raw = await buscar(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  if (!raw?.descricao_situacao_cadastral) throw new Error("resposta sem situação");
  const motivo = raw.descricao_motivo_situacao_cadastral;
  return { situacao: capitalizar(raw.descricao_situacao_cadastral), data: raw.data_situacao_cadastral ?? null, motivo: motivo && chave(motivo) !== "sem motivo" ? motivo : null, fonte: "brasilapi" };
}

async function consultar(cnpj: string): Promise<Consulta> {
  const erros: string[] = [];
  for (const [nome, fn] of [["cnpj.ws", cnpjWs], ["brasilapi", brasilApi]] as const) {
    try { return await fn(cnpj); } catch (e) { erros.push(`${nome}: ${msgErro(e)}`); }
  }
  throw new Error(erros.join(" | "));
}

// ---------- carteira e fila ----------
type Contato = { id: string; type: string | null; name: string; display_name: string | null; document: string | null; status_cliente: string | null; situacao_cadastral: string | null; responsible_id: string | null };
type Registro = { contact_id: string; ok: boolean; mudou: boolean; consultado_em: string };

async function carteira(): Promise<Contato[]> {
  const todos = await lerTodas<Contato>((de, ate) => supabase.from("contacts")
    .select("id,type,name,display_name,document,status_cliente,situacao_cadastral,responsible_id")
    .eq("company_id", COMPANY_ID).eq("is_active", true).order("id").range(de, ate));
  return todos.filter((c) => c.type === TIPO_MONITORADO && cnpjLimpo(c.document).length === 14 && !STATUS_FORA.has(c.status_cliente ?? ""));
}

const registrosRecentes = () => {
  const desde = new Date(Date.now() - VALIDADE_DIAS * 86400_000).toISOString();
  return lerTodas<Registro>((de, ate) => supabase.from("cnpj_situacao_log")
    .select("contact_id,ok,mudou,consultado_em").eq("company_id", COMPANY_ID).gte("consultado_em", desde).order("id").range(de, ate));
};

function pendentes(lista: Contato[], regs: Registro[]): Contato[] {
  const emDia = new Set<string>();
  const ultima = new Map<string, number>();
  for (const r of regs) {
    if (r.ok) emDia.add(r.contact_id);
    ultima.set(r.contact_id, Math.max(ultima.get(r.contact_id) ?? 0, Date.parse(r.consultado_em)));
  }
  const corte = Date.now() - REPETIR_MIN * 60_000;
  return lista
    .filter((c) => !emDia.has(c.id) && (ultima.get(c.id) ?? 0) < corte)
    .sort((a, b) => (ultima.get(a.id) ?? 0) - (ultima.get(b.id) ?? 0));
}

// ---------- avisos ----------
async function admins(): Promise<string[]> {
  const { data } = await supabase.from("profiles").select("user_id")
    .eq("company_id", COMPANY_ID).eq("status_active", true).or("role.in.(admin,super_admin),is_super_admin.eq.true");
  return (data ?? []).map((p: { user_id: string }) => p.user_id);
}

async function destinatarios(responsibleId: string | null): Promise<string[]> {
  const ids = new Set(await admins());
  if (responsibleId) {
    const { data } = await supabase.from("profiles").select("user_id").eq("id", responsibleId).eq("company_id", COMPANY_ID).eq("status_active", true).maybeSingle();
    if (data?.user_id) ids.add(data.user_id);
  }
  return [...ids];
}

async function avisarMudanca(c: Contato, antes: string | null, r: Consulta, statusAntes: string | null, statusDepois: string | null) {
  try {
    const nome = (c.display_name || c.name).trim();
    const motivo = r.motivo ? (r.motivo === r.motivo.toUpperCase() ? capitalizar(r.motivo) : r.motivo) : null;
    const partes = [`Receita Federal${r.data ? `, desde ${dataBR(r.data)}` : ""}.`];
    if (motivo) partes.push(`Motivo: ${motivo}.`);
    if (statusDepois && statusDepois !== statusAntes) partes.push(`O status do cliente passou para "${statusDepois}".`);
    if (chave(r.situacao) === "baixada") partes.push("Defina o status do cliente.");
    const alvos = await destinatarios(c.responsible_id);
    if (!alvos.length) return;
    await supabase.from("notifications").insert(alvos.map((user_id) => ({
      user_id, company_id: COMPANY_ID, type: TIPO_AVISO,
      title: antes ? `${nome}: CNPJ passou de ${antes} para ${r.situacao}` : `${nome}: CNPJ está ${r.situacao}`,
      body: partes.join(" "), action_url: "/contatos", reference_type: "contact", reference_id: c.id,
    })));
  } catch (e) {
    console.error("Falha ao avisar a mudança de situação:", msgErro(e));
  }
}

// ---------- rotina ----------
async function conferir(c: Contato, dryRun: boolean) {
  const nome = (c.display_name || c.name).trim();
  let r: Consulta;
  try {
    r = await consultar(cnpjLimpo(c.document));
  } catch (e) {
    const erro = msgErro(e).slice(0, 500);
    if (!dryRun) await supabase.from("cnpj_situacao_log").insert({ company_id: COMPANY_ID, contact_id: c.id, ok: false, erro });
    return { id: c.id, nome, ok: false, erro };
  }

  const antes = c.situacao_cadastral?.trim() ? c.situacao_cadastral.trim() : null;
  const mudou = chave(antes) !== chave(r.situacao);
  // Aviso: mudança de verdade ou primeira leitura de quem já está fora de "Ativa".
  const avisar = antes ? mudou : chave(r.situacao) !== "ativa";
  // O cnpj.ws não traz o motivo da inaptidão/suspensão; a BrasilAPI traz. Só busca quando há aviso (raro), sem falhar a rotina se não vier.
  if (avisar && !r.motivo && chave(r.situacao) !== "ativa") {
    try { r.motivo = (await brasilApi(cnpjLimpo(c.document))).motivo; } catch { /* fica sem motivo */ }
  }
  const base = { id: c.id, nome, ok: true, fonte: r.fonte, antes, depois: r.situacao, desde: r.data, motivo: r.motivo, mudou, avisar };
  if (dryRun) return base;

  let gravou = true;
  let statusDepois: string | null = c.status_cliente;
  if (mudou) {
    // Troca condicionada ao valor lido: se outra execução já trocou, esta não grava nem avisa em duplicidade.
    let q = supabase.from("contacts").update({ situacao_cadastral: r.situacao }).eq("id", c.id).eq("company_id", COMPANY_ID);
    q = c.situacao_cadastral === null ? q.is("situacao_cadastral", null) : q.eq("situacao_cadastral", c.situacao_cadastral);
    const { data: upd, error } = await q.select("status_cliente");
    if (error) {
      await supabase.from("cnpj_situacao_log").insert({ company_id: COMPANY_ID, contact_id: c.id, ok: false, fonte: r.fonte, erro: `falha ao gravar: ${error.message}`.slice(0, 500) });
      return { ...base, ok: false, erro: error.message };
    }
    gravou = !!upd?.length;
    statusDepois = upd?.[0]?.status_cliente ?? statusDepois;
  }

  await supabase.from("cnpj_situacao_log").insert({
    company_id: COMPANY_ID, contact_id: c.id, ok: true, fonte: r.fonte, situacao: r.situacao, situacao_anterior: antes,
    mudou: mudou && gravou, data_situacao: r.data, motivo: r.motivo,
  });
  if (gravou && avisar) await avisarMudanca(c, antes, r, c.status_cliente, statusDepois);
  return { ...base, mudou: mudou && gravou };
}

async function rotina(payload: any, detalhe: boolean, dryRun: boolean) {
  const lista = await carteira();
  const ids: string[] | null = Array.isArray(payload.contact_ids) ? payload.contact_ids.map(String) : null;
  const limite = Math.min(Math.max(Number(payload.limite) || LOTE, 1), LOTE_MAX);
  let fila: Contato[];
  if (ids) fila = lista.filter((c) => ids.includes(c.id));
  else fila = pendentes(lista, await registrosRecentes());
  const lote = fila.slice(0, limite);

  const feitos: any[] = [];
  for (const c of lote) feitos.push(await conferir(c, dryRun));

  const resumo = {
    ok: true, verificados: feitos.filter((f) => f.ok).length, mudancas: feitos.filter((f) => f.ok && f.mudou).length,
    falhas: feitos.filter((f) => !f.ok).length, restantes: ids ? 0 : Math.max(fila.length - lote.length, 0), dry_run: dryRun,
  };
  return json(detalhe ? { ...resumo, detalhe: feitos } : resumo);
}

/** Um aviso por dia aos admins com o fechamento da semana. */
async function resumoSemana() {
  const lista = await carteira();
  const regs = await registrosRecentes();
  const emDia = new Set(regs.filter((r) => r.ok).map((r) => r.contact_id));
  const mudancas = new Set(regs.filter((r) => r.ok && r.mudou).map((r) => r.contact_id)).size;
  const sem = lista.filter((c) => !emDia.has(c.id));
  const titulo = "CNPJs: conferência semanal da Receita";

  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true })
    .eq("company_id", COMPANY_ID).eq("type", TIPO_AVISO).eq("title", titulo).gte("created_at", `${hojeBR()}T03:00:00Z`);
  if ((count ?? 0) > 0) return json({ ok: true, ja_avisado: true });

  const nomes = sem.slice(0, 8).map((c) => (c.display_name || c.name).trim());
  const corpo = `${lista.length - sem.length} de ${lista.length} clientes conferidos na Receita; ${mudancas} com mudança de situação` +
    (sem.length ? `. Sem resposta da Receita: ${nomes.join(", ")}${sem.length > nomes.length ? ` e mais ${sem.length - nomes.length}` : ""}. A próxima conferência tenta de novo.` : ".");
  const alvos = await admins();
  if (alvos.length) {
    await supabase.from("notifications").insert(alvos.map((user_id) => ({
      user_id, company_id: COMPANY_ID, type: TIPO_AVISO, title: titulo, body: corpo, action_url: "/contatos",
    })));
  }
  return json({ ok: true, conferidos: lista.length - sem.length, total: lista.length, mudancas, sem_consulta: sem.length });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const payload = await req.json().catch(() => ({}));

  // Cron: chave anon (nada de service role no SQL do job). Só contagens na resposta, sem dry_run.
  const cron = bearer === Deno.env.get("SUPABASE_ANON_KEY") || jwtRole(bearer) === "anon";
  let admin = false;
  if (!cron) {
    const { data: userData } = await supabase.auth.getUser(bearer);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Não autenticado" }, 401);
    const { data: perfil } = await supabase.from("profiles").select("role,is_super_admin,company_id").eq("user_id", uid).maybeSingle();
    admin = perfil?.is_super_admin === true || (perfil?.role === "admin" && perfil?.company_id === COMPANY_ID);
    if (!admin) return json({ error: "Só administradores" }, 403);
  }

  try {
    switch (payload.action) {
      case "rotina": return await rotina(payload, admin, admin && payload.dry_run === true);
      case "resumo": return await resumoSemana();
      default: return json({ error: "action inválida (rotina | resumo)" }, 400);
    }
  } catch (e) {
    console.error("cnpj-situacao:", msgErro(e));
    return json({ ok: false, error: "Falha na rotina" }, 500);
  }
});
