import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { corsHeaders } from "npm:@supabase/supabase-js@2.117.2/cors";
import * as XLSX from "npm:xlsx@0.18.5";
import { jwtRole } from "../_shared/serpro-core.ts";
import { calcularRegistros, carregarFeriados, entregaInterna, type ObrigacaoCatalogo } from "../_shared/calendario-fiscal.ts";
import { dataOficial, escolherXlsx, itensDeLinhas, MESES_PT, nomesDoMes, type ItemAgenda, type MapeamentoAgenda } from "../_shared/agenda-receita.ts";
import { perfilAtivo } from "../_shared/acesso.ts";

// Agenda oficial da Receita (planilha ADE do mês) como fonte soberana do calendário fiscal. 02/10/2026.
//   rotina      cron (chave anon), de hora em hora: prepara o rascunho do mês do vencimento (e do próximo a partir do dia 25).
//               Baixa a planilha em gov.br; se a Receita ainda não publicou, no dia 1 depois das 20h (e em qualquer hora depois do dia 1)
//               monta o rascunho pelas regras e avisa, para a agenda estar disponível até 23h59 do dia 1. Quando a planilha sai, o rascunho
//               é refeito com as datas oficiais. Mês que já tem aprovação não é mexido.
//   importar    { ano, mes }  administrador: baixa de novo (ex.: ADE retificadora). Bloqueado se o mês já foi aprovado.
// O rascunho é o próprio `fiscal_calendar` do mês (fonte = 'receita' | 'regra'); a equipe edita pela tela do Calendário Fiscal
// (ajuste de data com motivo) e aprova; aprovar lança as tarefas (fluxo existente).
// Estadual e municipal seguem pelas regras do catálogo. Só fonte gratuita direto da Receita.

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = "https://www.gov.br/receitafederal/pt-br/assuntos/agenda-tributaria";
const UA = "Mozilla/5.0 (compatible; ContabilidadeAlves/1.0; +https://contabilidadealves.com.br)";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Resultado = { ok: boolean; motivo?: string; fonte?: "receita" | "regras"; ano: number; mes: number; importacao_id?: string; linhas?: number; oficiais?: number; divergentes?: number };

/** Página do mês + planilha. null = ainda não publicada. */
async function baixarPlanilha(ano: number, mes: number): Promise<{ wb: XLSX.WorkBook; xlsx_url: string; ade_titulo: string; pagina_url: string } | null> {
  for (const nome of nomesDoMes(mes)) {
    const pagina_url = `${BASE}/${ano}/${nome}`;
    const r = await fetch(pagina_url, { headers: { "User-Agent": UA }, redirect: "follow" });
    if (!r.ok) continue;
    const achado = escolherXlsx(await r.text(), pagina_url, ano);
    if (!achado) continue;
    const x = await fetch(achado.url, { headers: { "User-Agent": UA }, redirect: "follow" });
    if (!x.ok) continue;
    const wb = XLSX.read(new Uint8Array(await x.arrayBuffer()), { type: "array" });
    return { wb, xlsx_url: achado.url, ade_titulo: achado.titulo, pagina_url };
  }
  return null;
}

function lerAbas(wb: XLSX.WorkBook): ItemAgenda[] {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const linhas = (aba: string) => {
    const nome = wb.SheetNames.find((n) => norm(n) === aba);
    return nome ? (XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: false, defval: null }) as unknown[][]) : [];
  };
  return [...itensDeLinhas("tributos", linhas("tributos")), ...itensDeLinhas("declaracoes", linhas("declaracoes"))];
}

async function jaAprovado(importacaoId: string): Promise<boolean> {
  const { count } = await supabase.from("agenda_receita_aprovacoes").select("importacao_id", { count: "exact", head: true }).eq("importacao_id", importacaoId);
  return (count ?? 0) > 0;
}

