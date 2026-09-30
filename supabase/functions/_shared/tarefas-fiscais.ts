// Conclusão automática da tarefa fiscal "DAS - Simples Nacional - Competência MM/AAAA" (30/09/2026).
// Só conclui quando a Receita (via Serpro) prova que não há mais o que fazer:
//   · "pago":   o DAS do período aparece pago (índice do PGDAS-D ou pagamento DAS em PAGTOWEB);
//   · "zerado": a declaração do período foi transmitida com receita e débito zerados (lida do PDF, leitura confiável).
// Transmissão sozinha NÃO conclui: a tarefa da equipe inclui enviar o DAS ao cliente ("ENVIADO").
// Nunca lança erro: falhar aqui não pode estragar a consulta que já foi feita e cobrada. Interruptor: serpro_config.auto_concluir_tarefas.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const OBRIGACAO = "DAS - Simples Nacional";
const ABERTAS = ["a_fazer", "em_progresso", "aguardando_cliente"];

const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

/** Devolve quantas tarefas foram concluídas. `periodo` = "AAAA-MM" (ou AAAA-MM-DD). */
export async function concluirTarefaDas(
  supabase: SupabaseClient, companyId: string, contactId: string, periodo: string, motivo: "pago" | "zerado", detalhe: string,
): Promise<number> {
  try {
    const ano = Number(periodo.slice(0, 4)), mes = Number(periodo.slice(5, 7));
    if (!ano || !mes) return 0;
    const { data: cfg } = await supabase.from("serpro_config").select("auto_concluir_tarefas").eq("company_id", companyId).maybeSingle();
    if (cfg?.auto_concluir_tarefas === false) return 0;

    const { data: cat } = await supabase.from("fiscal_obligations_catalog").select("id").eq("company_id", companyId).eq("name", OBRIGACAO);
    const obrigacoes = (cat ?? []).map((c: { id: string }) => c.id);
    if (!obrigacoes.length) return 0;

    const { data: tarefas } = await supabase.from("fiscal_tasks").select("id")
      .eq("company_id", companyId).eq("contact_id", contactId).in("obligation_id", obrigacoes)
      .eq("competence_year", ano).eq("competence_month", mes).in("status", ABERTAS);
    if (!tarefas?.length) return 0;

    const hoje = hojeBR();
    const { error } = await supabase.from("fiscal_tasks").update({
      status: "concluido", completion_type: "protocol", protocol_number: motivo === "pago" ? "PAGO" : "ZERADO", delivery_date: hoje,
      completion_notes: `Concluída automaticamente pela integração com a Receita (Serpro) em ${hoje.split("-").reverse().join("/")}: ${detalhe}`,
    }).in("id", tarefas.map((t: { id: string }) => t.id)).in("status", ABERTAS);
    if (error) { console.error("Falha ao concluir tarefa fiscal:", error.message); return 0; }
    return tarefas.length;
  } catch (e) {
    console.error("Falha ao concluir tarefa fiscal:", String((e as Error).message || e));
    return 0;
  }
}
