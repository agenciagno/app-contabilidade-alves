import { supabase } from '@/integrations/supabase/client';

/**
 * Returns IDs of contacts eligible for the Fiscal module:
 * - belong to the given company
 * - is_active = true
 * - tax_regime is set (not null, not '', not 'Nenhum')
 * - tagged as "cliente" in categorias
 */
export async function fetchValidFiscalContactIds(companyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, tax_regime, categorias')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .not('tax_regime', 'is', null);
  if (error) throw error;
  return (data ?? [])
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