/** Monta e grava o rascunho de (ano, mes). `planilha` null = só pelas regras. */
async function montarRascunho(ano: number, mes: number, planilha: Awaited<ReturnType<typeof baixarPlanilha>>): Promise<Resultado> {
  const itens = planilha ? lerAbas(planilha.wb) : [];
  const nTrib = itens.filter((i) => i.aba === "tributos").length, nDecl = itens.filter((i) => i.aba === "declaracoes").length;
  // Planilha com formato inesperado não vira dado: melhor avisar do que lançar tarefa com data errada.
  if (planilha && (nTrib < 50 || nDecl < 3)) return { ok: false, motivo: `planilha com formato inesperado (${nTrib} tributos, ${nDecl} declarações)`, ano, mes };

  const holidays = await carregarFeriados(supabase, ano, mes);
  const { data: obrs, error: oErr } = await supabase.from("fiscal_obligations_catalog").select("id,name,code,frequency,due_rule,holiday_adjustment,internal_delivery_offset").eq("active", true);
  if (oErr) throw oErr;
  const obrigacoes = (obrs ?? []) as ObrigacaoCatalogo[];
  const { records } = calcularRegistros(obrigacoes, holidays, ano, mes, false);
  const { data: maps } = await supabase.from("agenda_receita_mapeamento").select("obligation_id,aba,campo,padrao,codigos");
  const mapa = new Map(((maps ?? []) as MapeamentoAgenda[]).map((m) => [m.obligation_id, m]));
  const porId = new Map(obrigacoes.map((o) => [o.id, o]));

  const importacao = {
    ano, mes, fonte: planilha ? "receita" : "regras", ade_titulo: planilha?.ade_titulo ?? null, pagina_url: planilha?.pagina_url ?? `${BASE}/${ano}/${MESES_PT[mes - 1]}`,
    xlsx_url: planilha?.xlsx_url ?? null, itens_tributos: nTrib, itens_declaracoes: nDecl, baixado_em: planilha ? new Date().toISOString() : null,
  };
  const { data: imp, error: iErr } = await supabase.from("agenda_receita_importacoes").upsert(importacao, { onConflict: "ano,mes" }).select("id").single();
  if (iErr) throw iErr;

  const resumo: Record<string, unknown>[] = [];
  const gravar = records.map((r) => {
    const obl = porId.get(r.obligation_id)!;
    const m = planilha ? mapa.get(r.obligation_id) : undefined;
    const oficial = m ? dataOficial(m, itens, ano, mes) : null;
    const final = oficial ? { ...r, raw_due_date: oficial.data, adjusted_due_date: oficial.data, internal_delivery_date: entregaInterna(new Date(`${oficial.data}T00:00:00Z`), obl, holidays).toISOString().split("T")[0] } : r;
    resumo.push({
      obligation_id: r.obligation_id, nome: obl.name, regra: r.adjusted_due_date, oficial: oficial?.data ?? null, final: final.adjusted_due_date,
      fonte: oficial ? "receita" : "regra", divergente: !!oficial && oficial.data !== r.adjusted_due_date,
      linhas: oficial?.linhas.slice(0, 3).map((l) => [l.codigo_receita, l.descricao].filter(Boolean).join(" · ").slice(0, 120)) ?? [],
      sem_linha_oficial: !!planilha && !!m && !oficial,
    });
    return { ...final, fonte: oficial ? "receita" : "regra", agenda_importacao_id: imp.id };
  });

  // Overrides (ajustes da equipe) não entram no payload: o upsert não os apaga.
  const { error: uErr } = await supabase.from("fiscal_calendar").upsert(gravar, { onConflict: "obligation_id,year,month" });
  if (uErr) throw uErr;
  const { error: rErr } = await supabase.from("agenda_receita_importacoes").update({ resumo }).eq("id", imp.id);
  if (rErr) throw rErr;

  await supabase.from("agenda_receita_itens").delete().eq("importacao_id", imp.id);
  const linhasItens = itens.map((i) => ({ ...i, importacao_id: imp.id }));
  for (let k = 0; k < linhasItens.length; k += 200) {
    const { error } = await supabase.from("agenda_receita_itens").insert(linhasItens.slice(k, k + 200));
    if (error) throw error;
  }
  return {
    ok: true, fonte: planilha ? "receita" : "regras", ano, mes, importacao_id: imp.id, linhas: gravar.length,
    oficiais: resumo.filter((r) => r.fonte === "receita").length, divergentes: resumo.filter((r) => r.divergente).length,
  };
}

async function avisar(titulo: string, corpo: string, chave: string) {
  try {
    const { data: emp } = await supabase.from("fiscal_obligations_catalog").select("company_id").eq("active", true).not("company_id", "is", null);
    const empresas = [...new Set((emp ?? []).map((e: { company_id: string }) => e.company_id))];
    for (const company_id of empresas) {
      const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true })
        .eq("company_id", company_id).eq("type", "agenda_fiscal").eq("title", titulo);
      if ((count ?? 0) > 0) continue;
      const { data: alvos } = await supabase.from("profiles").select("user_id").eq("company_id", company_id).eq("status_active", true).or("role.in.(admin,super_admin)");
      if (!alvos?.length) continue;
      await supabase.from("notifications").insert(alvos.map((t: { user_id: string }) => ({
        user_id: t.user_id, company_id, type: "agenda_fiscal", title: titulo, body: corpo, action_url: `/fiscal/calendario?agenda=${chave}`,
      })));
    }
  } catch (e) {
    console.error("Falha ao avisar a agenda:", String((e as Error).message || e));
  }
}

