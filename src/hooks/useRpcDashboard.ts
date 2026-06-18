import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface DashboardSummary {
  receitas_pagas: number;
  a_receber: number;
  despesas_pagas: number;
  a_pagar: number;
  total_transacoes: number;
}

interface AnnualMetrics {
  receitas_ano: number;
  despesas_ano: number;
  receitas_pagas_ano: number;
  despesas_pagas_ano: number;
  lucro_previsto: number;
  lucro_realizado: number;
}

interface MonthlyEvolution {
  mes: string;
  receitas: number;
  despesas: number;
}

interface CategoryBreakdown {
  category_id: string | null;
  category_name: string;
  total: number;
}

export function useDashboardSummary(
  startDate: string,
  endDate: string,
  filters?: {
    bankId?: string;
    categoryId?: string;
    contactId?: string;
    paymentStatus?: string;
  }
) {
  return useQuery({
    queryKey: ["dashboard-summary", startDate, endDate, filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_summary", {
        p_start_date: startDate,
        p_end_date: endDate,
        p_bank_id: filters?.bankId || null,
        p_category_id: filters?.categoryId || null,
        p_contact_id: filters?.contactId || null,
        p_payment_status: filters?.paymentStatus || null,
      });
      if (error) throw error;
      return data as unknown as DashboardSummary;
    },
  });
}

export function useAnnualMetrics(
  year: number,
  filters?: {
    bankId?: string;
    categoryId?: string;
    contactId?: string;
  }
) {
  return useQuery({
    queryKey: ["annual-metrics", year, filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_annual_metrics", {
        p_year: year,
        p_bank_id: filters?.bankId || null,
        p_category_id: filters?.categoryId || null,
        p_contact_id: filters?.contactId || null,
      });
      if (error) throw error;
      return data as unknown as AnnualMetrics;
    },
  });
}

export function useMonthlyEvolution(
  months: number = 6,
  filters?: {
    bankId?: string;
    categoryId?: string;
    contactId?: string;
  }
) {
  return useQuery({
    queryKey: ["monthly-evolution", months, filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_monthly_evolution", {
        p_months: months,
        p_bank_id: filters?.bankId || null,
        p_category_id: filters?.categoryId || null,
        p_contact_id: filters?.contactId || null,
      });
      if (error) throw error;
      return (data || []) as unknown as MonthlyEvolution[];
    },
  });
}

export function useCategoryBreakdown(
  type: "receita" | "despesa",
  startDate: string,
  endDate: string,
  limit: number = 5,
  filters?: {
    bankId?: string;
    contactId?: string;
  }
) {
  return useQuery({
    queryKey: ["category-breakdown", type, startDate, endDate, limit, filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_category_breakdown", {
        p_type: type,
        p_start_date: startDate,
        p_end_date: endDate,
        p_limit: limit,
        p_bank_id: filters?.bankId || null,
        p_contact_id: filters?.contactId || null,
      });
      if (error) throw error;
      return (data || []) as unknown as CategoryBreakdown[];
    },
  });
}
