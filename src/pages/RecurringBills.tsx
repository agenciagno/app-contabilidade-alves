import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, RefreshCw, Calendar, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useRecurringTransactions, RecurringTransaction, RecurringTransactionInsert } from '@/hooks/useRecurringTransactions';
import { useTransactions } from '@/hooks/useTransactions';
import { RecurringFormDialog } from '@/components/recurring/RecurringFormDialog';
import { DAY_LABELS } from '@/components/recurring/WeekDaysSelector';
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
};
const frequencyLabels: Record<string, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  yearly: 'Anual'
};
export default function RecurringBills() {
  const {
    recurringTransactions,
    isLoading,
    monthlyTotals,
    createRecurring,
    updateRecurring,
    deleteRecurring,
    toggleActive
  } = useRecurringTransactions();
  const {
    transactions,
    isLoading: isLoadingTransactions
  } = useTransactions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringTransaction | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Calculate client fees (recurring revenue from CRM - monthly fees per client)
  const clientFees = useMemo(() => {
    // Group future unpaid transactions by contact that have "Honorário" in description
    const feesByContact = new Map<string, {
      contactId: string;
      contactName: string;
      monthlyAmount: number;
      totalPending: number;
      pendingCount: number;
    }>();
    const now = new Date();
    transactions.filter(t => t.type === 'receita' && t.contact_id && t.contact?.name && (t.description.toLowerCase().includes('honorário') || t.description.toLowerCase().includes('honorario') || t.description.toLowerCase().includes('mensalidade'))).forEach(t => {
      const existing = feesByContact.get(t.contact_id!);
      const amount = Number(t.amount);
      if (existing) {
        existing.totalPending += t.is_paid ? 0 : amount;
        existing.pendingCount += t.is_paid ? 0 : 1;
      } else {
        feesByContact.set(t.contact_id!, {
          contactId: t.contact_id!,
          contactName: t.contact!.name,
          monthlyAmount: amount,
          totalPending: t.is_paid ? 0 : amount,
          pendingCount: t.is_paid ? 0 : 1
        });
      }
    });
    return Array.from(feesByContact.values());
  }, [transactions]);

  // Calculate total monthly client fees
  const totalClientFees = clientFees.reduce((sum, fee) => sum + fee.monthlyAmount, 0);

  // Combined monthly revenue = recurring receitas + client fees
  const totalMonthlyRevenue = monthlyTotals.receitas + totalClientFees;
  const handleCreate = () => {
    setEditingRecurring(null);
    setDialogOpen(true);
  };
  const handleEdit = (recurring: RecurringTransaction) => {
    setEditingRecurring(recurring);
    setDialogOpen(true);
  };
  const handleSubmit = (data: RecurringTransactionInsert) => {
    if (editingRecurring) {
      updateRecurring.mutate({
        id: editingRecurring.id,
        ...data
      }, {
        onSuccess: () => setDialogOpen(false)
      });
    } else {
      createRecurring.mutate(data, {
        onSuccess: () => setDialogOpen(false)
      });
    }
  };
  const handleDelete = () => {
    if (deleteId) {
      deleteRecurring.mutate(deleteId, {
        onSuccess: () => setDeleteId(null)
      });
    }
  };
  const activeRecurring = recurringTransactions.filter(r => r.is_active);
  const inactiveRecurring = recurringTransactions.filter(r => !r.is_active);
  const RecurringCard = ({
    recurring
  }: {
    recurring: RecurringTransaction;
  }) => <Card className="bg-card border-border/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${recurring.type === 'receita' ? 'bg-success/20' : 'bg-destructive/20'}`}>
              {recurring.type === 'receita' ? <TrendingUp className="w-5 h-5 text-success" /> : <TrendingDown className="w-5 h-5 text-destructive" />}
            </div>
            <div>
              <h3 className="font-medium text-foreground">{recurring.description}</h3>
              {/* Metadata line - Categoria | Banco */}
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
                {recurring.category && <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full inline-block" style={{
                  backgroundColor: recurring.category.color || '#3B82F6'
                }} />
                    {recurring.category.name}
                  </span>}
                {recurring.bank && <>
                    {recurring.category && <span className="text-muted-foreground/50">|</span>}
                    <span>{recurring.bank.name}</span>
                  </>}
                {recurring.contact && <>
                    {(recurring.category || recurring.bank) && <span className="text-muted-foreground/50">|</span>}
                    <Link to={`/contatos/${recurring.contact_id}`} className="text-primary hover:underline">
                      {recurring.contact.name}
                    </Link>
                  </>}
              </p>
              {/* Badges de frequência */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="outline" className="text-xs">
                  <RefreshCw className="w-3 h-3 mr-1" />
                  {frequencyLabels[recurring.frequency]}
                  {recurring.frequency === 'weekly' && recurring.times_per_week && recurring.times_per_week > 1 && <span className="ml-1">({recurring.times_per_week}x)</span>}
                </Badge>
                {recurring.day_of_month && recurring.frequency === 'monthly' && <Badge variant="outline" className="text-xs">
                    <Calendar className="w-3 h-3 mr-1" />
                    Dia {recurring.day_of_month}
                  </Badge>}
                {recurring.frequency === 'weekly' && recurring.days_of_week && recurring.days_of_week.length > 0 && <Badge variant="outline" className="text-xs">
                    <Calendar className="w-3 h-3 mr-1" />
                    {recurring.days_of_week.map(d => DAY_LABELS[d] || d).join(', ')}
                  </Badge>}
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className={`text-lg font-semibold ${recurring.type === 'receita' ? 'text-success' : 'text-destructive'}`}>
              {recurring.type === 'receita' ? '+' : '-'}
              {formatCurrency(Number(recurring.amount))}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Switch checked={recurring.is_active} onCheckedChange={checked => toggleActive.mutate({
              id: recurring.id,
              is_active: checked
            })} />
              <Button variant="ghost" size="icon" onClick={() => handleEdit(recurring)}>
                <Pencil className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setDeleteId(recurring.id)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>;
  return <div className="space-y-6">
      <div className="flex items-center justify-between py-4 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contas Recorrentes</h1>
          
        </div>
        <Button onClick={handleCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Nova Recorrente
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Receitas Fixas
            </CardTitle>
            <TrendingUp className="w-4 h-4 text-success" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-7 w-24" /> : <div className="text-xl font-bold text-success">
                {formatCurrency(monthlyTotals.receitas)}
              </div>}
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Honorários Clientes
            </CardTitle>
            <Users className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoadingTransactions ? <Skeleton className="h-7 w-24" /> : <div className="text-xl font-bold text-primary">
                {formatCurrency(totalClientFees)}
              </div>}
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Despesas Mensais
            </CardTitle>
            <TrendingDown className="w-4 h-4 text-destructive" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-7 w-24" /> : <div className="text-xl font-bold text-destructive">
                {formatCurrency(monthlyTotals.despesas)}
              </div>}
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Saldo Mensal
            </CardTitle>
            <RefreshCw className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading || isLoadingTransactions ? <Skeleton className="h-7 w-24" /> : <div className={`text-xl font-bold ${totalMonthlyRevenue - monthlyTotals.despesas >= 0 ? 'text-success' : 'text-destructive'}`}>
                {formatCurrency(totalMonthlyRevenue - monthlyTotals.despesas)}
              </div>}
          </CardContent>
        </Card>
      </div>

      {/* Client Fees Section */}
      {clientFees.length > 0 && <section>
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Honorários de Clientes ({clientFees.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {clientFees.map(fee => <Card key={fee.contactId} className="bg-card border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Link to={`/contatos/${fee.contactId}`} className="font-medium text-foreground hover:text-primary hover:underline">
                        {fee.contactName}
                      </Link>
                      {fee.pendingCount > 0 && <p className="text-xs text-muted-foreground mt-1">
                          {fee.pendingCount} parcela{fee.pendingCount > 1 ? 's' : ''} pendente{fee.pendingCount > 1 ? 's' : ''}
                        </p>}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-success">
                        {formatCurrency(fee.monthlyAmount)}
                      </p>
                      <p className="text-xs text-muted-foreground">/mês</p>
                    </div>
                  </div>
                </CardContent>
              </Card>)}
          </div>
        </section>}

      {/* Active Recurring */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">Ativas ({activeRecurring.length})</h2>
        {isLoading ? <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
          </div> : activeRecurring.length > 0 ? <div className="space-y-3">
            {activeRecurring.map(recurring => <RecurringCard key={recurring.id} recurring={recurring} />)}
          </div> : <Card className="bg-card border-border/50">
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhuma conta recorrente ativa
            </CardContent>
          </Card>}
      </section>

      {/* Inactive Recurring */}
      {inactiveRecurring.length > 0 && <section>
          <h2 className="text-lg font-semibold text-muted-foreground mb-4">
            Inativas ({inactiveRecurring.length})
          </h2>
          <div className="space-y-3 opacity-60">
            {inactiveRecurring.map(recurring => <RecurringCard key={recurring.id} recurring={recurring} />)}
          </div>
        </section>}

      {/* Form Dialog */}
      <RecurringFormDialog open={dialogOpen} onOpenChange={setDialogOpen} recurring={editingRecurring} onSubmit={handleSubmit} isLoading={createRecurring.isPending || updateRecurring.isPending} />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Conta Recorrente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta conta recorrente? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>;
}