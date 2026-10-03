import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { CalendarRange, Loader2, MoreHorizontal, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useUserRole } from '@/hooks/useUserRole';
import { useFiscalCalendar, FiscalCalendarEffectiveRow } from '@/hooks/useFiscalCalendar';
import {
  useAgendaReceita,
  useAprovarELancar,
  useAtualizarAgenda,
  useDesfazerAgenda,
  useResumoCalendario,
} from '@/hooks/useAgendaReceita';
import { FiscalObligationOverrideDialog } from '@/components/fiscal/FiscalObligationOverrideDialog';
import { AgendaReceitaPanel } from '@/components/fiscal/AgendaReceitaPanel';
import { ClientesSemTarefasPanel } from '@/components/fiscal/ClientesSemTarefasPanel';
import { CalendarConflictMap } from '@/components/fiscal/CalendarConflictMap';
import { FiscalPeriodStatusControl } from '@/components/fiscal/FiscalPeriodStatusControl';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const YEARS = [2025, 2026, 2027];

const fmt = (s: string | null | undefined) => (s ? format(parseISO(s), 'dd/MM/yyyy') : '—');

/** Calendário fiscal em poucas etapas: a agenda vem da Receita, um clique aprova e lança as tarefas. */
export default function FiscalCalendar() {
  const { isAdmin, isSuperAdmin, isLoading: roleLoading } = useUserRole();
  const qc = useQueryClient();

  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const mesLabel = `${MONTHS[month - 1]}/${year}`;
  const mesPassado = year * 12 + month < now.getFullYear() * 12 + now.getMonth() + 1;

  const agenda = useAgendaReceita(year, month);
  const { data: rows = [], isLoading: rowsLoading } = useFiscalCalendar(year, month);
  const resumo = useResumoCalendario(year, month);
  const aprovarELancar = useAprovarELancar();
  const desfazer = useDesfazerAgenda();
  const buscar = useAtualizarAgenda();

  const [editing, setEditing] = useState<FiscalCalendarEffectiveRow | null>(null);
  const [desfazerOpen, setDesfazerOpen] = useState(false);
  const [rowToDelete, setRowToDelete] = useState<FiscalCalendarEffectiveRow | null>(null);

  const importacao = agenda.importacao;
  const aprovada = !!agenda.aprovacao;
  const podeAprovar = isAdmin || isSuperAdmin;

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (a.effective_due_date ?? a.adjusted_due_date).localeCompare(b.effective_due_date ?? b.adjusted_due_date)),
    [rows],
  );
  const porObrigacao = useMemo(() => new Map((resumo.data?.obrigacoes ?? []).map((o) => [o.obligation_id, o])), [resumo.data]);
  const tarefasALancar = resumo.data ? resumo.data.obrigacoes.reduce((s, o) => s + o.a_lancar, 0) : null;

  if (roleLoading) return null;
  if (!isAdmin && !isSuperAdmin) return <Navigate to="/fiscal/tarefas" replace />;

  const handleDeleteRow = async (id: string) => {
    try {
      const { error } = await (supabase as any).from('fiscal_calendar').delete().eq('id', id);
      if (error) throw error;
      toast.success('Obrigação removida do mês.');
      qc.invalidateQueries({ queryKey: ['fiscal-calendar'] });
      qc.invalidateQueries({ queryKey: ['calendario-resumo'] });
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao excluir');
    } finally {
      setRowToDelete(null);
    }
  };

  const loading = agenda.isLoading || rowsLoading;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-kicker uppercase text-muted-ink-2">~/tarefas · competência</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-display text-ink">Calendário fiscal.</h1>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="h-9 w-[110px] border-line bg-paper text-ui"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="h-9 w-[90px] border-line bg-paper text-ui"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="mt-1 text-body text-muted-ink">Datas da agenda oficial da Receita. Aprove e as tarefas do mês são lançadas.</p>
          </div>
          <FiscalPeriodStatusControl year={year} month={month} />
        </div>

        {importacao && (
          <AgendaReceitaPanel
            importacao={importacao}
            aprovacao={agenda.aprovacao}
            podeAprovar={podeAprovar}
            tarefasALancar={tarefasALancar}
            clientesALancar={resumo.data?.clientes_a_lancar ?? null}
            lancando={aprovarELancar.isPending}
            desfazendo={desfazer.isPending}
            atualizando={buscar.isPending}
            onAprovar={() => aprovarELancar.mutate(importacao.id)}
            onDesfazer={() => setDesfazerOpen(true)}
            onAtualizar={() => buscar.mutate({ year, month })}
          />
        )}

        {importacao && aprovada && <ClientesSemTarefasPanel year={year} month={month} mesLabel={mesLabel} />}

        {!importacao && !loading && (
          <Card className="p-8 text-center">
            <CalendarRange className="mx-auto h-10 w-10 text-muted-ink-2 opacity-60" />
            <p className="mt-3 text-ui-strong text-ink">
              {mesPassado ? `${mesLabel} não tem agenda oficial importada.` : `Ainda não há agenda de ${mesLabel}.`}
            </p>
            <p className="mt-1 text-meta text-muted-ink">
              {mesPassado
                ? 'Este mês foi montado antes da agenda oficial; as datas abaixo são as que valeram.'
                : 'A rotina busca a planilha da Receita sozinha. Se a Receita já publicou, busque agora.'}
            </p>
            {!mesPassado && podeAprovar && (
              <Button className="mt-4" onClick={() => buscar.mutate({ year, month })} disabled={buscar.isPending}>
                {buscar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Buscar na Receita
              </Button>
            )}
          </Card>
        )}

        {sorted.length > 0 && <CalendarConflictMap rows={sorted} year={year} month={month} />}

        {(loading || sorted.length > 0) && (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Obrigação</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Entrega interna</TableHead>
                  <TableHead className="text-right">Tarefas</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 5 }).map((__, j) => (
                          <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  : sorted.map((r) => {
                      const cat = r.fiscal_obligations_catalog;
                      const ajustada = !!r.adjusted_due_date_override || !!r.internal_delivery_date_override;
                      const res = porObrigacao.get(r.obligation_id);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">
                            <div className="flex flex-wrap items-center gap-2">
                              <span>{cat?.name ?? '—'}</span>
                              {r.fonte === 'receita' ? (
                                <Badge className="border-brand/30 bg-brand-tint px-1.5 py-0 text-[10px] text-brand" title="Data da planilha oficial da Receita">Receita</Badge>
                              ) : (
                                <Badge variant="outline" className="px-1.5 py-0 text-[10px]" title="Data calculada pela regra do sistema (estadual, municipal ou sem linha na agenda da Receita)">Regra</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span>{fmt(r.effective_due_date ?? r.adjusted_due_date)}</span>
                              {ajustada && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className="border-warn/30 bg-warn/15 px-1.5 py-0 text-[10px] text-warn">Ajustada</Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Original: {fmt(r.adjusted_due_date)}
                                    {r.override_reason ? ` · ${r.override_reason}` : ''}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{fmt(r.effective_delivery_date ?? r.internal_delivery_date)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {res ? (
                              <>
                                {aprovada ? <span>{res.lancadas} lançadas</span> : <span>{res.a_lancar} a lançar</span>}
                                {aprovada && res.a_lancar > 0 && <span className="block text-[11px] text-warn">{res.a_lancar} a lançar</span>}
                                {res.sem_responsavel > 0 && (
                                  <span className="block text-[11px] text-muted-ink" title="Clientes com a obrigação marcada, mas sem responsável no setor">
                                    {res.sem_responsavel} sem responsável
                                  </span>
                                )}
                              </>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEditing(r)}
                                title={aprovada ? 'Desfaça o lançamento para ajustar datas' : 'Ajustar data'}
                                disabled={aprovada}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" disabled={aprovada} aria-label="Mais ações">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem className="text-destructive" onClick={() => setRowToDelete(r)}>
                                    <Trash2 className="h-4 w-4" /> Tirar do mês
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
              </TableBody>
            </Table>
          </Card>
        )}

        <FiscalObligationOverrideDialog
          row={editing}
          open={!!editing}
          onOpenChange={(o) => { if (!o) setEditing(null); }}
        />

        <AlertDialog open={desfazerOpen} onOpenChange={setDesfazerOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Desfazer o lançamento de {mesLabel}?</AlertDialogTitle>
              <AlertDialogDescription>
                Remove só os cards que ninguém mexeu (a fazer, sem edição). Tarefa em andamento, aguardando cliente ou concluída fica. O mês volta a rascunho para você ajustar e aprovar de novo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => { if (importacao) desfazer.mutate(importacao.id); setDesfazerOpen(false); }}
              >
                Desfazer lançamento
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!rowToDelete} onOpenChange={(o) => { if (!o) setRowToDelete(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Tirar {rowToDelete?.fiscal_obligations_catalog?.name ?? 'a obrigação'} do mês?</AlertDialogTitle>
              <AlertDialogDescription>
                Ela deixa de gerar tarefas em {mesLabel}. Para voltar, use "Atualizar da Receita".
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => rowToDelete && handleDeleteRow(rowToDelete.id)}
              >
                Tirar do mês
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
