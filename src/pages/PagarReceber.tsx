import { useMemo } from 'react';
import { format } from 'date-fns';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useBanks } from '@/hooks/useBanks';
import { useContacts } from '@/hooks/useContacts';
import { CashFlowTab } from '@/components/transactions/CashFlowTab';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Info } from 'lucide-react';
import { PageHeader, StatCardRow, tabsListClass, tabsTriggerClass } from '@/components/ds';

export default function PagarReceber() {
  const { transactions: allTransactions, isLoading, togglePaid } = useTransactions();
  const { categories } = useCategories();
  const { banks } = useBanks();
  const { contacts } = useContacts();

  // Filter out transactions linked to invisible banks
  const invisibleBankIds = new Set(banks.filter(b => b.is_invisible).map(b => b.id));
  const transactions = allTransactions.filter(t => !t.bank_id || !invisibleBankIds.has(t.bank_id));

  const kpis = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const open = transactions.filter((t) => !t.is_paid && !t.is_transfer);
    const sum = (list: typeof open) => list.reduce((s, t) => s + Number(t.amount ?? 0), 0);
    return {
      vencidos: sum(open.filter((t) => t.due_date && t.due_date < todayStr)),
      aReceber: sum(open.filter((t) => t.type === 'receita')),
      aPagar: sum(open.filter((t) => t.type === 'despesa')),
      venceHoje: sum(open.filter((t) => t.due_date === todayStr)),
      countVencidos: open.filter((t) => t.due_date && t.due_date < todayStr).length,
      countAReceber: open.filter((t) => t.type === 'receita').length,
      countAPagar: open.filter((t) => t.type === 'despesa').length,
      countVenceHoje: open.filter((t) => t.due_date === todayStr).length,
    };
  }, [transactions]);

  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/financeiro · títulos"
        title="Pagar & receber."
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            Títulos em aberto por vencimento.
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 cursor-help text-muted-ink" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  Mostra apenas transações em aberto. Para ver tudo que compõe o Previsto da DRE (incluindo as já pagas), use a Conciliação na tela DRE.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </span>
        }
      />

      <StatCardRow
        items={[
          { label: 'Vencidos', value: brl(kpis.vencidos), hint: `${kpis.countVencidos} título${kpis.countVencidos === 1 ? '' : 's'} em atraso`, emphasis: kpis.countVencidos > 0 ? 'warm' : 'none' },
          { label: 'A receber', value: brl(kpis.aReceber), hint: `${kpis.countAReceber} títulos` },
          { label: 'A pagar', value: brl(kpis.aPagar), hint: `${kpis.countAPagar} títulos` },
          { label: 'Vencem hoje', value: brl(kpis.venceHoje), hint: `${kpis.countVenceHoje} títulos` },
        ]}
      />

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList className={tabsListClass}>
          <TabsTrigger value="all" className={tabsTriggerClass}>Pagar / receber</TabsTrigger>
          <TabsTrigger value="receivables" className={tabsTriggerClass}>A receber</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-0">
          <CashFlowTab
            transactions={transactions}
            banks={banks}
            categories={categories}
            contacts={contacts}
            togglePaid={togglePaid}
          />
        </TabsContent>

        <TabsContent value="receivables" className="mt-0">
          <CashFlowTab
            transactions={transactions}
            banks={banks}
            categories={categories}
            contacts={contacts}
            togglePaid={togglePaid}
            mode="receivables"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
