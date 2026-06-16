import { supabase } from '@/integrations/supabase/client';

export interface CnpjLookupResult {
  razao_social: string | null;
  nome_fantasia: string | null;
  address: string | null;
  address_number: string | null;
  complemento: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
  phone: string | null;
  email: string | null;
  cnae_principal: { codigo: string; descricao: string } | null;
  cnaes_secundarios: Array<{ codigo: string; descricao: string }> | null;
  natureza_juridica: string | null;
  situacao_cadastral: string | null;
  data_abertura_receita: string | null;
}

export async function lookupCnpj(cnpj: string): Promise<CnpjLookupResult> {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) throw new Error('CNPJ inválido');

  const { data, error } = await supabase.functions.invoke('cnpj-lookup', {
    body: { cnpj: digits },
  });
  if (error) throw new Error(error.message || 'CNPJ não encontrado');
  if (!data || (data as any).error) throw new Error((data as any)?.error || 'CNPJ não encontrado');
  return data as CnpjLookupResult;
}

/** Returns only the keys whose current value is empty (null/undefined/'' or empty array). */
export function pickEmptyFields<T extends Record<string, any>>(
  candidate: Partial<T>,
  current: Record<string, any>
): Partial<T> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(candidate)) {
    if (v === null || v === undefined) continue;
    const cur = current[k];
    const isEmpty =
      cur === null ||
      cur === undefined ||
      cur === '' ||
      (Array.isArray(cur) && cur.length === 0);
    if (isEmpty) out[k] = v;
  }
  return out as Partial<T>;
}
