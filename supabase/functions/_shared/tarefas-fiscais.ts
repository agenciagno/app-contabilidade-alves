// Conclusão automática de tarefas fiscais (30/09/2026 e 01/10/2026).
// Só conclui quando a Receita (via Serpro) prova que não há mais o que fazer:
//   · "DAS - Simples Nacional": DAS do período pago (índice do PGDAS-D ou pagamento DAS em PAGTOWEB) ou declaração transmitida com receita e débito zerados (PDF, leitura confiável);
//   · "DCTF": DCTFWeb do período com recibo (transmitida);
//   · "MIT": apuração do período com situação encerrada e data de encerramento;
//   · "PIS/ COFINS": DARF pago com PIS e COFINS no período de apuração (juntos ou em documentos separados);
//   · "IRPJ/ CSLL": DARF pago com IRPJ e CSLL no período de apuração (mensal ou trimestral: o período do DARF tem de ser o mesmo da tarefa).
// "Sem declaração" / "sem apuração" NÃO conclui: a Receita não prova "sem movimento", isso continua com a equipe.
// Transmissão do DAS sozinha NÃO conclui: a tarefa da equipe inclui enviar o DAS ao cliente ("ENVIADO").
// Nunca lança erro: falhar aqui não pode estragar a consulta que já foi feita e cobrada. Interruptor: serpro_config.auto_concluir_tarefas.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const OBRIGACAO_DAS = "DAS - Simples Nacional";
const ABERTAS = ["a_fazer", "em_progresso", "aguardando_cliente"];

const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

export interface ConclusaoAutomatica {
  /** Nome exato da obrigação no catálogo (fiscal_obligations_catalog.name). */
  obrigacao: string;
  /** "AAAA-MM" (ou AAAA-MM-DD). */
  periodo: string;
  /** Mesmos tipos que a equipe usa: "transmitted" (declaração entregue) ou "protocol" (comprovante/protocolo). */
  tipo: "transmitted" | "protocol";
  protocolo: string | null;
  detalhe: string;
}

/** Devolve quantas tarefas foram concluídas. */
export async function concluirTarefaFiscal(supabase: SupabaseClient, companyId: string, contactId: string, c: ConclusaoAutomatica): Promise<number> {
  try {
    const ano = Number(c.periodo.slice(0, 4)), mes = Number(c.periodo.slice(5, 7));
    if (!ano || !mes) return 0;
    const { data: cfg } = await supabase.from("serpro_config").select("auto_concluir_tarefas").eq("company_id", companyId).maybeSingle();
    if (cfg?.auto_concluir_tarefas === false) return 0;

    const { data: cat } = await supabase.from("fiscal_obligations_catalog").select("id").eq("company_id", companyId).eq("name", c.obrigacao);
    const obrigacoes = (cat ?? []).map((o: { id: string }) => o.id);
    if (!obrigacoes.length) return 0;

    const { data: tarefas } = await supabase.from("fiscal_tasks").select("id")
      .eq("company_id", companyId).eq("contact_id", contactId).in("obligation_id", obrigacoes)
      .eq("competence_year", ano).eq("competence_month", mes).in("status", ABERTAS);
    if (!tarefas?.length) return 0;

    const hoje = hojeBR();
    const { error } = await supabase.from("fiscal_tasks").update({
      status: "concluido", completion_type: c.tipo, protocol_number: c.protocolo, delivery_date: hoje,
      completion_notes: `Concluída automaticamente pela integração com a Receita (Serpro) em ${hoje.split("-").reverse().join("/")}: ${c.detalhe}`,
    }).in("id", tarefas.map((t: { id: string }) => t.id)).in("status", ABERTAS);
    if (error) { console.error("Falha ao concluir tarefa fiscal:", error.message); return 0; }
    return tarefas.length;
  } catch (e) {
    console.error("Falha ao concluir tarefa fiscal:", String((e as Error).message || e));
    return 0;
  }
}

/** Atalho do DAS (usado por serpro-pgdasd e serpro-pagamentos). `periodo` = "AAAA-MM" (ou AAAA-MM-DD). */
export function concluirTarefaDas(
  supabase: SupabaseClient, companyId: string, contactId: string, periodo: string, motivo: "pago" | "zerado", detalhe: string,
): Promise<number> {
  return concluirTarefaFiscal(supabase, companyId, contactId, {
    obrigacao: OBRIGACAO_DAS, periodo, tipo: "protocol", protocolo: motivo === "pago" ? "PAGO" : "ZERADO", detalhe,
  });
}

// ---------------------------------------------------------------- pagamentos (PIS/COFINS e IRPJ/CSLL)
export type Tributo = "PIS" | "COFINS" | "IRPJ" | "CSLL";

