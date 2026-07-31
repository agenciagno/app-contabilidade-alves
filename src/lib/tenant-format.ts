/** Formatação compartilhada pelas telas de cliente externo. */

/**
 * A coluna se chama `cnpj` mas guarda CPF também (cliente pessoa física).
 * Formata pelo tamanho e devolve o valor cru quando não reconhece.
 */
export function formatDoc(doc: string | null): string {
  if (!doc) return '—';
  const d = doc.replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return doc;
}

export function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function dateBR(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function competenciaBR(iso: string): string {
  const [y, m] = iso.slice(0, 10).split('-');
  return `${m}/${y}`;
}

export const BILLING_CYCLE_LABEL: Record<string, string> = {
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  anual: 'Anual',
};
