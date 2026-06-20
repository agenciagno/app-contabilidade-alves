import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, isValid, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Kanban, List, CalendarDays, CalendarIcon, X, ArrowRightLeft, Trash2, Bookmark, BookmarkPlus, Target } from 'lucide-react';
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

  // Pre-populate responsible from URL (?responsible=<profileId>)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const r = searchParams.get('responsible');
    if (r && r !== filterResponsible) {
      setFilterResponsible(r);
      setViewMode('list');
      const next = new URLSearchParams(searchParams);
      next.delete('responsible');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<FiscalTask | null>(null);
  const [selectedGroupTasks, setSelectedGroupTasks] = useState<FiscalTask[] | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  // Profiles for responsible dropdown — only collaborators with active clients assigned
  const { data: companyProfiles = [] } = useQuery({
    queryKey: ['company-profiles-fiscal-with-clients', companyId],
    queryFn: async () => {
      const { data: contactRows, error: e1 } = await supabase
        .from('contacts')
        .select('responsible_id')
        .eq('company_id', companyId!)
        .eq('is_active', true)
        .not('responsible_id', 'is', null);
      if (e1) throw e1;
      const ids = Array.from(new Set((contactRows ?? []).map((r: any) => r.responsible_id).filter(Boolean)));
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('company_id', companyId!)
        .eq('status_active', true)
        .in('id', ids);
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

  const { tasks, isLoading, createTask, updateTask, deleteTask } = useFiscalTasks(filters);

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

  const handleCreate = (data: { contact_id: string; responsible_id: string | null; title: string; description: string | null; due_date: string }) => {
    if (!companyId) return;
    createTask.mutate({
      company_id: companyId,
      contact_id: data.contact_id,
      responsible_id: data.responsible_id,
      title: data.title,
      description: data.description,
      status: 'a_fazer',
      due_date: data.due_date,
      attachment_url: null,
      notes: null,
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
      <div className="flex items-center justify-between py-4 flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tarefas Fiscais</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setBulkCompleteOpen(true)}>
            <CheckCheck className="w-4 h-4" />
            Concluir em Lote
          </Button>
          {canDelete && (
            <Button className="gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              Nova Tarefa
            </Button>
          )}
        </div>
      </div>

      {isSelectedPeriodClosed && (
        <div className="flex items-center gap-2 rounded-md border border-muted-foreground/30 bg-muted px-3 py-2 text-sm text-muted-foreground">
          <span className="font-medium">Competência encerrada.</span>
          As tarefas deste período estão bloqueadas para edição.
        </div>
      )}


      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setQuickFilter((q) => (q === 'overdue' ? null : 'overdue'))}
          className="text-left"
        >
          <Card
            className={cn(
              'p-3 border-l-4 border-l-destructive bg-destructive/5 hover:bg-destructive/10 transition-colors h-full',
              quickFilter === 'overdue' && 'ring-2 ring-destructive',
            )}
          >
            <div className="text-xs font-medium text-muted-foreground">Atrasadas</div>
            <div className="text-2xl font-bold text-destructive mt-1">{kpis.overdue}</div>
          </Card>
        </button>

        <button
          type="button"
          onClick={() => setQuickFilter((q) => (q === 'today' ? null : 'today'))}
          className="text-left"
        >
          <Card
            className={cn(
              'p-3 border-l-4 border-l-orange-500 bg-orange-500/5 hover:bg-orange-500/10 transition-colors h-full',
              quickFilter === 'today' && 'ring-2 ring-orange-500',
            )}
          >
            <div className="text-xs font-medium text-muted-foreground">Vencem Hoje</div>
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">{kpis.dueToday}</div>
          </Card>
        </button>

        <button
          type="button"
          onClick={() => setQuickFilter((q) => (q === 'awaiting' ? null : 'awaiting'))}
          className="text-left"
        >
          <Card
            className={cn(
              'p-3 border-l-4 border-l-yellow-500 bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors h-full',
              quickFilter === 'awaiting' && 'ring-2 ring-yellow-500',
            )}
          >
            <div className="text-xs font-medium text-muted-foreground">Aguardando Cliente +5 dias</div>
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">{kpis.awaiting}</div>
          </Card>
        </button>

        <button
          type="button"
          onClick={() => setQuickFilter(null)}
          className="text-left"
        >
          <Card
            className={cn(
              'p-3 border-l-4 border-l-green-500 bg-green-500/5 hover:bg-green-500/10 transition-colors h-full',
              quickFilter === null && 'ring-2 ring-green-500',
            )}
          >
            <div className="text-xs font-medium text-muted-foreground">Progresso do Mês</div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
              {kpis.pct}% <span className="text-sm font-normal text-muted-foreground">({kpis.doneMonth}/{kpis.totalMonth})</span>
            </div>
            <Progress value={kpis.pct} className="h-1.5 mt-2" />
          </Card>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap gap-3 items-center">


        {/* Competência */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Competência:</span>
          <Select value={competenceMonth} onValueChange={setCompetenceMonth}>
            <SelectTrigger className="h-9 w-[130px] text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].map((m, i) => (
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

        {/* Date Range */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">De:</span>
          <DateInput value={startDate} onChange={setStartDate} placeholder="DD/MM/AAAA" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Até:</span>
          <DateInput value={endDate} onChange={setEndDate} placeholder="DD/MM/AAAA" />
        </div>
        {(startDate || endDate) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 text-xs"
            onClick={() => { setStartDate(undefined); setEndDate(undefined); }}
          >
            <X className="h-3.5 w-3.5" /> Limpar datas
          </Button>
        )}

        {/* Client Filter */}
        <SearchableSelect
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
          value={filterObligation}
          onChange={setFilterObligation}
          options={obligations.map((o) => ({ value: o.id, label: o.is_custom ? `★ ${o.name}` : o.name }))}
          placeholder="Todas as obrigações"
          allLabel="Todas as obrigações"
          width="w-[220px]"
        />

        {/* Saved Filters */}
        <Popover open={savePopoverOpen} onOpenChange={setSavePopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs"
              disabled={savedFilters.length >= 5}
              title={savedFilters.length >= 5 ? 'Máximo de 5 filtros salvos' : 'Salvar filtro atual'}
            >
              <BookmarkPlus className="w-3.5 h-3.5" /> Salvar filtro
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 space-y-2">
            <Label className="text-xs">Nome do filtro</Label>
            <Input
              value={newFilterName}
              onChange={(e) => setNewFilterName(e.target.value)}
              placeholder="Ex: Vencendo essa semana"
              className="h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
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
                  setSavePopoverOpen(false);
                  toast.success('Filtro salvo');
                }
              }}
            />
            <Button
              size="sm"
              className="w-full h-8"
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
                setSavePopoverOpen(false);
                toast.success('Filtro salvo');
              }}
            >
              Salvar
            </Button>
          </PopoverContent>
        </Popover>

        {savedFilters.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
                <Bookmark className="w-3.5 h-3.5" /> Meus filtros ({savedFilters.length})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel className="text-xs">Aplicar filtro salvo</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {savedFilters.map((sf) => (
                <DropdownMenuItem
                  key={sf.id}
                  onSelect={(e) => e.preventDefault()}
                  className="flex items-center justify-between gap-2"
                >
                  <button
                    type="button"
                    className="flex-1 text-left truncate"
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
                    className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* View Toggle */}
        <div className="ml-auto">
          <ToggleGroup type="single" value={viewMode} onValueChange={v => v && setViewMode(v as ViewMode)} className="border border-border/50 rounded-md p-0.5">
            <ToggleGroupItem value="myday" className="h-8 w-8 p-0" title="Meu Dia">
              <Target className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="kanban" className="h-8 w-8 p-0" title="Kanban">
              <Kanban className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" className="h-8 w-8 p-0" title="Lista">
              <List className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="calendar" className="h-8 w-8 p-0" title="Calendário">
              <CalendarDays className="h-4 w-4" />
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

      {/* Detail Modal */}
      <TaskDetailModal
        open={detailOpen}
        onOpenChange={(o) => { setDetailOpen(o); if (!o) setSelectedGroupTasks(null); }}
        task={selectedTask}
        contacts={fiscalContacts.map((c: any) => ({ id: c.id, name: c.name }))}
        profiles={companyProfiles}
        onUpdate={(id, data) => { if (!guardLocked(id)) updateTask.mutate({ id, ...data }); }}
        onDelete={id => { if (!guardLocked(id)) deleteTask.mutate(id); }}
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
