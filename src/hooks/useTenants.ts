import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';

/**
 * Clientes externos = tenants do produto (`companies`), não a base contábil (`contacts`).
 * Tudo aqui é escopo de super admin (GNO).
 */

export interface TenantRow {
  id: string;
  name: string;
  cnpj: string | null;
  status: string | null;
  is_internal: boolean;
  email: string | null;
  phone: string | null;
  plan_modules: string[] | null;
  plan_name: string | null;
  plan_price: number | null;
  billing_cycle: string | null;
  billing_day: number | null;
  contract_start: string | null;
  /** Teto de usuários do plano. `null` = sem limite. */
  max_users: number | null;
  notes: string | null;
  created_at: string;
}

export interface TenantUserRow {
  user_id: string;
  company_id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  /** Campo que o login realmente checa: 'active' | 'blocked'. */
  status: string | null;
  status_active: boolean | null;
  force_password_change: boolean | null;
  password_changed_at: string | null;
  created_at: string;
  /** O que este usuário enxerga — recorte dentro do que o plano do tenant contratou. */
  allowed_modules: string[] | null;
}

export interface TenantPlanRow {
  id: string;
  name: string;
  price: number;
  billing_cycle: string;
  created_at: string;
}

export interface TenantInvoiceRow {
  id: string;
  company_id: string;
  competencia: string;
  descricao: string | null;
  valor: number;
  vencimento: string;
  pago_em: string | null;
  metodo: string | null;
  status: string;
  origem: string;
  observacao: string | null;
}

/** 'vencida' não é gravado: é fatura em aberto com vencimento no passado. */
export type InvoiceState = 'paga' | 'vencida' | 'aberta' | 'cancelada';

export function invoiceState(inv: Pick<TenantInvoiceRow, 'status' | 'vencimento'>): InvoiceState {
  if (inv.status === 'paga') return 'paga';
  if (inv.status === 'cancelada') return 'cancelada';
  const hoje = new Date().toISOString().slice(0, 10);
  return inv.vencimento < hoje ? 'vencida' : 'aberta';
}

export const TENANTS_KEY = ['clientes-externos', 'companies'] as const;
export const TENANT_USERS_KEY = ['clientes-externos', 'profiles'] as const;
export const TENANT_INVOICES_KEY = ['clientes-externos', 'invoices'] as const;
export const TENANT_PLANS_KEY = ['clientes-externos', 'plans'] as const;

export function useTenants() {
  const { isSuperAdmin } = useUserRole();

  return useQuery({
    queryKey: TENANTS_KEY,
    queryFn: async (): Promise<TenantRow[]> => {
      const { data, error } = await supabase
        .from('companies')
        .select(
          'id, name, cnpj, status, is_internal, email, phone, plan_modules, plan_name, plan_price, billing_cycle, billing_day, contract_start, max_users, notes, created_at',
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TenantRow[];
    },
    enabled: !!isSuperAdmin,
  });
}

export function useTenantUsers() {
  const { isSuperAdmin } = useUserRole();

  return useQuery({
    queryKey: TENANT_USERS_KEY,
    queryFn: async (): Promise<TenantUserRow[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'user_id, company_id, full_name, email, role, status, status_active, force_password_change, password_changed_at, created_at, allowed_modules',
        )
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TenantUserRow[];
    },
    enabled: !!isSuperAdmin,
  });
}

export function useTenantInvoices(companyId?: string) {
  const { isSuperAdmin } = useUserRole();

  return useQuery({
    queryKey: [...TENANT_INVOICES_KEY, companyId ?? 'todas'],
    queryFn: async (): Promise<TenantInvoiceRow[]> => {
      let q = supabase
        .from('tenant_invoices')
        .select(
          'id, company_id, competencia, descricao, valor, vencimento, pago_em, metodo, status, origem, observacao',
        )
        .order('vencimento', { ascending: false });
      if (companyId) q = q.eq('company_id', companyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TenantInvoiceRow[];
    },
    enabled: !!isSuperAdmin,
  });
}

export function useTenantPlans() {
  const { isSuperAdmin } = useUserRole();

  return useQuery({
    queryKey: TENANT_PLANS_KEY,
    queryFn: async (): Promise<TenantPlanRow[]> => {
      const { data, error } = await supabase
        .from('tenant_plans')
        .select('id, name, price, billing_cycle, created_at')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TenantPlanRow[];
    },
    enabled: !!isSuperAdmin,
  });
}

export function useInvalidateTenants() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['clientes-externos'] });
  };
}

/** Só o que a CA vende como produto entra na conta de MRR. */
export function monthlyValue(t: Pick<TenantRow, 'plan_price' | 'billing_cycle'>): number {
  const price = Number(t.plan_price ?? 0);
  if (!price) return 0;
  if (t.billing_cycle === 'trimestral') return price / 3;
  if (t.billing_cycle === 'anual') return price / 12;
  return price;
}
