import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { criarSerpro, jwtRole, onlyDigits, sleep } from "../_shared/serpro-core.ts";
import { perfilAtivo } from "../_shared/acesso.ts";

// ---------------------------------------------------------------------------
// Mapa de procurações (Serpro Integra Contador, PROCURACOES.OBTERPROCURACAO41) — F4 Onda 2, passo 1, 30/09/2026.
//
// UMA consulta por cliente devolve TODAS as procurações do cliente para o nosso procurador (CNPJ autor), cada uma com os
// nomes dos sistemas e a data de expiração. O serviço não exige procuração para ser chamado. É "Consultar" (cobrado por
// chamada, inclusive quando volta vazio). Só clientes com status "Ativo".
//
// Ações:
//   mapear        { contact_id }                         mapeia UM cliente (equipe).
//   mapear_lote   { offset, limite (<= 60), confirmar: true, forcar? }
//                 só administrador, em fatias (a tela chama até acabar). Pula quem já foi mapeado nas últimas 12 h (evita cobrar
//                 duas vezes se uma rodada for interrompida), salvo `forcar`.
//   rotina_vencimentos   aviso interno semanal (segunda 08:00, pg_cron) das procurações que vencem em até 60 dias ou já venceram.
//                 NÃO chama o Serpro: só lê o que já foi mapeado. Um aviso por semana (trava de 6 dias), para admins e quem tem o módulo.
//
// Grava em serpro_procuracoes (fonte integra_procuracoes): uma linha por código de procuração, com status e data de expiração.
// Códigos base marcados "ausente" quando não aparecem; "TODOS" (procuração para todos os serviços) vale para todos os códigos;
// nomes que não reconhecemos ficam numa linha "OUTROS" e a resposta bruta numa linha "BRUTO", para auditoria sem nova cobrança.
// ---------------------------------------------------------------------------

const COMPANY_ID = "5cd08fcd-c095-4f08-b3a8-c02b9bf1034e";
const STATUS_MONITORADO = "Ativo";
const RECENTE_HORAS = 12;
const LIMITE_MAX = 60;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const { serpro, AUTOR_NI, CONTRATANTE_NI } = criarSerpro(supabase, COMPANY_ID);
const CNPJS_DA_CA = new Set([CONTRATANTE_NI, AUTOR_NI]);

// Nome do serviço no cadastro de procuração do e-CAC → código (documentação "Serviços x Procurações").
const PADROES: { codigo: string; rotulo: string; re: RegExp }[] = [
  { codigo: "00146", rotulo: "PGDAS-D e DEFIS", re: /pgdas-?d/i },
  { codigo: "00006", rotulo: "Caixa Postal - Mensagens", re: /caixa postal\s*-\s*mensagens/i },
  { codigo: "00050", rotulo: "Domicílio Tributário Eletrônico", re: /domic[ií]lio tribut[aá]rio/i },
  { codigo: "00004", rotulo: "Pagamentos - Comprovante de Arrecadação", re: /pagamentos\s*-\s*comprovante/i },
  { codigo: "00002", rotulo: "Situação Fiscal", re: /situa[cç][aã]o fiscal/i },
  { codigo: "00103", rotulo: "DCTFWeb", re: /dctfweb/i },
  { codigo: "00060", rotulo: "Regime de Apuração de Receitas (Simples)", re: /regime de apura[cç][aã]o/i },
  { codigo: "00051", rotulo: "e-Processo", re: /processos? digitais?|e-?processo/i },
  { codigo: "00076", rotulo: "Parcelamento de Débitos do Simples Nacional", re: /parcelamento de d[eé]bitos do simples nacional/i },
  { codigo: "00188", rotulo: "DAS de parcelamento do Simples", re: /solicitar, acompanhar e emitir das de parcelamento/i },
  { codigo: "00125", rotulo: "Parcelamento Especial do Simples", re: /parcelamento especial simples nacional/i },
  { codigo: "00149", rotulo: "PERT-SN", re: /pert-?sn|regulariza[cç][aã]o tribut[aá]ria\s*-\s*pert-?sn/i },
  { codigo: "00210", rotulo: "RELP-SN", re: /d[ií]vidas do sn pela lc 193/i },
];
// Só estes viram "ausente" quando não aparecem (os demais, como parcelamentos, só existem para quem tem a dívida).
const CODIGOS_BASE = ["00146", "00006", "00004", "00060", "00002", "00103", "00050", "00051"];

