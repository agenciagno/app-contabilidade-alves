import { useState, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type CollisionDetection,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDownAZ, ArrowDownZA, Clock } from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';
import { FiscalTask } from '@/hooks/useFiscalTasks';
import { TaskCard } from './TaskCard';
import { GroupedTaskCard } from './GroupedTaskCard';
import { useToast } from '@/hooks/use-toast';
import { useActiveCoverageByContact } from '@/hooks/useTemporaryTransfers';

const COLUMNS = [
  { id: 'a_fazer', label: 'A Fazer', color: 'bg-blue-500' },
  { id: 'em_progresso', label: 'Em Progresso', color: 'bg-orange-500' },
  { id: 'aguardando_cliente', label: 'Aguardando Cliente', color: 'bg-yellow-500' },
  { id: 'concluido', label: 'Concluído', color: 'bg-emerald-500' },
] as const;

const COLUMN_IDS = COLUMNS.map((c) => c.id) as readonly string[];

// Precedence: most-advanced status wins
const STATUS_PRECEDENCE: Record<string, number> = {
  a_fazer: 0,
  em_progresso: 1,
  aguardando_cliente: 2,
  concluido: 3,
};

type SortDir = 'asc' | 'desc';

interface KanbanBoardProps {
  tasks: FiscalTask[];
  contactsMap: Record<string, string>;
  profilesMap: Record<string, { name: string; initials: string }>;
  onStatusChange: (taskId: string, newStatus: string) => void;
  onTaskClick: (task: FiscalTask) => void;
  onEdit?: (task: FiscalTask) => void;
  onDelete?: (taskId: string) => void;
  onUploadAttachment?: (task: FiscalTask, file: File) => Promise<void>;
  onCompleteTask?: (task: FiscalTask, data: { protocolNumber: string | null; completionNotes: string | null }) => void;
  onGroupClick?: (tasks: FiscalTask[]) => void;
  profileOptions?: { id: string; name: string }[];
  onReassign?: (taskId: string, profileId: string) => void;
}

interface SingleItem {
  type: 'single';
  id: string;
  dueDate: string;
  task: FiscalTask;
}
interface GroupItem {
  type: 'group';
  id: string; // group-<contactId>-<dueDate>
  dueDate: string;
  contactId: string;
  tasks: FiscalTask[];
  displayStatus: string;
}
type KanbanItem = SingleItem | GroupItem;

