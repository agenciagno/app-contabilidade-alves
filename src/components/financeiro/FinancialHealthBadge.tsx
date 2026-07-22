import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { HeartPulse, ShieldCheck, AlertTriangle, ShieldAlert } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCashFlowForecast } from '@/hooks/useCashFlowForecast';
import { useInadimplentContacts } from '@/hooks/useInadimplentContacts';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

type Health = 'saudavel' | 'atencao' | 'critico';

// Selo único de saúde financeira: combina tendência de caixa (item 1),
// inadimplência de recebíveis e margem (receita - despesa realizada do mês).
export function FinancialHealthBadge() {
  const { firstNegativeDate, lowestProjected, currentBalance, isLoading: cashLoading } = useCashFlowForecast(30);
  const { count: inadCount, totalAmount: inadTotal, isLoading: inadLoading } = useInadimplentContacts();

  const monthYear = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  const { data: margin, isLoading: marginLoading } = useQuery({
    queryKey: ['health-margin', monthYear],
    queryFn: async () => {
      const today = new Date();
      const start = `${monthYear}-01`;
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
      const { data, error } = await supabase.rpc('get_dashboard_summary', { p_start_date: start, p_end_date: end });
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
    saudavel: { label: 'Saudável', Icon: ShieldCheck, cls: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' },
    atencao: { label: 'Atenção', Icon: AlertTriangle, cls: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
    critico: { label: 'Crítico', Icon: ShieldAlert, cls: 'bg-destructive/15 text-destructive border-destructive/30' },
  }[health];

  if (isLoading) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground">
        <HeartPulse className="h-4 w-4 animate-pulse" /> Avaliando saúde…
      </div>
    );
  }

  const { label, Icon, cls } = config;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold cursor-default ${cls}`}>
            <HeartPulse className="h-4 w-4" />
            Saúde financeira: {label}
            <Icon className="h-4 w-4" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <ul className="space-y-1 text-xs">
            {reasons.map((r, i) => <li key={i}>• {r}</li>)}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