const aaaammdd = (s: unknown): string | null => {
  const t = String(s ?? "");
  return /^\d{8}$/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : null;
};
const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

type Linha = { contact_id: string; company_id: string; codigo_procuracao: string; status: string; data_fim: string | null; verificado_em: string; fonte: string; resposta: unknown };

async function mapearCliente(c: { id: string; document: string }, uid: string, origem: "manual" | "cron") {
  const cnpj = onlyDigits(c.document);
  const r = await serpro({
    tipo: "Consultar", idSistema: "PROCURACOES", idServico: "OBTERPROCURACAO41",
    contribuinte: { numero: cnpj, tipo: 2 },
    dados: JSON.stringify({ outorgante: cnpj, tipoOutorgante: "2", outorgado: AUTOR_NI, tipoOutorgado: "2" }),
    uid, contactId: c.id, origem,
    finalidade: "Mapa de procurações eletrônicas do cliente para o procurador (quais serviços da Receita a CA pode acessar e até quando)",
  });
  // 404/204 = nenhuma procuração; 200 traz a lista. Outros status: não grava nada (não marca ausente por erro).
  if (![200, 204, 404].includes(r.status)) return { ok: false as const, status: r.status, erro: r.resposta?.mensagens?.[0]?.texto ?? r.resposta?.error ?? `HTTP ${r.status}` };
  const lista: { dtexpiracao?: string; sistemas?: string[] }[] = r.status === 200 && Array.isArray(r.resposta?.dados) ? r.resposta.dados : [];

  const hoje = hojeBR();
  const porCodigo = new Map<string, { expira: string | null; nomes: Set<string> }>();
  const outros = new Set<string>();
  // Achado da 1ª rodada real (30/09/2026): o Serpro devolve "TODOS" quando o cliente outorgou procuração para TODOS os serviços
  // (não aparece na documentação). Vale para todos os códigos, com a expiração daquela procuração.
  let todos = false;
  let todosExpira: string | null = null;
  const soma = (codigo: string, nome: string, expira: string | null) => {
    const cur = porCodigo.get(codigo) ?? { expira: null, nomes: new Set<string>() };
    cur.nomes.add(nome);
    if (expira && (!cur.expira || expira > cur.expira)) cur.expira = expira; // várias procurações do mesmo código: vale a mais longa
    porCodigo.set(codigo, cur);
  };
  for (const proc of lista) {
    const expira = aaaammdd(proc.dtexpiracao);
    for (const nome of proc.sistemas ?? []) {
      if (/^\s*todos\b/i.test(nome)) {
        todos = true;
        if (expira && (!todosExpira || expira > todosExpira)) todosExpira = expira;
        continue;
      }
      const p = PADROES.find((x) => x.re.test(nome));
      if (!p) { outros.add(nome); continue; }
      soma(p.codigo, nome, expira);
    }
  }
  if (todos) for (const p of PADROES) soma(p.codigo, "TODOS", todosExpira);

  const agora = new Date().toISOString();
  const linhas: Linha[] = [];
  for (const [codigo, v] of porCodigo) {
    linhas.push({
      contact_id: c.id, company_id: COMPANY_ID, codigo_procuracao: codigo,
      status: v.expira && v.expira < hoje ? "expirada" : "ativa",
      data_fim: v.expira, verificado_em: agora, fonte: "integra_procuracoes", resposta: { sistemas: [...v.nomes] },
    });
  }
  for (const codigo of CODIGOS_BASE) {
    if (!porCodigo.has(codigo)) {
      linhas.push({ contact_id: c.id, company_id: COMPANY_ID, codigo_procuracao: codigo, status: "ausente", data_fim: null, verificado_em: agora, fonte: "integra_procuracoes", resposta: null });
    }
  }
  if (outros.size) {
    linhas.push({ contact_id: c.id, company_id: COMPANY_ID, codigo_procuracao: "OUTROS", status: "ativa", data_fim: null, verificado_em: agora, fonte: "integra_procuracoes", resposta: { sistemas: [...outros] } });
  }
  // Resposta bruta guardada (nomes e datas): se o mapeamento de nomes precisar de ajuste, reprocessa sem nova consulta cobrada.
  linhas.push({ contact_id: c.id, company_id: COMPANY_ID, codigo_procuracao: "BRUTO", status: "ativa", data_fim: null, verificado_em: agora, fonte: "integra_procuracoes", resposta: { lista } });

  // Confronto com a sonda da Caixa Postal (E0601): as duas fontes devem concordar.
  const { data: antes } = await supabase.from("serpro_procuracoes").select("status,fonte").eq("contact_id", c.id).eq("codigo_procuracao", "00006").maybeSingle();
  const novo00006 = linhas.find((l) => l.codigo_procuracao === "00006")?.status;
  const diverge = !!(antes && antes.fonte === "sonda_caixa_postal" && novo00006 && antes.status !== novo00006 && !(antes.status === "ativa" && novo00006 === "expirada"));

  const { error } = await supabase.from("serpro_procuracoes").upsert(linhas, { onConflict: "contact_id,codigo_procuracao" });
  if (error) return { ok: false as const, status: 500, erro: `Consulta feita, mas não foi possível gravar: ${error.message}` };
  return { ok: true as const, codigos: [...porCodigo.keys()], diverge };
}