function DroppableColumn({
  id, label, color, count, sortDir, onToggleSort, children,
}: {
  id: string;
  label: string;
  color: string;
  count: number;
  sortDir: SortDir;
  onToggleSort: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const isWaiting = id === 'aguardando_cliente';

  return (
    <div className="flex-1 min-w-[260px] flex-shrink-0 flex flex-col">
      <div
        className={`flex items-center gap-2 mb-3 px-2 py-1.5 rounded-md ${
          isWaiting ? 'bg-amber-100 dark:bg-amber-900/20' : ''
        }`}
      >
        {isWaiting ? (
          <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
        ) : (
          <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
        )}
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{count}</span>
        <button
          type="button"
          onClick={onToggleSort}
          title={sortDir === 'desc' ? 'Ordem alfabética: Z → A' : 'Ordem alfabética: A → Z'}
          className="ml-auto h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
          aria-label="Alternar ordenação alfabética"
        >
          {sortDir === 'desc' ? <ArrowDownZA className="w-3.5 h-3.5" /> : <ArrowDownAZ className="w-3.5 h-3.5" />}
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 rounded-lg p-2 space-y-2 min-h-[200px] transition-colors ${
          isOver ? 'bg-primary/5 border-2 border-dashed border-primary/30' : 'bg-muted/30 border border-border/30'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function SortableSingle({ item, contactsMap, profilesMap, onTaskClick, onEdit, onDelete, coverageMap, profileOptions, onReassign }: {
  item: SingleItem;
  contactsMap: Record<string, string>;
  profilesMap: Record<string, { name: string; initials: string }>;
  onTaskClick: (task: FiscalTask) => void;
  onEdit?: (task: FiscalTask) => void;
  onDelete?: (taskId: string) => void;
  coverageMap: Record<string, { end_date: string }>;
  profileOptions?: { id: string; name: string }[];
  onReassign?: (taskId: string, profileId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { kind: 'single', status: item.task.status },
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const profile = profilesMap[item.task.responsible_id || ''] || { name: 'Sem responsável', initials: '?' };
  const tempCov = coverageMap[item.task.contact_id] ?? null;
  return (
    <div ref={setNodeRef} style={style}>
      <TaskCard
        task={item.task}
        contactName={contactsMap[item.task.contact_id] || 'Cliente'}
        responsibleName={profile.name}
        responsibleInitials={profile.initials}
        onClick={() => onTaskClick(item.task)}
        dragProps={{ ...attributes, ...listeners }}
        onEdit={onEdit}
        onDelete={onDelete}
        temporaryCoverage={tempCov}
        profileOptions={profileOptions}
        onReassign={onReassign}
      />
    </div>
  );
}

function SortableGroup({ item, contactsMap, profilesMap, onUploadAttachment, onCompleteTask, onCardClick }: {
  item: GroupItem;
  contactsMap: Record<string, string>;
  profilesMap: Record<string, { name: string; initials: string }>;
  onUploadAttachment: (task: FiscalTask, file: File) => Promise<void>;
  onCompleteTask?: (task: FiscalTask, data: { protocolNumber: string | null; completionNotes: string | null }) => void;
  onCardClick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { kind: 'group', status: item.displayStatus },
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const respId = item.tasks[0]?.responsible_id || '';
  const profile = profilesMap[respId] || { name: 'Sem responsável', initials: '?' };
  return (
    <div ref={setNodeRef} style={style}>
      <GroupedTaskCard
        groupId={item.id}
        contactName={contactsMap[item.contactId] || 'Cliente'}
        dueDate={item.dueDate}
        tasks={item.tasks}
        responsibleInitials={profile.initials}
        responsibleName={profile.name}
        onUploadAttachment={onUploadAttachment}
        onCompleteTask={onCompleteTask}
        dragProps={{ ...attributes, ...listeners }}
        onCardClick={onCardClick}
      />
    </div>
  );
}

export function KanbanBoard({ tasks, contactsMap, profilesMap, onStatusChange, onTaskClick, onEdit, onDelete, onUploadAttachment, onCompleteTask, onGroupClick, profileOptions, onReassign }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [columnSort, setColumnSort] = useState<Record<string, SortDir>>(() =>
    COLUMNS.reduce((acc, c) => ({ ...acc, [c.id]: 'asc' as SortDir }), {}),
  );
  const { toast } = useToast();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const { data: coverageMap = {} } = useActiveCoverageByContact();

  const today = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  }, []);
  const effDate = (t: FiscalTask) => ((t as any).fiscal_due_date as string | null) || t.due_date;
  const isOverdueTask = (t: FiscalTask) => {
    if (t.status === 'concluido') return false;
    try { return differenceInDays(parseISO(effDate(t)), today) < 0; } catch { return false; }
  };

  // Build items: 1 card per contact within the current period (competence)
  const itemsByStatus = useMemo(() => {
    const groupsMap = new Map<string, FiscalTask[]>();
    for (const t of tasks) {
      const key = t.contact_id;
      const arr = groupsMap.get(key) ?? [];
      arr.push(t);
      groupsMap.set(key, arr);
    }

    const items: KanbanItem[] = [];
    for (const [contactId, group] of groupsMap.entries()) {
      const sorted = [...group].sort((a, b) => {
        const da = effDate(a);
        const db = effDate(b);
        if (da !== db) return da.localeCompare(db);
        return (a.title || '').localeCompare(b.title || '');
      });
      // Priority: aguardando_cliente > all done → concluido > some done → em_progresso > a_fazer
      const hasWaiting = sorted.some((t) => t.status === 'aguardando_cliente');
      const allDone = sorted.every((t) => t.status === 'concluido');
      const someDone = sorted.some((t) => t.status === 'concluido');
      let best: string;
      if (hasWaiting) best = 'aguardando_cliente';
      else if (allDone) best = 'concluido';
      else if (someDone) best = 'em_progresso';
      else best = 'a_fazer';

      // Badge date: min due date among pending tasks; if all done, use max completed date
      const pending = sorted.filter((t) => t.status !== 'concluido');
      const badgeDate = pending.length > 0
        ? pending.map(effDate).sort()[0]
        : sorted.map(effDate).sort().slice(-1)[0];

      items.push({
        type: 'group',
        id: `group-${contactId}`,
        contactId,
        dueDate: badgeDate,
        tasks: sorted,
        displayStatus: best,
      });
    }


    // Distribute into columns: overdue first (always), then by client name (A-Z / Z-A)
    const nameOf = (it: KanbanItem) =>
      contactsMap[it.type === 'single' ? it.task.contact_id : it.contactId] || '';
    return COLUMNS.reduce((acc, col) => {
      const dir = columnSort[col.id];
      const list = items
        .filter((it) => (it.type === 'single' ? it.task.status : it.displayStatus) === col.id)
        .sort((a, b) => {
          const aOver = a.type === 'single' ? isOverdueTask(a.task) : a.tasks.some(isOverdueTask);
          const bOver = b.type === 'single' ? isOverdueTask(b.task) : b.tasks.some(isOverdueTask);
          if (aOver !== bOver) return aOver ? -1 : 1;
          const cmp = nameOf(a).localeCompare(nameOf(b), 'pt-BR', { sensitivity: 'base' });
          return dir === 'asc' ? cmp : -cmp;
        });
      acc[col.id] = list;
      return acc;
    }, {} as Record<string, KanbanItem[]>);
  }, [tasks, columnSort, today, contactsMap]);

  const activeItem = useMemo(() => {
    if (!activeId) return null;
    for (const list of Object.values(itemsByStatus)) {
      const found = list.find((i) => i.id === activeId);
      if (found) return found;
    }
    return null;
  }, [activeId, itemsByStatus]);

  const collisionDetection: CollisionDetection = (args) => {
    const columnContainers = args.droppableContainers.filter((c) =>
      COLUMN_IDS.includes(String(c.id)),
    );
    const pointer = pointerWithin({ ...args, droppableContainers: columnContainers });
    if (pointer.length > 0) return pointer;
    const rect = rectIntersection({ ...args, droppableContainers: columnContainers });
    if (rect.length > 0) return rect;
    return closestCenter({ ...args, droppableContainers: columnContainers });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const targetStatus = String(over.id);
    if (!COLUMN_IDS.includes(targetStatus)) return;

    const itemId = String(active.id);
    // Find item
    let item: KanbanItem | undefined;
    for (const list of Object.values(itemsByStatus)) {
      item = list.find((i) => i.id === itemId);
      if (item) break;
    }
    if (!item) return;

    if (item.type === 'single') {
      const task = item.task;
      if (targetStatus === task.status) return;
      if (targetStatus === 'concluido' && !task.attachment_url) {
        toast({
          title: 'Anexo obrigatório',
          description: 'É necessário anexar um arquivo antes de concluir a tarefa.',
          variant: 'destructive',
        });
        return;
      }
      onStatusChange(task.id, targetStatus);
      return;
    }

    // Group
    if (targetStatus === item.displayStatus) return;
    if (targetStatus === 'concluido') {
      toast({
        title: 'Conclusão por anexo',
        description: 'Para concluir, faça o upload do anexo em cada obrigação.',
      });
      return;
    }
    if (targetStatus !== 'em_progresso' && targetStatus !== 'aguardando_cliente') {
      // Block drops to a_fazer for grouped cards
      return;
    }
    // Apply to all tasks in the group whose status differs
    for (const t of item.tasks) {
      if (t.status !== targetStatus) onStatusChange(t.id, targetStatus);
    }
  };

  const toggleColumnSort = (id: string) =>
    setColumnSort((prev) => ({ ...prev, [id]: prev[id] === 'desc' ? 'asc' : 'desc' }));

  const noopUpload = async () => {};

  return (
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="kanban-scroll-container has-scroll">
        <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map(col => (
          <DroppableColumn
            key={col.id}
            id={col.id}
            label={col.label}
            color={col.color}
            count={itemsByStatus[col.id].length}
            sortDir={columnSort[col.id]}
            onToggleSort={() => toggleColumnSort(col.id)}
          >
            <SortableContext items={itemsByStatus[col.id].map(i => i.id)} strategy={verticalListSortingStrategy}>
              {itemsByStatus[col.id].map(item => (
                item.type === 'single' ? (
                  <SortableSingle
                    key={item.id}
                    item={item}
                    contactsMap={contactsMap}
                    profilesMap={profilesMap}
                    onTaskClick={onTaskClick}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    coverageMap={coverageMap}
                    profileOptions={profileOptions}
                    onReassign={onReassign}
                  />
                ) : (
                  <SortableGroup
                    key={item.id}
                    item={item}
                    contactsMap={contactsMap}
                    profilesMap={profilesMap}
                    onUploadAttachment={onUploadAttachment ?? noopUpload}
                    onCompleteTask={onCompleteTask}
                    onCardClick={onGroupClick ? () => onGroupClick(item.tasks) : undefined}
                  />
                )
              ))}
            </SortableContext>
          </DroppableColumn>
        ))}
        </div>
      </div>
      <DragOverlay>
        {activeItem && activeItem.type === 'single' && (
          <TaskCard
            task={activeItem.task}
            contactName={contactsMap[activeItem.task.contact_id] || 'Cliente'}
            responsibleName={profilesMap[activeItem.task.responsible_id || '']?.name || '?'}
            responsibleInitials={profilesMap[activeItem.task.responsible_id || '']?.initials || '?'}
            onClick={() => {}}
            temporaryCoverage={coverageMap[activeItem.task.contact_id] ?? null}
          />
        )}
        {activeItem && activeItem.type === 'group' && (
          <GroupedTaskCard
            groupId={activeItem.id}
            contactName={contactsMap[activeItem.contactId] || 'Cliente'}
            dueDate={activeItem.dueDate}
            tasks={activeItem.tasks}
            responsibleInitials={profilesMap[activeItem.tasks[0]?.responsible_id || '']?.initials || '?'}
            responsibleName={profilesMap[activeItem.tasks[0]?.responsible_id || '']?.name || '?'}
            onUploadAttachment={noopUpload}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
