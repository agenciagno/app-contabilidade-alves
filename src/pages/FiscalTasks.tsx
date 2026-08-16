import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, isValid, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, CalendarDays, CalendarIcon, X, ArrowRightLeft, Trash2, Bookmark, BookmarkPlus, Building2, Users, FileText, ChevronDown, SlidersHorizontal, Gauge, LayoutDashboard, ListChecks } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { PageHeader, StatCard } from '@/components/ds';
import { useContacts } from '@/hooks/useContacts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useUserRole } from '@/hooks/useUserRole';
import { useFiscalTasks, FiscalTask } from '@/hooks/useFiscalTasks';
import { KanbanBoard } from '@/components/fiscal/KanbanBoard';
import { TaskListView } from '@/components/fiscal/TaskListView';
import { TaskCalendarView } from '@/components/fiscal/TaskCalendarView';
import { TaskDetailModal } from '@/components/fiscal/TaskDetailModal';
import { TaskCreateModal } from '@/components/fiscal/TaskCreateModal';
import { BulkCompleteDialog } from '@/components/fiscal/BulkCompleteDialog';
import { CheckCheck } from 'lucide-react';
import { BulkReassignModal } from '@/components/fiscal/BulkReassignModal';
import { MyDayView } from '@/components/fiscal/MyDayView';
import { SearchableSelect } from '@/components/fiscal/SearchableSelect';
import { useClosedPeriodsMap, periodKey } from '@/hooks/useFiscalPeriodStatus';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { isContactFiscalEligible } from '@/lib/fiscal-filters';
import { toast } from 'sonner';

type ViewMode = 'myday' | 'kanban' | 'list' | 'calendar';

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'] as const;

// DateInput: accepts DD/MM/YYYY typing + popover calendar
function DateInput({
  value,
  onChange,
  placeholder,
}: {
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
  placeholder: string;
}) {
  const [text, setText] = useState(value ? format(value, 'dd/MM/yyyy') : '');
  useEffect(() => {
    setText(value ? format(value, 'dd/MM/yyyy') : '');
  }, [value]);

  const commit = (raw: string) => {
    if (!raw.trim()) {
      onChange(undefined);
      return;
    }
    const parsed = parse(raw, 'dd/MM/yyyy', new Date());
    if (isValid(parsed)) onChange(parsed);
    else setText(value ? format(value, 'dd/MM/yyyy') : '');
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        placeholder={placeholder}
        className="h-9 w-[120px] text-sm"
      />
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 w-9 p-0">
            <CalendarIcon className="w-3.5 h-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={value} onSelect={onChange} className="p-3 pointer-events-auto" />
        </PopoverContent>
      </Popover>
    </div>
  );
}