async function mapear(payload: any, uid: string) {
  const { data: c } = await supabase.from("contacts").select("id,document,status_cliente").eq("id", String(payload.contact_id ?? "")).eq("company_id", COMPANY_ID).maybeSingle();
  if (!c) return json({ error: "Cliente não encontrado" }, 404);
  if (c.status_cliente !== STATUS_MONITORADO) return json({ ok: false, foraDoMonitoramento: true, error: `Cliente fora do monitoramento (status: ${c.status_cliente ?? "sem status"}).` });
  if (onlyDigits(c.document).length !== 14) return json({ error: "Cliente sem CNPJ válido" }, 400);
  const r = await mapearCliente(c, uid, "manual");
  return json(r.ok ? { ok: true, codigos: r.codigos } : { ok: false, error: r.erro, status: r.status });
}

async function mapearLote(payload: any, uid: string) {
  if (payload.confirmar !== true) return json({ error: "Confirmação explícita ausente (confirmar: true). Cada cliente mapeado é uma consulta cobrada." }, 400);
  const limite = Math.min(Math.max(Number(payload.limite ?? 30), 1), LIMITE_MAX);
  const offset = Math.max(Number(payload.offset ?? 0), 0);

  const { data: contatos } = await supabase.from("contacts").select("id,document")
    .eq("company_id", COMPANY_ID).eq("is_active", true).eq("status_cliente", STATUS_MONITORADO).order("id").limit(1000);
  const alvo = (contatos ?? []).filter((c: any) => {
    const d = onlyDigits(c.document);
    return d.length === 14 && !CNPJS_DA_CA.has(d);
  });
  const fatia = alvo.slice(offset, offset + limite);

  // Quem já foi mapeado há pouco não é cobrado de novo (retomada segura).
  const recentes = new Set<string>();
  if (!payload.forcar && fatia.length) {
    const desde = new Date(Date.now() - RECENTE_HORAS * 3600_000).toISOString();
    const { data } = await supabase.from("serpro_procuracoes").select("contact_id").eq("fonte", "integra_procuracoes").gte("verificado_em", desde).in("contact_id", fatia.map((c: any) => c.id));
    for (const r of data ?? []) recentes.add(r.contact_id);
  }

  let ok = 0, puladas = 0, erros = 0, divergencias = 0;
  const falhas: { contact_id: string; erro: string }[] = [];
  for (const c of fatia) {
    if (recentes.has(c.id)) { puladas++; continue; }
    const r = await mapearCliente(c, uid, "manual");
    if (r.ok) { ok++; if (r.diverge) divergencias++; } else { erros++; falhas.push({ contact_id: c.id, erro: r.erro }); }
    await sleep(150);
  }
  const proximo = offset + fatia.length;
  return json({ ok: true, total: alvo.length, offset, processados: fatia.length, mapeados: ok, pulados_recentes: puladas, erros, divergencias_00006: divergencias, falhas: falhas.slice(0, 5), proximo_offset: proximo < alvo.length ? proximo : null });
}

const DIAS_AVISO = 60;
const dataBR = (iso: string) => iso.split("-").reverse().join("/");