/** Importa um mês. `permitirRegras`: se a planilha não existir, monta o rascunho pelas regras. */
async function importarMes(ano: number, mes: number, permitirRegras: boolean): Promise<Resultado> {
  const { data: atual } = await supabase.from("agenda_receita_importacoes").select("id,fonte").eq("ano", ano).eq("mes", mes).maybeSingle();
  if (atual && (await jaAprovado(atual.id))) return { ok: false, motivo: "mês já aprovado, não é refeito", ano, mes };
  const rotulo = `${MESES_PT[mes - 1]}/${ano}`;
  let planilha: Awaited<ReturnType<typeof baixarPlanilha>> = null;
  try { planilha = await baixarPlanilha(ano, mes); } catch (e) { console.error("Falha ao baixar a planilha:", String((e as Error).message || e)); }
  if (!planilha) {
    if (atual || !permitirRegras) return { ok: false, motivo: "planilha da Receita ainda não publicada", ano, mes };
    const r = await montarRascunho(ano, mes, null);
    if (r.ok) await avisar(`Agenda de ${rotulo}: planilha da Receita ainda não saiu`, "O rascunho foi montado pelas regras do sistema. Quando a Receita publicar a planilha, as datas oficiais entram sozinhas, desde que você ainda não tenha aprovado.", `${ano}-${mes}`);
    return r;
  }
  const r = await montarRascunho(ano, mes, planilha);
  if (r.ok) {
    const div = r.divergentes ? ` ${r.divergentes} data(s) diferem das regras do sistema.` : "";
    await avisar(`Agenda de ${rotulo} pronta para revisar`, `${planilha.ade_titulo}. ${r.oficiais} obrigação(ões) com data oficial da Receita.${div} Revise, edite se precisar e aprove para lançar as tarefas.`, `${ano}-${mes}`);
  }
  return r;
}

async function rotina() {
  const brt = new Date(Date.now() - 3 * 3600 * 1000); // Brasília não tem horário de verão
  const dia = brt.getUTCDate(), hora = brt.getUTCHours();
  let ano = brt.getUTCFullYear(), mes = brt.getUTCMonth() + 1;
  const alvos: [number, number, boolean][] = [];
  // Mês corrente: rascunho garantido até as 23h59 do dia 1 (depois das 20h sem planilha, cai nas regras); depois do dia 1, na hora.
  alvos.push([ano, mes, dia > 1 || hora >= 20]);
  // Antecipa o próximo mês a partir do dia 25 (a planilha costuma sair no fim do mês anterior). Nunca monta pelas regras antes de dia 1.
  if (dia >= 25) { const n = mes === 12 ? [ano + 1, 1] : [ano, mes + 1]; alvos.push([n[0], n[1], false]); }
  const out: Resultado[] = [];
  for (const [a, m, regras] of alvos) {
    const { data: atual } = await supabase.from("agenda_receita_importacoes").select("id,fonte").eq("ano", a).eq("mes", m).maybeSingle();
    if (atual?.fonte === "receita") continue; // já tem a planilha oficial
    out.push(await importarMes(a, m, regras));
  }
  return json({ ok: true, hoje: `${brt.getUTCFullYear()}-${String(brt.getUTCMonth() + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`, hora, resultados: out });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const payload = await req.json().catch(() => ({}));
  try {
    // Cron chama com a chave anon (padrão do projeto): só a rotina, que decide pela data e é idempotente.
    if (payload.action === "rotina" && (bearer === Deno.env.get("SUPABASE_ANON_KEY") || jwtRole(bearer) === "anon")) return await rotina();

    const { data: userData } = await supabase.auth.getUser(bearer);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Não autenticado" }, 401);
    const { data: perfil } = await perfilAtivo(bearer, uid, "role,is_super_admin");
    if (!(perfil?.is_super_admin === true || perfil?.role === "admin")) return json({ error: "Só administradores" }, 403);

    if (payload.action === "rotina") return await rotina();
    if (payload.action === "importar") {
      const ano = Number(payload.ano), mes = Number(payload.mes);
      if (!ano || mes < 1 || mes > 12) return json({ error: "ano e mes são obrigatórios" }, 400);
      return json(await importarMes(ano, mes, false));
    }
    return json({ error: "action inválida (rotina | importar)" }, 400);
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});
