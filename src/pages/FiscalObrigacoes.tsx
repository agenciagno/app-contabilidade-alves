import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPages } from '@/lib/fetch-all';
import { useCompany } from '@/hooks/useCompany';
import {
  BookOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ObrigacaoDialog,
  type FiscalObligationCatalog,
} from '@/components/fiscal/ObrigacaoDialog';
import { PageHeader, StatCardRow } from '@/components/ds';
import { obligationDepartmentLabel } from '@/constants/obligationDepartments';

const REGIME_BADGE: Record<
  string,
  { label: string; className: string; full: string }
> = {
  simples_nacional: {
    label: 'SN',
    full: 'Simples Nacional',
    className:
      'bg-ok/15 text-ok border-ok/30 dark:text-ok',
  },
  lucro_presumido: {
    label: 'LP',
    full: 'Lucro Presumido',
    className:
      'bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-400',
  },
  lucro_real: {
    label: 'LR',
    full: 'Lucro Real',
    className:
      'bg-violet-500/15 text-violet-700 border-violet-500/30 dark:text-violet-400',
  },
  mei: {
    label: 'MEI',
    full: 'MEI',
    className:
      'bg-warn/15 text-warn border-warn/30 dark:text-warn',
  },
};

function extractDay(due_rule: string): number | null {
  const m = due_rule?.match(/^day_(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

function extractBusinessDay(due_rule: string): number | null {
  const m = due_rule?.match(/^bday_(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

function ordinal(n: number): string {
  return `${n}º`;
}

function humanizeDueRule(due_rule: string, frequency: string): string {
  const freq = frequency === 'monthly' ? 'Mensal' : frequency;
  const day = extractDay(due_rule);
  if (day) return `Dia ${day} · ${freq}`;
  const bday = extractBusinessDay(due_rule);
  if (bday) return `${ordinal(bday)} dia útil · ${freq}`;
  return `${due_rule} · ${freq}`;
}

function adjustToLastBusinessDay(date: Date): Date {
  const result = new Date(date);
  const dow = result.getDay();
  if (dow === 6) result.setDate(result.getDate() - 1);
  if (dow === 0) result.setDate(result.getDate() - 2);
  return result;
}

function isWeekend(date: Date): boolean {
  const dow = date.getDay();
  return dow === 0 || dow === 6;
}

function nthBusinessDayOfMonth(year: number, month: number, n: number): Date {
  const result = new Date(year, month, 1);
  let count = 0;
  while (count < n) {
    if (!isWeekend(result)) count++;
    if (count < n) result.setDate(result.getDate() + 1);
  }
  return result;
}

function subtractBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let count = 0;
  while (count < days) {
    result.setDate(result.getDate() - 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return result;
}

function formatBR(date: Date): string {
  return date.toLocaleDateString('pt-BR');
}

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

interface Occurrence {
  monthLabel: string;
  rawDate: Date;
  adjusted: Date;
  internal: Date;
  wasAdjusted: boolean;
}

function buildOccurrences(due_rule: string, count = 6): Occurrence[] {
  const day = extractDay(due_rule);
  const bday = extractBusinessDay(due_rule);
  if (!day && !bday) return [];
  const occ: Occurrence[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const year = now.getFullYear();
    const month = now.getMonth() + i;
    const normMonth = ((month % 12) + 12) % 12;
    const normYear = year + Math.floor(month / 12);

    let raw: Date;
    let adjusted: Date;
    if (bday) {
      raw = nthBusinessDayOfMonth(normYear, normMonth, bday);
      adjusted = raw;
    } else {
      raw = new Date(year, month, day!);
      if (raw.getMonth() !== normMonth) {
        // dia inválido para o mês (ex: 31 em fev) — pular
        continue;
      }
      adjusted = adjustToLastBusinessDay(raw);
    }
    const internal = subtractBusinessDays(adjusted, 2);
    occ.push({
      monthLabel: `${MONTH_NAMES[adjusted.getMonth()]} ${adjusted.getFullYear()}`,
      rawDate: raw,
      adjusted,
      internal,
      wasAdjusted: raw.getTime() !== adjusted.getTime(),
    });
  }
  return occ;
}

function RegimeBadges({
  regimes,
  category,
}: {
  regimes: string[];
  category?: string | null;
}) {
  if (category === 'recorrente') {
    return (
      <Badge
        variant="outline"
        className="bg-muted text-muted-foreground border-line"
      >
        Recorrente · todas as empresas
      </Badge>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {regimes.map((r) => {
        const cfg = REGIME_BADGE[r];
        if (!cfg) {
          return (
            <Badge key={r} variant="outline">
              {r}
            </Badge>
          );
        }
        return (
          <Badge key={r} variant="outline" className={cfg.className}>
            {cfg.label}
          </Badge>
        );
      })}
    </div>
  );
}

export default function FiscalObrigacoes() {
  const { company } = useCompany();
  const companyId = company?.id;
  const queryClient = useQueryClient();

  const [regimeFilter, setRegimeFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FiscalObligationCatalog | null>(null);
  const [sheetItem, setSheetItem] = useState<FiscalObligationCatalog | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] =
    useState<FiscalObligationCatalog | null>(null);

  const obligationsQuery = useQuery({
    queryKey: ['fiscal-obligations-catalog', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fiscal_obligations_catalog')
        .select('*')
        .or(`company_id.eq.${companyId},company_id.is.null`)
        .order('name');
      if (error) throw error;
      return data as FiscalObligationCatalog[];
    },
  });

  // Conta clientes por obrigação a partir do vínculo real (client_obligations), não por
  // regime — applies_to só diz quais regimes PODEM ter a obrigação, não quem de fato tem
  // ela marcada no Super Perfil. Contar por regime infla o número (ex: uma obrigação
  // recorrente que aplica a todos os regimes apareceria vinculada a quase todo mundo).
  const obligationCompanyCountsQuery = useQuery({
    queryKey: ['client-obligations-count', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // fetchAllPages: a tabela já passa de 1000 linhas — sem isso o PostgREST
      // corta e a contagem de empresas por obrigação fica menor que a real.
      const data = await fetchAllPages<{ obligation_id: string }>(() =>
        supabase
          .from('client_obligations')
          .select('obligation_id')
          .eq('company_id', companyId!)
          .order('id', { ascending: true })
      );
      const counts: Record<string, number> = {};
      data.forEach((row) => {
        const id = row.obligation_id;
        counts[id] = (counts[id] ?? 0) + 1;
      });
      return counts;
    },
  });

  const obligationCompanyCounts = obligationCompanyCountsQuery.data ?? {};
  const getCompanyCount = (obligationId: string) =>
    obligationCompanyCounts[obligationId] ?? 0;

  const filtered = useMemo(() => {
    const all = obligationsQuery.data ?? [];
    return all.filter((o) => {
      if (categoryFilter !== 'all' && (o.category ?? 'fiscal') !== categoryFilter)
        return false;
      if (regimeFilter !== 'all' && !o.applies_to?.includes(regimeFilter))
        return false;
      if (statusFilter === 'active' && !o.active) return false;
      if (statusFilter === 'inactive' && o.active) return false;
      if (
        search.trim() &&
        !o.name.toLowerCase().includes(search.trim().toLowerCase())
      )
        return false;
      return true;
    });
  }, [obligationsQuery.data, categoryFilter, regimeFilter, statusFilter, search]);

  const handleToggleActive = async (
    ob: FiscalObligationCatalog,
    next: boolean,
  ) => {
    const { error } = await supabase
      .from('fiscal_obligations_catalog')
      .update({ active: next })
      .eq('id', ob.id);
    if (error) {
      toast.error('Erro ao atualizar status.');
      return;
    }
    toast.success(next ? 'Obrigação ativada.' : 'Obrigação desativada.');
    queryClient.invalidateQueries({
      queryKey: ['fiscal-obligations-catalog', companyId],
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from('fiscal_obligations_catalog')
      .delete()
      .eq('id', deleteTarget.id);
    if (error) {
      toast.error('Erro ao excluir obrigação.');
    } else {
      toast.success('Obrigação excluída.');
      queryClient.invalidateQueries({
        queryKey: ['fiscal-obligations-catalog', companyId],
      });
    }
    setDeleteTarget(null);
  };

  const occurrences = useMemo(
    () => (sheetItem ? buildOccurrences(sheetItem.due_rule) : []),
    [sheetItem],
  );

  const catalog = obligationsQuery.data ?? [];
  const countByRegime = (regime: string) =>
    catalog.filter((o) => o.applies_to?.includes(regime)).length;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <PageHeader
          kicker="~/tarefas · catálogo"
          title="Obrigações e declarações."
          subtitle="Catálogo que alimenta a geração automática de tarefas."
          actions={
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Nova obrigação
            </Button>
          }
        />

        <StatCardRow
          items={[
            { label: 'Obrigações ativas', value: catalog.filter((o) => o.active).length, hint: 'no catálogo' },
            { label: 'Simples Nacional', value: countByRegime('simples_nacional'), hint: 'regimes vinculados' },
            { label: 'Lucro Presumido', value: countByRegime('lucro_presumido'), hint: 'regimes vinculados' },
            { label: 'Lucro Real', value: countByRegime('lucro_real'), hint: 'regimes vinculados' },
          ]}
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1 max-w-2xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-ink-2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar obrigação..."
              className="h-10 border-line bg-paper pl-9 text-ui"
            />
          </div>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 w-[150px] border-line bg-paper text-ui">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="fiscal">Departamento Fiscal</SelectItem>
              <SelectItem value="recorrente">Tarefa recorrente</SelectItem>
            </SelectContent>
          </Select>

          <Select value={regimeFilter} onValueChange={setRegimeFilter}>
            <SelectTrigger className="h-9 w-[130px] border-line bg-paper text-ui">
              <SelectValue placeholder="Regime" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os regimes</SelectItem>
              <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
              <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
              <SelectItem value="lucro_real">Lucro Real</SelectItem>
              <SelectItem value="mei">MEI</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[140px] border-line bg-paper text-ui">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Ativas</SelectItem>
              <SelectItem value="inactive">Inativas</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border border-line bg-paper">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Setor</TableHead>
                <TableHead>Regime(s)</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Empresas</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {obligationsQuery.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <BookOpen className="h-10 w-10" />
                      <span>
                        Nenhuma obrigação cadastrada. Clique em "+ Nova
                        Obrigação" para começar.
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((ob) => {
                  const count = getCompanyCount(ob.id);
                  const tooltipText =
                    count > 0
                      ? `${count} empresa${count === 1 ? '' : 's'} com esta obrigação vinculada`
                      : 'Nenhuma empresa vinculada ainda';
                  return (
                    <TableRow
                      key={ob.id}
                      className="cursor-pointer"
                      onClick={() => setSheetItem(ob)}
                    >
                      <TableCell className="font-medium">{ob.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {obligationDepartmentLabel((ob as any).department, 'short')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <RegimeBadges regimes={ob.applies_to ?? []} category={ob.category} />
                      </TableCell>
                      <TableCell>
                        {humanizeDueRule(ob.due_rule, ob.frequency)}
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="secondary">{count} empresas</Badge>
                          </TooltipTrigger>
                          <TooltipContent>{tooltipText || '—'}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={!!ob.active}
                          onCheckedChange={(v) => handleToggleActive(ob, v)}
                        />
                      </TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditing(ob);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(ob)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <Sheet
          open={!!sheetItem}
          onOpenChange={(o) => !o && setSheetItem(null)}
        >
          <SheetContent className="w-full sm:max-w-[520px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{sheetItem?.name}</SheetTitle>
            </SheetHeader>
            {sheetItem && (
              <div className="mt-4 space-y-6">
                <div className="space-y-2">
                  <RegimeBadges regimes={sheetItem.applies_to ?? []} category={sheetItem.category} />
                  <p className="text-sm text-muted-foreground">
                    {humanizeDueRule(sheetItem.due_rule, sheetItem.frequency)}
                  </p>
                  {sheetItem.description && (
                    <p className="text-sm">{sheetItem.description}</p>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2">
                    Próximas ocorrências
                  </h3>
                  {occurrences.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Não foi possível calcular as ocorrências para esta
                      obrigação.
                    </p>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Mês</TableHead>
                            <TableHead>Vencimento Fiscal</TableHead>
                            <TableHead>Entrega Interna</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {occurrences.map((o) => (
                            <TableRow key={o.monthLabel}>
                              <TableCell>{o.monthLabel}</TableCell>
                              <TableCell>
                                {o.wasAdjusted ? (
                                  <span>
                                    <span className="line-through text-muted-foreground mr-1">
                                      {formatBR(o.rawDate)}
                                    </span>
                                    {formatBR(o.adjusted)}
                                  </span>
                                ) : (
                                  formatBR(o.adjusted)
                                )}
                              </TableCell>
                              <TableCell>{formatBR(o.internal)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {companyId && (
          <ObrigacaoDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            obligation={editing}
            companyId={companyId}
            onSuccess={() =>
              queryClient.invalidateQueries({
                queryKey: ['fiscal-obligations-catalog', companyId],
              })
            }
          />
        )}

        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir obrigação?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. A obrigação "
                {deleteTarget?.name}" será removida do catálogo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
