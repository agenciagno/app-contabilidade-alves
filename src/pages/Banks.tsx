import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Building2, CircleDollarSign, FileBarChart2 } from 'lucide-react';
import { useBanks, Bank } from '@/hooks/useBanks';
import { useBankTransactions } from '@/hooks/useBankTransactions';
import { BankFormDialog } from '@/components/banks/BankFormDialog';
import { BankDetailSheet } from '@/components/banks/BankDetailSheet';
import { UnifiedStatementAccordion } from '@/components/banks/UnifiedStatementAccordion';
import { BankReportModal } from '@/components/banks/BankReportModal';
import { BankBalanceDiagnosticPanel } from '@/components/banks/BankBalanceDiagnosticPanel';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

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

  const BankCard = ({ bank }: {bank: Bank;}) => {
    const banksList = [{ id: bank.id, initial_balance: bank.initial_balance, is_active: bank.is_active }];
    const { closingBalance } = useBankTransactions(
      { bankId: bank.id, startDate: firstOfYear, endDate: todayStr },
      banksList
    );

    return (
      <Card
        className="bg-card border-border/50 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer group"
        onClick={() => handleBankCardClick(bank)}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: bank.color + '20' }}>
                <Building2 className="w-6 h-6" style={{ color: bank.color }} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{bank.name}</h3>
                  {bank.is_invisible && <Badge variant="destructive" className="text-xs">Invisível</Badge>}
                  {!bank.is_active && <Badge variant="secondary" className="text-xs">Inativa</Badge>}
                </div>
                {(bank.bank_code || bank.agency || bank.account_number) &&
                  <p className="text-sm text-muted-foreground">
                    {[bank.bank_code, bank.agency, bank.account_number].filter(Boolean).join(' • ')}
                  </p>
                }
              </div>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="icon" onClick={(e) => handleEdit(bank, e)}>
                <Pencil className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={(e) => handleDeleteClick(bank.id, e)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-border/50">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Saldo atual</span>
              <span className={`text-lg font-bold ${closingBalance >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                {formatCurrency(closingBalance)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Clique para ver o extrato</p>
          </div>
        </CardContent>
      </Card>
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
        <Skeleton className="h-24" />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>);

  }

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between py-4 flex-wrap gap-4">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">Financeiro</p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Conta Corrente.</h1>
          <p className="text-[14px] text-muted-foreground">Organize suas contas corrente</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setReportOpen(true)}>
            <FileBarChart2 className="w-4 h-4" />
            Gerar Relatório
          </Button>
          <Button className="gap-2" onClick={() => {setEditingBank(null);setDialogOpen(true);}}>
            <Plus className="w-4 h-4" />
            Novo Banco
          </Button>
        </div>
      </div>

      {/* Total Balance Card */}
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center">
              <CircleDollarSign className="w-7 h-7 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Saldo total em contas ativas</p>
              <p className={`text-3xl font-bold ${totalBalance >= 0 ? 'text-foreground' : 'text-destructive'}`}>
                {formatCurrency(totalBalance)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Banks */}
      {activeBanks.length > 0 &&
      <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">Contas Ativas ({activeBanks.length})</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeBanks.map((bank) => <BankCard key={bank.id} bank={bank} />)}
          </div>
        </div>
      }

      {/* Inactive Banks */}
      {inactiveBanks.length > 0 &&
      <div>
          <h2 className="text-lg font-semibold text-muted-foreground mb-4">Contas Inativas ({inactiveBanks.length})</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {inactiveBanks.map((bank) => <BankCard key={bank.id} bank={bank} />)}
          </div>
        </div>
      }

      {banks.length === 0 &&
      <Card className="bg-card border-border/50">
          <CardContent className="text-muted-foreground text-center py-16">
            <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma conta cadastrada</p>
            <p className="text-sm mt-1">Clique em "Novo Banco" para adicionar sua primeira conta</p>
          </CardContent>
      </Card>
      }

      <BankBalanceDiagnosticPanel />

      {/* Unified Statement Accordion */}
      {banks.length > 0 && <UnifiedStatementAccordion banks={banks} />}

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