// Códigos de receita mais usados (faturamento cumulativo e não cumulativo; Presumido e Real). O texto da receita vale como reserva,
// sem descrições de retenção na fonte (CSRF, IRRF): essas não são o tributo da própria empresa.
const TRIBUTO_POR_CODIGO: Record<string, Tributo> = {
  "8109": "PIS", "6912": "PIS", "2172": "COFINS", "5856": "COFINS",
  "2089": "IRPJ", "5993": "IRPJ", "0220": "IRPJ", "220": "IRPJ", "2372": "CSLL", "2484": "CSLL", "6012": "CSLL",
};
const RETENCAO = /RETID|FONTE|RETEN[CÇ]|CSRF|IRRF/i;

function tributoDaReceita(codigo: unknown, descricao: unknown): Tributo | null {
  const c = String(codigo ?? "").trim();
  if (TRIBUTO_POR_CODIGO[c]) return TRIBUTO_POR_CODIGO[c];
  const d = String(descricao ?? "");
  if (!d || RETENCAO.test(d)) return null;
  if (/\bCOFINS\b/i.test(d)) return "COFINS";
  if (/\bPIS\b/i.test(d)) return "PIS";
  if (/\bIRPJ\b/i.test(d)) return "IRPJ";
  if (/\bCSLL\b/i.test(d)) return "CSLL";
  return null;
}

/** Tributos de um documento de arrecadação pago: olha cada linha do desmembramento; sem desmembramento, a receita do próprio documento. */
export function tributosDoDocumento(doc: { receita_codigo?: unknown; receita_descricao?: unknown; desmembramentos?: unknown }): Tributo[] {
  const achados = new Set<Tributo>();
  const linhas = Array.isArray(doc.desmembramentos) ? doc.desmembramentos as any[] : [];
  for (const l of linhas) {
    const t = tributoDaReceita(l?.receitaPrincipal?.codigo, l?.receitaPrincipal?.descricao);
    if (t) achados.add(t);
  }
  if (!linhas.length) {
    const t = tributoDaReceita(doc.receita_codigo, doc.receita_descricao);
    if (t) achados.add(t);
  }
  return [...achados];
}

/**
 * Conclui "PIS/ COFINS" e "IRPJ/ CSLL" dos meses de apuração informados quando os DARF pagos (já gravados em serpro_pagamentos) cobrem os dois tributos.
 * `meses` = ["AAAA-MM", ...] dos períodos de apuração dos documentos que acabaram de ser gravados.
 */
export async function concluirTarefasPorPagamentos(supabase: SupabaseClient, companyId: string, contactId: string, meses: string[]): Promise<number> {
  let total = 0;
  try {
    for (const mes of [...new Set(meses)]) {
      const [a, m] = mes.split("-").map(Number);
      if (!a || !m) continue;
      const ini = `${mes}-01`;
      const fim = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
      const { data: docs } = await supabase.from("serpro_pagamentos")
        .select("numero_documento,receita_codigo,receita_descricao,desmembramentos")
        .eq("company_id", companyId).eq("contact_id", contactId).eq("tipo_sigla", "DARF").gte("periodo_apuracao", ini).lt("periodo_apuracao", fim);
      if (!docs?.length) continue;
      const porTributo = new Map<Tributo, string>();
      for (const d of docs) for (const t of tributosDoDocumento(d)) if (!porTributo.has(t)) porTributo.set(t, String(d.numero_documento));
      const docsDe = (...ts: Tributo[]) => [...new Set(ts.map((t) => porTributo.get(t)))].join(", ");
      if (porTributo.has("PIS") && porTributo.has("COFINS")) {
        total += await concluirTarefaFiscal(supabase, companyId, contactId, {
          obrigacao: "PIS/ COFINS", periodo: mes, tipo: "protocol", protocolo: "PAGO", detalhe: `DARF nº ${docsDe("PIS", "COFINS")} (PIS e COFINS) com pagamento confirmado pela Receita`,
        });
      }
      if (porTributo.has("IRPJ") && porTributo.has("CSLL")) {
        total += await concluirTarefaFiscal(supabase, companyId, contactId, {
          obrigacao: "IRPJ/ CSLL", periodo: mes, tipo: "protocol", protocolo: "PAGO", detalhe: `DARF nº ${docsDe("IRPJ", "CSLL")} (IRPJ e CSLL) com pagamento confirmado pela Receita`,
        });
      }
    }
  } catch (e) {
    console.error("Falha ao concluir tarefas por pagamento:", String((e as Error).message || e));
  }
  return total;
}
