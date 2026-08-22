import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DsAlert } from '@/components/ds';
import { useCashFlowForecast } from '@/hooks/useCashFlowForecast';
import { useInadimplentContacts } from '@/hooks/useInadimplentContacts';
import { useActiveCompany } from '@/contexts/CompanyContext';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

type Health = 'saudavel' | 'atencao' | 'critico';

interface FinancialHealthBadgeProps {
  /** annualMetrics.lucroPrevisto — já calculado em Dashboard.tsx, sem query nova. */
  lucroPrevisto: number;
  /** summary.saldoBancario — idem. */
  saldoBancario: number;
}

// Faixa de saúde financeira: combina tendência de caixa (item 1),
// inadimplência de recebíveis e margem (receita - despesa realizada do mês).
export function FinancialHealthBadge({ lucroPrevisto, saldoBancario }: FinancialHealthBadgeProps) {
  const { firstNegativeDate, lowestProjected, currentBalance, isLoading: cashLoading } = useCashFlowForecast(30);
  const { count: inadCount, totalAmount: inadTotal, isLoading: inadLoading } = useInadimplentContacts();
  const { activeCompanyId } = useActiveCompany();

  const monthYear = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  const { data: margin, isLoading: marginLoading } = useQuery({
    queryKey: ['health-margin', activeCompanyId, monthYear],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const today = new Date();
      const start = `${monthYear}-01`;
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
      const { data, error } = await supabase.rpc('get_dashboard_summary', { p_company_id: activeCompanyId!, p_start_date: start, p_end_date: end });
      if (error) throw error;
      const d = data as any;
      return Number(d?.receitas_pagas ?? 0) - Number(d?.despesas_pagas ?? 0);
    },
  });

  const isLoading = cashLoading || inadLoading || marginLoading;

  // Sinais individuais.
  const reasons: string[] = [];
  let redCount = 0;
  let yellowCount = 0;

  // 1) Tendência de caixa
  if (firstNegativeDate) {
    redCount++;
    const [y, m, d] = firstNegativeDate.split('-');
    reasons.push(`Caixa projetado fica negativo em ${d}/${m}/${y}`);
  } else if (lowestProjected < Math.max(currentBalance * 0.1, 0)) {
    yellowCount++;
    reasons.push(`Caixa projetado aperta (mínimo ${formatCurrency(lowestProjected)})`);
  } else {
    reasons.push('Caixa projetado positivo no período');
  }

  // 2) Inadimplência
  if (inadCount >= 5 || (currentBalance > 0 && inadTotal > currentBalance * 0.5)) {
    redCount++;
    reasons.push(`Inadimplência alta: ${inadCount} cliente(s), ${formatCurrency(inadTotal)}`);
  } else if (inadCount > 0) {
    yellowCount++;
    reasons.push(`Inadimplência: ${inadCount} cliente(s), ${formatCurrency(inadTotal)}`);
  } else {
    reasons.push('Sem recebíveis vencidos');
  }

  // 3) Margem do mês (realizada)
  const marginVal = margin ?? 0;
  if (marginVal < 0) {
    redCount++;
    reasons.push(`Margem do mês negativa (${formatCurrency(marginVal)})`);
  } else if (marginVal === 0) {
    yellowCount++;
    reasons.push('Margem do mês no zero a zero');
  } else {
    reasons.push(`Margem do mês positiva (${formatCurrency(marginVal)})`);
  }

  const health: Health = redCount > 0 ? 'critico' : yellowCount > 0 ? 'atencao' : 'saudavel';

  const config = {
    saudavel: { label: 'Saudável', Icon: ShieldCheck, tone: 'ok' as const },
    atencao: { label: 'Atenção', Icon: AlertTriangle, tone: 'warn' as const },
    critico: { label: 'Crítico', Icon: ShieldAlert, tone: 'danger' as const },
  }[health];

  if (isLoading) {
    return (
      <div className="h-[68px] w-full animate-pulse rounded-md border border-line bg-bg-2" />
    );
  }

  const { label, Icon, tone } = config;

  return (
    <DsAlert
      tone={tone}
      icon={<Icon />}
      title={`Saúde financeira: ${label}`}
      description={`Lucro previsto de ${formatCurrency(lucroPrevisto)} no mês · saldo bancário de ${formatCurrency(saldoBancario)} nos bancos visíveis.`}
      action={
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0">Ver detalhes</Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <ul className="space-y-1.5 text-body-sm text-ink">
              {reasons.map((r, i) => <li key={i}>• {r}</li>)}
            </ul>
          </PopoverContent>
        </Popover>
      }
    />
  );
}