export default function FiscalTasks() {
  const { company } = useCompany();
  const companyId = company?.id;
  const { isColaborador, isSuperAdmin, isAdmin } = useUserRole();
  const { contacts } = useContacts();
  const { user } = useAuth();

  // Saved filters (localStorage)
  type SavedFilter = {
    id: string;
    name: string;
    filters: {
      startDate?: string;
      endDate?: string;
      contact: string;
      responsible: string;
      obligation: string;
    };
  };
  const savedKey = user?.id ? `fiscal:saved-filters:${user.id}` : null;
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [savePopoverOpen, setSavePopoverOpen] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');

  useEffect(() => {
    if (!savedKey) return;
    try {
      const raw = localStorage.getItem(savedKey);
      if (raw) setSavedFilters(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [savedKey]);

  const persistSaved = (list: SavedFilter[]) => {
    setSavedFilters(list);
    if (savedKey) localStorage.setItem(savedKey, JSON.stringify(list));
  };

  // Filters
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [filterContact, setFilterContact] = useState('all');
  const [filterResponsible, setFilterResponsible] = useState('all');
  const [filterObligation, setFilterObligation] = useState('all');
  const now = new Date();
  const [competenceMonth, setCompetenceMonth] = useState<string>(String(now.getMonth() + 1));
  const [competenceYear, setCompetenceYear] = useState<string>(String(now.getFullYear()));
  const isAdminUser = isAdmin || isSuperAdmin;
  const [viewMode, setViewMode] = useState<ViewMode>(isAdminUser ? 'kanban' : 'myday');

  // Current user's profile id (responsible_id reference)
  const { data: currentProfile } = useQuery({
    queryKey: ['current-profile-fiscal', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });
  const myProfileId = currentProfile?.id ?? null;

  // Pre-populate from URL (?responsible=… | ?contact_id=… | ?view=kanban)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const r = searchParams.get('responsible');
    const c = searchParams.get('contact_id') ?? searchParams.get('contact');
    const v = searchParams.get('view') as ViewMode | null;
    let mutated = false;
    const next = new URLSearchParams(searchParams);
    if (r) {
      setFilterResponsible(r);
      setViewMode('list');
      next.delete('responsible');
      mutated = true;
    }
    if (c) {
      setFilterContact(c);
      next.delete('contact_id');
      next.delete('contact');
      mutated = true;
    }
    if (v && ['myday', 'kanban', 'list', 'calendar'].includes(v)) {
      setViewMode(v);
      next.delete('view');
      mutated = true;
    }
    if (mutated) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkCompleteOpen, setBulkCompleteOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<FiscalTask | null>(null);
  const [selectedGroupTasks, setSelectedGroupTasks] = useState<FiscalTask[] | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  // Profiles for responsible dropdown — todos os colaboradores ativos da equipe
  const { data: companyProfiles = [] } = useQuery({
    queryKey: ['company-profiles-fiscal', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('company_id', companyId!)
        .eq('status_active', true)
        .order('full_name', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Obligations catalog for dropdown
  const { data: obligations = [] } = useQuery({
    queryKey: ['fiscal-obligations-catalog'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fiscal_obligations_catalog')
        .select('id, name, is_custom')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; is_custom?: boolean }[];
    },
  });

  const filters = useMemo(() => ({
    startDate: startDate ? format(startDate, 'yyyy-MM-dd') : undefined,
    endDate: endDate ? format(endDate, 'yyyy-MM-dd') : undefined,
    contactId: filterContact !== 'all' ? filterContact : undefined,
    responsibleId: filterResponsible !== 'all' ? filterResponsible : undefined,
    titleSearch: filterObligation !== 'all'
      ? (obligations.find((o) => o.id === filterObligation)?.name)
      : undefined,
    competenceMonth: competenceMonth !== 'all' ? Number(competenceMonth) : null,
    competenceYear: competenceYear ? Number(competenceYear) : null,
  }), [startDate, endDate, filterContact, filterResponsible, filterObligation, obligations, competenceMonth, competenceYear]);

  const { tasks, isLoading, createTask, updateTask, deleteTask, deleteTasks } = useFiscalTasks(filters);

  // Closed-period guard
  const { data: closedPeriods } = useClosedPeriodsMap();
  const isTaskLocked = (task: { id?: string } | string): boolean => {
    const id = typeof task === 'string' ? task : task?.id;
    if (!id || !closedPeriods || closedPeriods.size === 0) return false;
    const t = tasks.find((x) => x.id === id) as any;
    if (!t) return false;
    return closedPeriods.has(periodKey(t.competence_year, t.competence_month));
  };
  const guardLocked = (task: { id?: string } | string): boolean => {
    if (isTaskLocked(task)) {
      toast.error('Competência encerrada — tarefa bloqueada para edição.');
      return true;
    }
    return false;
  };
  const isSelectedPeriodClosed =
    competenceMonth !== 'all' &&
    !!competenceYear &&
    !!closedPeriods?.has(`${competenceYear}-${competenceMonth}`);

  // Quick filter (cards de KPI no topo)
  type QuickFilter = 'overdue' | 'today' | 'awaiting' | null;
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(null);

  // KPIs (respeita filtros globais já aplicados em `tasks`, incluindo competência)
  const kpis = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const overdue = tasks.filter(
      (t) => t.status !== 'concluido' && t.due_date && t.due_date < todayStr,
    ).length;
    const dueToday = tasks.filter(
      (t) => t.status !== 'concluido' && t.due_date === todayStr,
    ).length;
    const awaiting = tasks.filter(
      (t) =>
        t.status === 'aguardando_cliente' &&
        t.updated_at &&
        new Date(t.updated_at) < fiveDaysAgo,
    ).length;
    const totalMonth = tasks.length;
    const doneMonth = tasks.filter((t) => t.status === 'concluido').length;
    const pct = totalMonth > 0 ? Math.round((doneMonth / totalMonth) * 100) : 0;
    return { overdue, dueToday, awaiting, totalMonth, doneMonth, pct };
  }, [tasks]);

  // Aplica quick filter em cima dos `tasks` já filtrados
  const displayedTasks = useMemo(() => {
    if (!quickFilter) return tasks;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    if (quickFilter === 'overdue') {
      return tasks.filter(
        (t) => t.status !== 'concluido' && t.due_date && t.due_date < todayStr,
      );
    }
    if (quickFilter === 'today') {
      return tasks.filter((t) => t.due_date === todayStr);
    }
    if (quickFilter === 'awaiting') {
      return tasks.filter((t) => t.status === 'aguardando_cliente');
    }
    return tasks;
  }, [tasks, quickFilter]);


  // Only contacts eligible for the Fiscal module (active + tax regime set)
  const fiscalContacts = useMemo(
    () => (contacts ?? []).filter((c: any) => isContactFiscalEligible(c)),
    [contacts],
  );

  const contactsMap = useMemo(() => {
    const map: Record<string, string> = {};
    fiscalContacts.forEach((c: any) => { map[c.id] = c.name; });
    return map;
  }, [fiscalContacts]);

  const profilesMap = useMemo(() => {
    const map: Record<string, { name: string; initials: string }> = {};
    companyProfiles.forEach(p => {
      const name = p.full_name || p.email?.split('@')[0] || '?';
      map[p.id] = { name, initials: name.substring(0, 2).toUpperCase() };
    });
    return map;
  }, [companyProfiles]);

  const handleStatusChange = (taskId: string, newStatus: string) => {
    if (guardLocked(taskId)) return;
    updateTask.mutate({ id: taskId, status: newStatus as FiscalTask['status'] });
  };

  const handleUploadAttachment = async (task: FiscalTask, file: File) => {
    if (!companyId) return;
    if (guardLocked(task.id)) return;
    try {
      const ext = file.name.split('.').pop();
      const path = `fiscal/${companyId}/${task.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('transaction-attachments')
        .upload(path, file);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage
        .from('transaction-attachments')
        .getPublicUrl(path);
      await updateTask.mutateAsync({
        id: task.id,
        attachment_url: urlData.publicUrl,
        status: 'concluido' as FiscalTask['status'],
      });
    } catch (e: any) {
      // updateTask shows its own error toast; storage errors fall here
      console.error('Upload error', e);
    }
  };


  const handleCompleteTask = (task: FiscalTask, data: { protocolNumber: string | null; completionNotes: string | null }) => {
    if (guardLocked(task.id)) return;
    const completion_type = data.protocolNumber ? 'protocol' : 'transmitted';
    updateTask.mutate({
      id: task.id,
      status: 'concluido',
      completion_type,
      protocol_number: data.protocolNumber,
      completion_notes: data.completionNotes,
      completed_at: new Date().toISOString(),
    } as any);
  };

  const handleUncompleteTask = (task: FiscalTask) => {
    if (guardLocked(task.id)) return;
    updateTask.mutate({
      id: task.id,
      status: 'a_fazer',
      attachment_url: null,
      completion_type: null,
      protocol_number: null,
      completion_notes: null,
      completed_at: null,
    } as any);
    toast.success('Tarefa desmarcada.');
  };

  const handleTaskClick = (task: FiscalTask) => {
    setSelectedTask(task);
    setSelectedGroupTasks(null);
    setDetailOpen(true);
  };

  const handleGroupClick = (groupTasks: FiscalTask[]) => {
    if (!groupTasks.length) return;
    setSelectedTask(groupTasks[0]);
    setSelectedGroupTasks(groupTasks);
    setDetailOpen(true);
  };

  const handleCreate = (data: { contact_id: string | null; responsible_id: string | null; titles: string[]; description: string | null; due_date: string }) => {
    if (!companyId) return;
    // Competência é derivada do vencimento — sem isso a tarefa fica invisível no filtro
    // padrão de "Competência" (mês atual), que exclui linhas com competence_month nulo.
    const dueDateObj = new Date(`${data.due_date}T00:00:00`);
    // Checklist com mais de 1 item (sem cliente) ganha group_key compartilhado, senão
    // cada tarefa avulsa vira seu próprio card isolado no Kanban.
    const groupKey = data.titles.length > 1 ? crypto.randomUUID() : null;
    data.titles.forEach((title) => {
      createTask.mutate({
        company_id: companyId,
        contact_id: data.contact_id,
        responsible_id: data.responsible_id,
        title,
        description: data.description,
        status: 'a_fazer',
        due_date: data.due_date,
        attachment_url: null,
        notes: null,
        competence_month: dueDateObj.getMonth() + 1,
        competence_year: dueDateObj.getFullYear(),
        group_key: groupKey,
      } as any);
    });
  };

  const canDelete = isSuperAdmin || isAdmin;

  const profileOptions = useMemo(
    () => companyProfiles.map((p) => ({ id: p.id, name: p.full_name || p.email || '—' })),
    [companyProfiles],
  );

  const toggleSelected = (id: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = (ids: string[], allSelected: boolean) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };
  const rangeSelect = (ids: string[]) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  };
  const clearSelection = () => setSelectedTaskIds(new Set());

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedTaskIds);
    if (ids.length === 0) return;
    const lockedIds = ids.filter((id) => isTaskLocked(id));
    if (lockedIds.length > 0) {
      toast.error(`${lockedIds.length} tarefa(s) pertencem a competência encerrada e não podem ser excluídas.`);
      return;
    }
    const { error } = await supabase.from('fiscal_tasks').delete().in('id', ids);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`✅ ${ids.length} tarefa${ids.length === 1 ? '' : 's'} excluída${ids.length === 1 ? '' : 's'} com sucesso`);
    clearSelection();
    queryClient.invalidateQueries({ queryKey: ['fiscal-tasks'] });
  };

  const handleInlineReassign = async (taskId: string, newId: string) => {
    if (guardLocked(taskId)) return;
    try {
      await updateTask.mutateAsync({ id: taskId, responsible_id: newId });
      const name = profileOptions.find((p) => p.id === newId)?.name ?? 'colaborador';
      toast.success(`Responsável alterado para ${name}`);
      queryClient.invalidateQueries({ queryKey: ['fiscal-tasks'] });
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao alterar responsável');
    }
  };

  const handleBulkReassign = async (newId: string, expandToMonth: boolean) => {
    if (!companyId) return;
    let ids = Array.from(selectedTaskIds);
    if (expandToMonth) {
      const selectedTasks = tasks.filter((t) => selectedTaskIds.has(t.id));
      const contactIds = Array.from(new Set(selectedTasks.map((t) => t.contact_id).filter(Boolean)));
      const now = new Date();
      if (contactIds.length > 0) {
        const { data } = await (supabase as any)
          .from('fiscal_tasks')
          .select('id')
          .eq('company_id', companyId)
          .eq('competence_year', now.getFullYear())
          .eq('competence_month', now.getMonth() + 1)
          .in('contact_id', contactIds)
          .in('status', ['pendente', 'em_andamento', 'a_fazer', 'em_progresso', 'aguardando_cliente']);
        ids = Array.from(new Set([...(ids), ...((data ?? []) as any[]).map((r) => r.id)]));
      }
    }
    if (ids.length === 0) {
      toast.error('Nenhuma tarefa para transferir.');
      return;
    }
    try {
      await Promise.all(
        ids.map((id) => updateTask.mutateAsync({ id, responsible_id: newId })),
      );
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao transferir tarefas');
      return;
    }
    const name = profileOptions.find((p) => p.id === newId)?.name ?? 'colaborador';
    toast.success(`✅ ${ids.length} tarefa${ids.length === 1 ? '' : 's'} transferida${ids.length === 1 ? '' : 's'} para ${name}`);
    queryClient.invalidateQueries({ queryKey: ['fiscal-tasks'] });
    clearSelection();
  };


  return (
    <div className="space-y-6">
      <PageHeader
        kicker={
          competenceMonth !== 'all'
            ? `~/tarefas · competência ${MESES[Number(competenceMonth) - 1] ?? ''} ${competenceYear}`
            : '~/tarefas'
        }
        title="Tarefas."
        subtitle={`${kpis.totalMonth} tarefas no board · ${kpis.overdue} atrasadas de competências anteriores.`}
        actions={
          <>
            <Button variant="outline" onClick={() => setBulkCompleteOpen(true)}>
              <CheckCheck className="h-4 w-4" />
              Concluir em lote
            </Button>
            {canDelete && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Nova tarefa
              </Button>
            )}
          </>
        }
      />

      {isSelectedPeriodClosed && (
        <div className="flex items-center gap-2 rounded-md border border-muted-foreground/30 bg-muted px-3 py-2 text-sm text-muted-foreground">
          <span className="font-medium">Competência encerrada.</span>
          As tarefas deste período estão bloqueadas para edição.
        </div>
      )}


      {/* KPI Cards */}
      {/*
        Indicadores numerados (decisão 06): o índice ordinal dá um ponto de
        entrada óbvio, e só o mais urgente recebe emphasis="warm" — antes eram
        quatro cards igualmente coloridos, sem hierarquia. Continuam sendo
        filtros rápidos; o clique não mudou.
      */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {([
          {
            key: 'overdue' as const,
            label: 'Atrasadas',
            value: kpis.overdue,
            hint: 'fora da competência atual',
            onClick: () => setQuickFilter((q) => (q === 'overdue' ? null : 'overdue')),
          },
          {
            key: 'today' as const,
            label: 'Vencem hoje',
            value: kpis.dueToday,
            hint: kpis.dueToday === 0 ? 'nada crítico para hoje' : 'vencem na data de hoje',
            onClick: () => setQuickFilter((q) => (q === 'today' ? null : 'today')),
          },
          {
            key: 'awaiting' as const,
            label: 'Aguardando cliente',
            value: kpis.awaiting,
            hint: 'há mais de 5 dias',
            onClick: () => setQuickFilter((q) => (q === 'awaiting' ? null : 'awaiting')),
          },
          {
            key: null,
            label: 'Progresso do mês',
            value: `${kpis.pct}%`,
            hint: `${kpis.doneMonth} de ${kpis.totalMonth} concluídas`,
            onClick: () => setQuickFilter(null),
          },
        ]).map((kpi, i) => (
          <button
            key={kpi.label}
            type="button"
            onClick={kpi.onClick}
            className={cn(
              'rounded-lg text-left transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              quickFilter === kpi.key && 'ring-2 ring-brand',
            )}
          >
            <StatCard
              index={String(i + 1).padStart(2, '0')}
              label={kpi.label}
              value={kpi.value}
              hint={kpi.hint}
              /* só o de maior urgência ganha destaque, e só quando há o que destacar */
              emphasis={kpi.key === 'overdue' && kpis.overdue > 0 ? 'warm' : 'none'}
              className="h-full"
            />
          </button>
        ))}
      </div>

      {/* Filters Bar — 4 pills do Figma (filtros/f/*) + "Mais filtros" guardando
          intervalo de datas e filtros salvos, que não têm slot no protótipo mas
          continuam funcionais (nada de real foi descartado). */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Competência — pill único (Figma: ícone calendário + "Julho 2026" + chevron) */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-9 shrink-0 items-center gap-2 rounded-sm border border-line bg-paper px-3 text-ui text-ink transition-colors hover:bg-bg-2"
            >
              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-ink" strokeWidth={1.75} />
              <span className="truncate">
                {competenceMonth !== 'all' ? `${MESES[Number(competenceMonth) - 1]} ${competenceYear}` : 'Todas as competências'}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-ink-2" strokeWidth={1.75} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 space-y-2 p-3">
            <Label className="text-xs">Competência</Label>
            <div className="flex gap-2">
              <Select value={competenceMonth} onValueChange={setCompetenceMonth}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {MESES.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={competenceYear} onValueChange={setCompetenceYear}>
                <SelectTrigger className="h-9 w-[90px] text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026, 2027].map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </PopoverContent>
        </Popover>

        {/* Client Filter */}
        <SearchableSelect
          icon={Building2}
          value={filterContact}
          onChange={setFilterContact}
          options={fiscalContacts.map((c: any) => ({ value: c.id, label: c.name }))}
          placeholder="Todos os clientes"
          allLabel="Todos os clientes"
          width="w-[200px]"
        />

        {/* Responsible Filter (hidden for colaborador) */}
        {!isColaborador && (
          <SearchableSelect
            icon={Users}
            value={filterResponsible}
            onChange={setFilterResponsible}
            options={companyProfiles.map((p) => ({ value: p.id, label: p.full_name || p.email || '—' }))}
            placeholder="Todos os colaboradores"
            allLabel="Todos os colaboradores"
            width="w-[200px]"
          />
        )}

        {/* Obligation Filter */}
        <SearchableSelect
          icon={FileText}
          value={filterObligation}
          onChange={setFilterObligation}
          options={obligations.map((o) => ({ value: o.id, label: o.is_custom ? `★ ${o.name}` : o.name }))}
          placeholder="Todas as obrigações"
          allLabel="Todas as obrigações"
          width="w-[220px]"
        />

        {/* Mais filtros — intervalo de datas + filtros salvos */}
        <Popover open={savePopoverOpen} onOpenChange={setSavePopoverOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-sm border border-line bg-paper px-3 text-ui text-muted-ink transition-colors hover:bg-bg-2"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
              Mais filtros
              {(startDate || endDate) && <span className="h-1.5 w-1.5 rounded-full bg-action" />}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-3 p-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Intervalo de datas</Label>
              <div className="flex items-center gap-2">
                <DateInput value={startDate} onChange={setStartDate} placeholder="De" />
                <DateInput value={endDate} onChange={setEndDate} placeholder="Até" />
              </div>
              {(startDate || endDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={() => { setStartDate(undefined); setEndDate(undefined); }}
                >
                  <X className="h-3.5 w-3.5" /> Limpar datas
                </Button>
              )}
            </div>

            <div className="space-y-1.5 border-t border-line pt-3">
              <Label className="text-xs">Salvar filtro atual</Label>
              <div className="flex gap-1.5">
                <Input
                  value={newFilterName}
                  onChange={(e) => setNewFilterName(e.target.value)}
                  placeholder="Ex: Vencendo essa semana"
                  className="h-8 text-sm"
                  disabled={savedFilters.length >= 5}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    const name = newFilterName.trim();
                    if (!name) return;
                    const next: SavedFilter = {
                      id: crypto.randomUUID(),
                      name,
                      filters: {
                        startDate: startDate ? format(startDate, 'yyyy-MM-dd') : undefined,
                        endDate: endDate ? format(endDate, 'yyyy-MM-dd') : undefined,
                        contact: filterContact,
                        responsible: filterResponsible,
                        obligation: filterObligation,
                      },
                    };
                    persistSaved([...savedFilters, next].slice(0, 5));
                    setNewFilterName('');
                    toast.success('Filtro salvo');
                  }}
                />
                <Button
                  size="sm"
                  className="h-8 shrink-0"
                  disabled={savedFilters.length >= 5 || !newFilterName.trim()}
                  title={savedFilters.length >= 5 ? 'Máximo de 5 filtros salvos' : undefined}
                  onClick={() => {
                    const name = newFilterName.trim();
                    if (!name) return;
                    const next: SavedFilter = {
                      id: crypto.randomUUID(),
                      name,
                      filters: {
                        startDate: startDate ? format(startDate, 'yyyy-MM-dd') : undefined,
                        endDate: endDate ? format(endDate, 'yyyy-MM-dd') : undefined,
                        contact: filterContact,
                        responsible: filterResponsible,
                        obligation: filterObligation,
                      },
                    };
                    persistSaved([...savedFilters, next].slice(0, 5));
                    setNewFilterName('');
                    toast.success('Filtro salvo');
                  }}
                >
                  <BookmarkPlus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {savedFilters.length > 0 && (
              <div className="space-y-1 border-t border-line pt-3">
                <Label className="text-xs">
                  <Bookmark className="mr-1 inline h-3 w-3" /> Meus filtros ({savedFilters.length})
                </Label>
                {savedFilters.map((sf) => (
                  <div key={sf.id} className="flex items-center justify-between gap-2 rounded-sm px-1.5 py-1 hover:bg-bg-2">
                    <button
                      type="button"
                      className="flex-1 truncate text-left text-ui"
                      onClick={() => {
                        setStartDate(sf.filters.startDate ? parse(sf.filters.startDate, 'yyyy-MM-dd', new Date()) : undefined);
                        setEndDate(sf.filters.endDate ? parse(sf.filters.endDate, 'yyyy-MM-dd', new Date()) : undefined);
                        setFilterContact(sf.filters.contact || 'all');
                        setFilterResponsible(sf.filters.responsible || 'all');
                        setFilterObligation(sf.filters.obligation || 'all');
                        toast.success(`Filtro "${sf.name}" aplicado`);
                      }}
                    >
                      {sf.name}
                    </button>
                    <button
                      type="button"
                      aria-label="Remover"
                      onClick={(e) => {
                        e.stopPropagation();
                        persistSaved(savedFilters.filter((x) => x.id !== sf.id));
                      }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-ink hover:bg-bg hover:text-ink"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* View Toggle — ícones do Figma (visão: gauge/layout-dashboard/list-checks/calendar) */}
        <div className="ml-auto">
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={v => v && setViewMode(v as ViewMode)}
            className="gap-0.5 rounded-md border border-line bg-bg-2 p-1"
          >
            <ToggleGroupItem value="myday" className="h-7 w-8 rounded-sm p-0 data-[state=on]:bg-paper data-[state=on]:shadow-sc-sm" title="Meu Dia">
              <Gauge className="h-[15px] w-[15px]" strokeWidth={1.75} />
            </ToggleGroupItem>
            <ToggleGroupItem value="kanban" className="h-7 w-8 rounded-sm p-0 data-[state=on]:bg-paper data-[state=on]:shadow-sc-sm" title="Kanban">
              <LayoutDashboard className="h-[15px] w-[15px]" strokeWidth={1.75} />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" className="h-7 w-8 rounded-sm p-0 data-[state=on]:bg-paper data-[state=on]:shadow-sc-sm" title="Lista">
              <ListChecks className="h-[15px] w-[15px]" strokeWidth={1.75} />
            </ToggleGroupItem>
            <ToggleGroupItem value="calendar" className="h-7 w-8 rounded-sm p-0 data-[state=on]:bg-paper data-[state=on]:shadow-sc-sm" title="Calendário">
              <CalendarDays className="h-[15px] w-[15px]" strokeWidth={1.75} />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {/* Views */}
      {viewMode === 'myday' && (
        <MyDayView
          tasks={displayedTasks}
          contactsMap={contactsMap}
          profilesMap={profilesMap}
          myProfileId={myProfileId}
          isAdminUser={isAdminUser}
          onStatusChange={handleStatusChange}
          onTaskClick={handleTaskClick}
          onUploadAttachment={handleUploadAttachment}
        />
      )}

      {viewMode === 'kanban' && (
        <KanbanBoard
          tasks={displayedTasks}
          contactsMap={contactsMap}
          profilesMap={profilesMap}
          onStatusChange={handleStatusChange}
          onTaskClick={handleTaskClick}
          onEdit={handleTaskClick}
          onDelete={canDelete ? (id) => { if (!guardLocked(id)) deleteTask.mutate(id); } : undefined}
          onUploadAttachment={handleUploadAttachment}
          onCompleteTask={handleCompleteTask}
          onUncompleteTask={handleUncompleteTask}
          onGroupClick={handleGroupClick}
          profileOptions={!isColaborador ? profileOptions : undefined}
          onReassign={!isColaborador ? handleInlineReassign : undefined}
        />
      )}


      {viewMode === 'list' && (
        <>
          {selectedTaskIds.size > 0 && (
            <div className="sticky top-14 z-30 flex items-center gap-3 px-4 py-2.5 rounded-lg border border-primary/30 bg-primary/5 backdrop-blur">
              <span className="text-sm font-medium text-foreground">
                {selectedTaskIds.size} tarefa{selectedTaskIds.size === 1 ? '' : 's'} selecionada{selectedTaskIds.size === 1 ? '' : 's'}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={clearSelection} className="gap-1.5">
                  <X className="w-3.5 h-3.5" /> Desmarcar tudo
                </Button>
                <Button size="sm" onClick={() => setBulkOpen(true)} className="gap-1.5">
                  <ArrowRightLeft className="w-3.5 h-3.5" /> Transferir Responsabilidade
                </Button>
                {canDelete && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive" className="gap-1.5">
                        <Trash2 className="w-3.5 h-3.5" /> Excluir selecionados
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir tarefas selecionadas</AlertDialogTitle>
                        <AlertDialogDescription>
                          Tem certeza que deseja excluir {selectedTaskIds.size} tarefa{selectedTaskIds.size === 1 ? '' : 's'} selecionada{selectedTaskIds.size === 1 ? '' : 's'}? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={handleBulkDelete}
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          )}
          <TaskListView
            tasks={displayedTasks}
            contactsMap={contactsMap}
            profilesMap={profilesMap}
            onTaskClick={handleTaskClick}
            onDelete={id => { if (!guardLocked(id)) deleteTask.mutate(id); }}
            canDelete={canDelete}
            selectedIds={selectedTaskIds}
            onToggleSelected={toggleSelected}
            onToggleAll={toggleAll}
            onRangeSelect={rangeSelect}
            profileOptions={!isColaborador ? profileOptions : undefined}
            onReassign={!isColaborador ? handleInlineReassign : undefined}
          />
        </>
      )}

      {viewMode === 'calendar' && (
        <TaskCalendarView
          tasks={displayedTasks}
          contactsMap={contactsMap}
          onTaskClick={handleTaskClick}
        />
      )}

      {/* Create Modal */}
      <TaskCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        contacts={fiscalContacts.map((c: any) => ({ id: c.id, name: c.name, responsible_id: c.responsible_id }))}
        profiles={companyProfiles}
        onSubmit={handleCreate}
        isLoading={createTask.isPending}
      />

      {/* Bulk Complete Modal */}
      <BulkCompleteDialog
        open={bulkCompleteOpen}
        onOpenChange={setBulkCompleteOpen}
        companyId={companyId}
        year={competenceYear ? Number(competenceYear) : new Date().getFullYear()}
        month={competenceMonth !== 'all' ? Number(competenceMonth) : new Date().getMonth() + 1}
      />

      {/* Detail Modal */}
      <TaskDetailModal
        open={detailOpen}
        onOpenChange={(o) => { setDetailOpen(o); if (!o) setSelectedGroupTasks(null); }}
        task={selectedTask}
        contacts={fiscalContacts.map((c: any) => ({ id: c.id, name: c.name }))}
        profiles={companyProfiles}
        onUpdate={(id, data) => { if (!guardLocked(id)) updateTask.mutate({ id, ...data }); }}
        onDelete={id => { if (!guardLocked(id)) deleteTask.mutate(id); }}
        onDeleteGroup={ids => {
          const lockedId = ids.find(id => isTaskLocked(id));
          if (lockedId) { guardLocked(lockedId); return; }
          deleteTasks.mutate(ids);
        }}
        groupTasks={selectedGroupTasks}
        onUploadForTask={handleUploadAttachment}
      />

      <BulkReassignModal
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        count={selectedTaskIds.size}
        profiles={profileOptions}
        onConfirm={handleBulkReassign}
      />
    </div>
  );
}
