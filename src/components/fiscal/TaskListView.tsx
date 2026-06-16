import { useEffect, useRef } from 'react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { Eye, Trash2, Paperclip } from 'lucide-react';
import { FiscalTask } from '@/hooks/useFiscalTasks';
import { useActiveCoverageByContact } from '@/hooks/useTemporaryTransfers';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  a_fazer: { label: 'A Fazer', className: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  aguardando_cliente: { label: 'Aguardando', className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30' },
  em_progresso: { label: 'Em Progresso', className: 'bg-orange-500/10 text-orange-600 border-orange-500/30' },
  concluido: { label: 'Concluído', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
};

function getDueDateColor(dueDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = differenceInDays(parseISO(dueDate), today);
  if (daysLeft < 0) return 'text-destructive';
  if (daysLeft <= 2) return 'text-orange-600';
  if (daysLeft <= 6) return 'text-yellow-600';
  return 'text-emerald-600';
}

interface ProfileOption { id: string; name: string }

interface TaskListViewProps {
  tasks: FiscalTask[];
  contactsMap: Record<string, string>;
  profilesMap: Record<string, { name: string; initials: string }>;
  onTaskClick: (task: FiscalTask) => void;
  onDelete: (id: string) => void;
  canDelete: boolean;
  // Bulk selection
  selectedIds?: Set<string>;
  onToggleSelected?: (id: string) => void;
  onToggleAll?: (ids: string[], allSelected: boolean) => void;
  onRangeSelect?: (ids: string[]) => void;
  // Inline reassign
  profileOptions?: ProfileOption[];
  onReassign?: (taskId: string, newResponsibleId: string) => void;
}

export function TaskListView({
  tasks, contactsMap, profilesMap, onTaskClick, onDelete, canDelete,
  selectedIds, onToggleSelected, onToggleAll, onRangeSelect, profileOptions, onReassign,
}: TaskListViewProps) {
  const lastIdxRef = useRef<number | null>(null);
  const { data: coverageMap = {} } = useActiveCoverageByContact();

  // Reset anchor when selection cleared
  useEffect(() => {
    if (!selectedIds || selectedIds.size === 0) lastIdxRef.current = null;
  }, [selectedIds]);

  if (tasks.length === 0) {
    return (
      <Card className="bg-card border-border/50">
        <div className="text-muted-foreground text-center py-16">Nenhuma tarefa encontrada</div>
      </Card>
    );
  }

  const showCheckbox = !!selectedIds && !!onToggleSelected;
  const allIds = tasks.map((t) => t.id);
  const allSelected = showCheckbox && allIds.length > 0 && allIds.every((id) => selectedIds!.has(id));
  const someSelected = showCheckbox && allIds.some((id) => selectedIds!.has(id));

  const handleCheckboxClick = (e: React.MouseEvent, idx: number, id: string) => {
    e.stopPropagation();
    if (e.shiftKey && lastIdxRef.current !== null && onRangeSelect) {
      const [a, b] = [lastIdxRef.current, idx].sort((x, y) => x - y);
      const rangeIds = tasks.slice(a, b + 1).map((t) => t.id);
      onRangeSelect(rangeIds);
    } else {
      onToggleSelected!(id);
    }
    lastIdxRef.current = idx;
  };

  return (
    <Card className="bg-card border-border/50">
      <Table>
        <TableHeader>
          <TableRow>
            {showCheckbox && (
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={() => onToggleAll?.(allIds, allSelected)}
                />
              </TableHead>
            )}
            <TableHead>Cliente</TableHead>
            <TableHead>Obrigação</TableHead>
            <TableHead>Responsável</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead className="w-24">Status</TableHead>
            <TableHead className="w-10"></TableHead>
            <TableHead className="text-left w-16">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task, idx) => {
            const profile = profilesMap[task.responsible_id || ''] || { name: '—', initials: '?' };
            const statusInfo = STATUS_LABELS[task.status] || STATUS_LABELS.a_fazer;
            const checked = !!selectedIds?.has(task.id);
            return (
              <TableRow key={task.id} className="cursor-pointer" onClick={() => onTaskClick(task)}>
                {showCheckbox && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <span
                      onClick={(e) => handleCheckboxClick(e, idx, task.id)}
                      className="inline-flex"
                    >
                      <Checkbox checked={checked} />
                    </span>
                  </TableCell>
                )}
                <TableCell className="font-medium text-sm">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span>{contactsMap[task.contact_id] || '—'}</span>
                    {coverageMap[task.contact_id] && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30">
                        Temporário até {format(parseISO(coverageMap[task.contact_id].end_date), 'dd/MM')}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm">{task.title}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {onReassign && profileOptions ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-2 hover:bg-muted/50 rounded-md px-1.5 py-1 transition-colors">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{profile.initials}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm text-muted-foreground">{profile.name}</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-56 p-2">
                        <Select
                          value={task.responsible_id ?? ''}
                          onValueChange={(v) => onReassign(task.id, v)}
                        >
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            {profileOptions.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{profile.initials}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-muted-foreground">{profile.name}</span>
                    </div>
                  )}
                </TableCell>
                <TableCell className={cn('text-sm font-medium', getDueDateColor(task.due_date))}>
                  {format(parseISO(task.due_date), 'dd/MM/yyyy', { locale: ptBR })}
                </TableCell>
                <TableCell className="w-24">
                  <Badge variant="outline" className={cn('text-xs', statusInfo.className)}>{statusInfo.label}</Badge>
                </TableCell>
                <TableCell className="w-10">
                  {task.attachment_url && <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />}
                </TableCell>
                <TableCell className="text-left w-16" onClick={e => e.stopPropagation()}>
                  <div className="flex gap-1 justify-start">
                    <Button variant="ghost" size="icon" onClick={() => onTaskClick(task)}><Eye className="h-4 w-4" /></Button>
                    {canDelete && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir tarefa</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja excluir esta tarefa? Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => onDelete(task.id)}
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
