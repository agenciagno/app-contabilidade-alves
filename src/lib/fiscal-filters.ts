import { supabase } from '@/integrations/supabase/client';
import { fetchAllPages } from '@/lib/fetch-all';

/**
 * Returns IDs of contacts eligible for the Fiscal module:
 * - belong to the given company
 * - is_active = true
 * - tax_regime is set (not null, not '', not 'Nenhum')
 * - tagged as "cliente" in categorias
 */
export async function fetchValidFiscalContactIds(companyId: string): Promise<string[]> {
  // fetchAllPages: este filtro decide quais tarefas o Kanban mostra — se o
  // PostgREST cortar em 1000 contatos, tarefas de clientes válidos somem.
  const data = await fetchAllPages<{ id: string; tax_regime: string | null; categorias: string[] | null }>(() =>
    supabase
      .from('contacts')
      .select('id, tax_regime, categorias')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .not('tax_regime', 'is', null)
      .order('id', { ascending: true })
  );
  return data
    .filter((r: any) => {
      const v = (r.tax_regime ?? '').toString().trim();
      const isCliente = Array.isArray(r.categorias) && r.categorias.includes('cliente');
      return v !== '' && v.toLowerCase() !== 'nenhum' && isCliente;
    })
    .map((r: any) => r.id as string);
}

export function isContactFiscalEligible(c: { is_active?: boolean | null; tax_regime?: string | null; categorias?: string[] | null }): boolean {
  if (c.is_active === false) return false;
  const v = (c.tax_regime ?? '').toString().trim();
  if (v === '' || v.toLowerCase() === 'nenhum') return false;
  return Array.isArray(c.categorias) && c.categorias.includes('cliente');
}

/**
 * Nome de exibição do card de uma tarefa fiscal — nome do cliente quando há um vinculado;
 * sem cliente (tarefa avulsa/interna), usa o próprio título da tarefa.
 */
export function fiscalTaskContactLabel(
  contactId: string | null | undefined,
  contactsMap: Record<string, string>,
  fallbackTitle?: string | null,
): string {
  if (!contactId) return fallbackTitle || 'Tarefa Interna';
  return contactsMap[contactId] || 'Cliente';
}

/** Uma tarefa fiscal é "feita" só por status=concluido — conclusão por anexo foi descontinuada. */
export function isFiscalTaskDone(t: { status: string }): boolean {
  return t.status === 'concluido';
}

/**
 * Competência (mês de apuração) é sempre o mês anterior ao vencimento — ex.: DAS que
 * vence em 20/09 apura agosto. Mesma regra usada por calculate-fiscal-calendar no banco.
 */
export function competenceFromMonthYear(month: number, year: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}
