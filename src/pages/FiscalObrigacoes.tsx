import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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

const REGIME_BADGE: Record<
  string,
  { label: string; className: string; full: string }
> = {
  simples_nacional: {
    label: 'SN',
    full: 'Simples Nacional',
    className:
      'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
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
      'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400',
  },
};

function extractDay(due_rule: string): number | null {
  const m = due_rule?.match(/^day_(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

function humanizeDueRule(due_rule: string, frequency: string): string {
  const day = extractDay(due_rule);
  const freq = frequency === 'monthly' ? 'Mensal' : frequency;
  return day ? `Dia ${day} · ${freq}` : `${due_rule} · ${freq}`;
}

function adjustToLastBusinessDay(date: Date): Date {
  const result = new Date(date);
  const dow = result.getDay();
  if (dow === 6) result.setDate(result.getDate() - 1);
  if (dow === 0) result.setDate(result.getDate() - 2);
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
  if (!day) return [];
  const occ: Occurrence[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const year = now.getFullYear();
    const month = now.getMonth() + i;
    const raw = new Date(year, month, day);
    if (raw.getMonth() !== ((month % 12) + 12) % 12) {
      // dia inválido para o mês (ex: 31 em fev) — pular
      continue;
    }
    const adjusted = adjustToLastBusinessDay(raw);
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

function RegimeBadges({ regimes }: { regimes: string[] }) {
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

  const regimeCountsQuery = useQuery({
    queryKey: ['contacts-regime-count', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('tax_regime')
        .eq('company_id', companyId!)
        .eq('is_active', true)
        .not('tax_regime', 'is', null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((c) => {
        const r = ((c as { tax_regime: string | null }).tax_regime ?? '')
          .toLowerCase()
          .trim();
        if (r && r !== 'nenhum') counts[r] = (counts[r] ?? 0) + 1;
      });
      return counts;
    },
  });

  const regimeCounts = regimeCountsQuery.data ?? {};
  const getCompanyCount = (appliesTo: string[]) =>
    appliesTo.reduce((sum, r) => sum + (regimeCounts[r] ?? 0), 0);

  const filtered = useMemo(() => {
    const all = obligationsQuery.data ?? [];
    return all.filter((o) => {
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
  }, [obligationsQuery.data, regimeFilter, statusFilter, search]);

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

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">
              Gestão de Obrigações Fiscais
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Cadastro master de todas as obrigações. Gerencie regimes,
              vencimentos e ocorrências mensais.
            </p>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Nova Obrigação
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <Select value={regimeFilter} onValueChange={setRegimeFilter}>
            <SelectTrigger className="w-[200px]">
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
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Ativas</SelectItem>
              <SelectItem value="inactive">Inativas</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
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
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center">
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
                  const count = getCompanyCount(ob.applies_to ?? []);
                  const tooltipText = (ob.applies_to ?? [])
                    .map(
                      (r) =>
                        `${REGIME_BADGE[r]?.label ?? r}: ${regimeCounts[r] ?? 0}`,
                    )
                    .join(' · ');
                  return (
                    <TableRow
                      key={ob.id}
                      className="cursor-pointer"
                      onClick={() => setSheetItem(ob)}
                    >
                      <TableCell className="font-medium">{ob.name}</TableCell>
                      <TableCell>
                        <RegimeBadges regimes={ob.applies_to ?? []} />
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
                  <RegimeBadges regimes={sheetItem.applies_to ?? []} />
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
