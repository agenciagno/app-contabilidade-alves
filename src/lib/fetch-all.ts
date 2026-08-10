/**
 * Busca TODAS as linhas de uma query paginando em blocos de 1000 — o PostgREST
 * corta qualquer resposta em 1000 linhas em silêncio (sem erro), o que já causou
 * total/saldo errado quando uma tela somava só a primeira página.
 *
 * Uso: passar uma função que MONTA a query (ela é reexecutada por página, porque
 * o builder do supabase-js não é reutilizável). A query deve ter ordenação
 * estável — inclua `.order('id')` como desempate se a ordenação principal
 * puder ter empates.
 *
 * Já existiam 3 cópias locais deste padrão (useBankTransactions ×2, useDREData);
 * esta é a versão única para os demais pontos.
 */
export async function fetchAllPages<T>(
  buildQuery: () => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  let from = 0;
  const all: T[] = [];
  // teto de segurança de 1000 páginas (1M linhas) contra loop infinito
  for (let i = 0; i < 1000; i++) {
    const { data, error } = await (buildQuery() as any).range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data as T[]) ?? [];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}