// Um aviso por rodada (não um por cliente). Vai para admins e para quem tem o módulo dashboard_federal.
async function rotinaVencimentos(forcar: boolean) {
  const hoje = hojeBR();
  const limite = new Date(Date.now() - 3 * 3600_000 + DIAS_AVISO * 86400_000).toISOString().slice(0, 10);
  if (!forcar) {
    const desde = new Date(Date.now() - 6 * 86400_000).toISOString();
    const { data: recente } = await supabase.from("notifications").select("id").eq("company_id", COMPANY_ID).eq("type", "serpro_procuracao").gte("created_at", desde).limit(1);
    if (recente?.length) return json({ ok: true, pulado: "já avisou nos últimos 6 dias" });
  }
  const { data: contatos } = await supabase.from("contacts").select("id,name,display_name").eq("company_id", COMPANY_ID).eq("status_cliente", STATUS_MONITORADO).limit(1000);
  const nomes = new Map((contatos ?? []).map((c: any) => [c.id as string, (c.display_name || c.name) as string]));
  if (!nomes.size) return json({ ok: true, avisos: 0 });

  // Menor data de fim entre os códigos base ainda ativos: é quando o acesso deste cliente começa a falhar.
  const { data: linhas } = await supabase.from("serpro_procuracoes").select("contact_id,data_fim")
    .eq("company_id", COMPANY_ID).eq("fonte", "integra_procuracoes").in("codigo_procuracao", CODIGOS_BASE).eq("status", "ativa")
    .not("data_fim", "is", null).lte("data_fim", limite).in("contact_id", [...nomes.keys()]);
  const fim = new Map<string, string>();
  for (const l of linhas ?? []) { const cur = fim.get(l.contact_id); if (!cur || l.data_fim < cur) fim.set(l.contact_id, l.data_fim); }
  if (!fim.size) return json({ ok: true, avisos: 0 });

  const lista = [...fim.entries()].sort((a, b) => a[1].localeCompare(b[1])); // mais urgentes primeiro
  const vencidas = lista.filter(([, d]) => d < hoje).length;
  const corpo = lista.slice(0, 5).map(([id, d]) => `${nomes.get(id)} (${d < hoje ? "venceu em " : ""}${dataBR(d)})`).join(", ") + (lista.length > 5 ? ` e mais ${lista.length - 5}` : "");
  const { data: alvos } = await supabase.from("profiles").select("user_id")
    .eq("company_id", COMPANY_ID).eq("status_active", true).or("role.in.(admin,super_admin),allowed_modules.cs.{dashboard_federal}");
  if (!alvos?.length) return json({ ok: true, avisos: 0 });
  const { error } = await supabase.from("notifications").insert(alvos.map((t: { user_id: string }) => ({
    user_id: t.user_id, company_id: COMPANY_ID, type: "serpro_procuracao",
    title: lista.length === 1 ? (vencidas ? "1 procuração vencida" : "1 procuração vencendo") : `${lista.length} procurações vencendo${vencidas ? ` ou vencidas (${vencidas})` : ""}`,
    body: corpo, action_url: "/dashboard-federal/procuracoes",
  })));
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, clientes: lista.length, vencidas, destinatarios: alvos.length });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const payload = await req.json().catch(() => ({}));

  // Cron chama com a chave anon (padrão do projeto). Só o aviso de vencimentos aceita isso: não faz nenhuma chamada ao Serpro e tem trava de 6 dias.
  if (payload.action === "rotina_vencimentos" && (bearer === Deno.env.get("SUPABASE_ANON_KEY") || jwtRole(bearer) === "anon")) {
    return await rotinaVencimentos(false);
  }
  const { data: userData } = await supabase.auth.getUser(bearer);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "Não autenticado" }, 401);
  const { data: perfil } = await perfilAtivo(bearer, uid, "role,is_super_admin,company_id");
  const admin = perfil?.is_super_admin === true || (perfil?.role === "admin" && perfil?.company_id === COMPANY_ID);
  const equipe = admin || (perfil?.role === "colaborador" && perfil?.company_id === COMPANY_ID);
  if (!equipe) return json({ error: "Sem permissão" }, 403);

  switch (payload.action) {
    case "mapear": return await mapear(payload, uid);
    case "mapear_lote":
      if (!admin) return json({ error: "Só administradores rodam o mapa completo" }, 403);
      return await mapearLote(payload, uid);
    case "rotina_vencimentos":
      if (!admin) return json({ error: "Só administradores rodam o aviso manualmente" }, 403);
      return await rotinaVencimentos(payload.forcar === true);
    default: return json({ error: "action inválida (mapear | mapear_lote | rotina_vencimentos)" }, 400);
  }
});
