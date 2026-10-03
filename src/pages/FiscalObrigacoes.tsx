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
import { ObrigacaoSheet, type AbaObrigacao } from '@/components/fiscal/ObrigacaoSheet';
import { useObrigacoesResumo } from '@/hooks/useObrigacoesResumo';
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

function isLastBusinessDay(due_rule: string): boolean {
  return due_rule === 'last_business_day' || due_rule === 'last_day_of_month';
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
  if (isLastBusinessDay(due_rule)) return `Último dia útil · ${freq}`;
  return `${due_rule} · ${freq}`;
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
  const [esferaFilter, setEsferaFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FiscalObligationCatalog | null>(null);
  const [sheetItem, setSheetItem] = useState<FiscalObligationCatalog | null>(
    null,
  );
  const [sheetAba, setSheetAba] = useState<AbaObrigacao>('datas');
  const resumoQuery = useObrigacoesResumo();
  const resumoPorId = useMemo(
    () => new Map((resumoQuery.data?.obrigacoes ?? []).map((r) => [r.obligation_id, r])),
    [resumoQuery.data],
  );
  const abrirSheet = (ob: FiscalObligationCatalog, aba: AbaObrigacao) => {
    setSheetAba(aba);
    setSheetItem(ob);
  };
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

  const filtered = useMemo(() => {
    const all = obligationsQuery.data ?? [];
    return all.filter((o) => {
      if (esferaFilter !== 'all' && ((o as any).jurisdiction ?? 'federal') !== esferaFilter)
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
  }, [obligationsQuery.data, esferaFilter, regimeFilter, statusFilter, search]);

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

  const catalog = obligationsQuery.data ?? [];

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
            { label: 'Obrigações ativas', value: catalog.filter((o) => o.active).length, hint: 'alimentam as tarefas' },
            {
              label: 'Com data da Receita',
              value: resumoQuery.data ? `${resumoQuery.data.com_data_receita} de ${catalog.filter((o) => o.active).length}` : '—',
              hint: 'o resto segue a regra do sistema',
            },
            {
              label: 'Clientes a conferir',
              value: resumoQuery.data?.clientes_com_divergencia ?? '—',
              hint: 'obrigação marcada diferente da Receita',
              emphasis: (resumoQuery.data?.clientes_com_divergencia ?? 0) > 0 ? 'warm' : 'none',
            },
            { label: 'Sem clientes', value: resumoQuery.data?.sem_clientes ?? '—', hint: 'obrigações que não geram tarefa' },
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

          <Select value={esferaFilter} onValueChange={setEsferaFilter}>
            <SelectTrigger className="h-9 w-[150px] border-line bg-paper text-ui">
              <SelectValue placeholder="Esfera" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as esferas</SelectItem>
              <SelectItem value="federal">Federal</SelectItem>
              <SelectItem value="estadual">Estadual</SelectItem>
              <SelectItem value="municipal">Municipal</SelectItem>
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
                <TableHead>Quem cumpre</TableHead>
                <TableHead>Esfera</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Clientes</TableHead>
                <TableHead className="text-right">Abertas</TableHead>
                <TableHead>Ativa</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {obligationsQuery.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center">
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
                  const r = resumoPorId.get(ob.id);
                  const count = r?.clientes ?? 0;
                  const esfera = ((ob as any).jurisdiction ?? 'federal') as string;
                  return (
                    <TableRow
                      key={ob.id}
                      className="cursor-pointer"
                      onClick={() => abrirSheet(ob, 'datas')}
                    >
                      <TableCell>
                        <div className="font-medium">{ob.name}</div>
                        <div className="text-[11px] text-muted-ink">
                          {obligationDepartmentLabel((ob as any).department, 'short')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <RegimeBadges regimes={ob.applies_to ?? []} category={ob.category} />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] capitalize">{esfera}</Badge>
                      </TableCell>
                      <TableCell>
                        <div>{humanizeDueRule(ob.due_rule, ob.frequency)}</div>
                        {r?.proximo_data && (
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-ink">
                            Próximo: {new Date(`${r.proximo_data}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                            {r.proximo_fonte === 'receita'
                              ? <Badge className="border-brand/30 bg-brand-tint px-1 py-0 text-[9px] text-brand">Receita</Badge>
                              : <Badge variant="outline" className="px-1 py-0 text-[9px]">Regra</Badge>}
                          </div>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => abrirSheet(ob, 'clientes')} className="inline-flex items-center gap-1.5">
                          <Badge variant="secondary" className="cursor-pointer hover:bg-muted">{count} clientes</Badge>
                          {!!r?.divergencias && (
                            <Badge className="border-warn/30 bg-warn/15 px-1.5 py-0 text-[10px] text-warn">{r.divergencias} a conferir</Badge>
                          )}
                          {!r?.divergencias && !!r?.revisar && (
                            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">{r.revisar} a revisar</Badge>
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>{r?.abertas ?? '—'}</span>
                          </TooltipTrigger>
                          <TooltipContent>Tarefas ainda não concluídas, de todos os meses</TooltipContent>
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

        <ObrigacaoSheet
          obligation={sheetItem}
          regraTexto={sheetItem ? humanizeDueRule(sheetItem.due_rule, sheetItem.frequency) : ''}
          aba={sheetAba}
          onAbaChange={setSheetAba}
          onClose={() => setSheetItem(null)}
        />

        {companyId && (
          <ObrigacaoDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            obligation={editing}
            companyId={companyId}
            onSuccess={() => {
              queryClient.invalidateQueries({
                queryKey: ['fiscal-obligations-catalog', companyId],
              });
              queryClient.invalidateQueries({ queryKey: ['obrigacoes-resumo'] });
            }}
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
