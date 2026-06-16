import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useBanks } from '@/hooks/useBanks';
import { useContacts } from '@/hooks/useContacts';
import { CashFlowTab } from '@/components/transactions/CashFlowTab';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

export default function PagarReceber() {
  const { transactions: allTransactions, isLoading, togglePaid } = useTransactions();
  const { categories } = useCategories();
  const { banks } = useBanks();
  const { contacts } = useContacts();

  // Filter out transactions linked to invisible banks
  const invisibleBankIds = new Set(banks.filter(b => b.is_invisible).map(b => b.id));
  const transactions = allTransactions.filter(t => !t.bank_id || !invisibleBankIds.has(t.bank_id));

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
    <div className="space-y-5">
      <div className="flex items-center justify-between py-4 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            Pagar / Receber
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  Mostra apenas transações em aberto. Para ver tudo que compõe o Previsto da DRE (incluindo as já pagas), use a Conciliação na tela DRE.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Fluxo de caixa com projeção de saldo linha a linha</p>
        </div>
      </div>

      <CashFlowTab
        transactions={transactions}
        banks={banks}
        categories={categories}
        contacts={contacts}
        togglePaid={togglePaid}
      />
    </div>
  );
}
