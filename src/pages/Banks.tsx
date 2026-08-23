import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Building2, Landmark } from 'lucide-react';
import { useBanks, Bank } from '@/hooks/useBanks';
import { useBankTransactions } from '@/hooks/useBankTransactions';
import { BankFormDialog } from '@/components/banks/BankFormDialog';
import { BankDetailSheet } from '@/components/banks/BankDetailSheet';
import { UnifiedStatementAccordion } from '@/components/banks/UnifiedStatementAccordion';
import { BankReportModal } from '@/components/banks/BankReportModal';
import { BankBalanceDiagnosticPanel } from '@/components/banks/BankBalanceDiagnosticPanel';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader, StatCard } from '@/components/ds';
import { cn } from '@/lib/utils';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function Banks() {
  const { banks, isLoading, createBank, updateBank, deleteBank } = useBanks();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<Bank | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailBank, setDetailBank] = useState<Bank | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const activeBanks = banks.filter((b) => b.is_active);
  const inactiveBanks = banks.filter((b) => !b.is_active);

  // Exclude invisible banks from total balance calculation
  const visibleBanksList = banks.filter(b => !b.is_invisible).map(b => ({ id: b.id, initial_balance: b.initial_balance, is_active: b.is_active }));
  const { closingBalance: totalBalance } = useBankTransactions(
    { bankId: 'all', startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0], endDate: new Date().toISOString().split('T')[0] },
    visibleBanksList
  );

  const handleSubmit = (data: {
    name: string;
    bank_code: string | null;
    agency: string | null;
    account_number: string | null;
    initial_balance: number;
    color: string;
    is_active: boolean;
    is_invisible: boolean;
  }) => {
    if (editingBank) {
      updateBank.mutate({ id: editingBank.id, ...data }, {
        onSuccess: () => {setDialogOpen(false);setEditingBank(null);}
      });
    } else {
      createBank.mutate(data, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const handleEdit = (bank: Bank, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBank(bank);
    setDialogOpen(true);
  };

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteId(id);
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteBank.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
    }
  };

  const handleBankCardClick = (bank: Bank) => {
    setDetailBank(bank);
    setDetailOpen(true);
  };

  const today = new Date();
  const firstOfYear = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  // Linha compacta (era card grande em grid) — Figma usa 1 lista dentro de 1
  // card na coluna lateral, não cards separados. O badge visível/oculta e o
  // rodapé "atualizado em" saíram da linha (sem slot nesse formato compacto,
  // continuam editáveis no BankFormDialog); editar/excluir seguem existindo,
  // só que aparecem no hover — igual ao comportamento que a badge tinha antes
  // (22/08/2026).
  const BankRow = ({ bank }: { bank: Bank }) => {
    const banksList = [{ id: bank.id, initial_balance: bank.initial_balance, is_active: bank.is_active }];
    const { closingBalance } = useBankTransactions(
      { bankId: bank.id, startDate: firstOfYear, endDate: todayStr },
      banksList
    );

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => handleBankCardClick(bank)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleBankCardClick(bank);
          }
        }}
        className="group relative flex cursor-pointer items-center gap-3 p-4 text-left transition-colors hover:bg-bg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md [&_svg]:h-4 [&_svg]:w-4"
          style={{ backgroundColor: bank.color + '20', color: bank.color }}
        >
          <Landmark strokeWidth={1.75} />
        </div>
        <span className="min-w-0 flex-1 truncate text-body text-ink">{bank.name}</span>
        <span
          className={cn(
            'shrink-0 font-mono text-body tabular-nums transition-opacity group-hover:opacity-0',
            closingBalance >= 0 ? 'text-ink' : 'text-danger',
          )}
        >
          {formatCurrency(closingBalance)}
        </span>
        <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => handleEdit(bank, e)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => handleDeleteClick(bank.id, e)}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>
    );
  };


  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-56 mt-2" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-36" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-[116px]" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-[163px]" />
          <Skeleton className="h-[163px]" />
          <Skeleton className="h-[163px]" />
          <Skeleton className="h-[163px]" />
        </div>
      </div>);

  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/financeiro · contas"
        title="Conta corrente."
        subtitle="Saldos por banco e visibilidade no fluxo de caixa."
        actions={
          <>
            {/* Sem ícone — mesmo padrão já achado no Figma de Pagar/Receber e Boletos (22/08/2026). */}
            <Button variant="outline" onClick={() => setReportOpen(true)}>
              Gerar Relatório
            </Button>
            <Button className="gap-2" onClick={() => {setEditingBank(null);setDialogOpen(true);}}>
              <Plus className="w-4 h-4" />
              Nova conta
            </Button>
          </>
        }
      />

      {/*
        Estrutura mudou de grid de cards + painel sob demanda pra 2 colunas
        fixas sempre visíveis: contas à esquerda (320px), Extrato Unificado
        sempre aberto à direita — o Figma usa uma disposição diferente da
        anterior, não é só repintar (22/08/2026). Empilha em telas estreitas.
      */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Coluna lateral — contas — lg:sticky trava no topo enquanto a
            área principal rola (só no breakpoint lg:, mesmo ajuste de
            Boletos.tsx; se a lista de contas ficar muito longa a coluna pode
            ultrapassar a viewport, mas hoje a lista de bancos ativos raramente
            é longa — ajuste futuro se acontecer na prática) (22/08/2026). */}
        <div className="flex w-full shrink-0 flex-col gap-4 lg:sticky lg:top-8 lg:w-[320px]">
          <StatCard
            label="Saldo total em contas ativas"
            value={formatCurrency(totalBalance)}
            hint={`${activeBanks.length} conta${activeBanks.length === 1 ? '' : 's'} ativa${activeBanks.length === 1 ? '' : 's'}`}
          />

          {activeBanks.length > 0 && (
            <div>
              <h2 className="mb-2 text-ui-strong text-ink">Contas Ativas ({activeBanks.length})</h2>
              <div className="divide-y divide-line-2 overflow-hidden rounded-lg border border-line bg-paper">
                {activeBanks.map((bank) => <BankRow key={bank.id} bank={bank} />)}
              </div>
            </div>
          )}

          {inactiveBanks.length > 0 && (
            <div>
              <h2 className="mb-2 text-ui-strong text-muted-ink">Contas Inativas ({inactiveBanks.length})</h2>
              <div className="divide-y divide-line-2 overflow-hidden rounded-lg border border-line bg-paper">
                {inactiveBanks.map((bank) => <BankRow key={bank.id} bank={bank} />)}
              </div>
            </div>
          )}

          {banks.length === 0 && (
            <div className="rounded-lg border border-line bg-paper py-16 text-center text-muted-ink">
              <Building2 className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p>Nenhuma conta cadastrada</p>
              <p className="mt-1 text-meta">Clique em "Nova conta" para adicionar sua primeira conta</p>
            </div>
          )}
        </div>

        {/* Área principal — Extrato Unificado, sempre aberto */}
        <div className="min-w-0 flex-1">
          {banks.length > 0 && <UnifiedStatementAccordion banks={banks} />}
        </div>
      </div>

      <BankBalanceDiagnosticPanel />

      {/* Dialogs */}
      <BankFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        bank={editingBank}
        onSubmit={handleSubmit}
        isLoading={createBank.isPending || updateBank.isPending} />
      

      <BankDetailSheet
        bank={detailBank}
        open={detailOpen}
        onOpenChange={setDetailOpen} />
      

      <BankReportModal
        open={reportOpen}
        onOpenChange={setReportOpen}
        banks={banks.filter(b => !b.is_invisible)} />
      

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir banco?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O banco será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>);

}