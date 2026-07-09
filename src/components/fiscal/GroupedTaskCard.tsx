import { useRef, useState } from 'react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, Paperclip, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { FiscalTask } from '@/hooks/useFiscalTasks';

interface GroupedTaskCardProps {
  groupId: string;
  contactName: string;
  dueDate: string;
  tasks: FiscalTask[]; // sorted
  responsibleInitials: string;
  responsibleName: string;
  onUploadAttachment: (task: FiscalTask, file: File) => Promise<void>;
  dragProps?: Record<string, any>;
  onCardClick?: () => void;
}

function effDate(t: FiscalTask): string {
  return ((t as any).fiscal_due_date as string | null) || t.due_date;
}

function daysLeft(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return differenceInDays(parseISO(dateStr), today);
}

function getDueDateColor(dueDate: string) {
  const d = daysLeft(dueDate);
  if (d < 0) return { bg: 'bg-destructive/10', text: 'text-destructive', border: 'border-destructive/30' };
  if (d <= 2) return { bg: 'bg-orange-500/10', text: 'text-orange-600', border: 'border-orange-500/30' };
  if (d <= 6) return { bg: 'bg-yellow-500/10', text: 'text-yellow-600', border: 'border-yellow-500/30' };
  return { bg: 'bg-emerald-500/10', text: 'text-emerald-600', border: 'border-emerald-500/30' };
}

export function GroupedTaskCard({
  contactName,
  tasks,
  responsibleInitials,
  onUploadAttachment,
  dragProps,
  onCardClick,
}: GroupedTaskCardProps) {
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const isTaskDone = (t: FiscalTask) => t.status === 'concluido' || !!t.attachment_url;
  const isTaskOverdue = (t: FiscalTask) => {
    if (isTaskDone(t)) return false;
    try { return daysLeft(effDate(t)) < 0; } catch { return false; }
  };

  const pendingTasks = tasks.filter((t) => !isTaskDone(t));
  const allDone = pendingTasks.length === 0;
  const anyOverdue = tasks.some(isTaskOverdue);

  // Badge date: min due among pending; hide when all done
  const badgeDate = !allDone
    ? pendingTasks.map(effDate).sort()[0]
    : null;
  const dateColor = badgeDate ? getDueDateColor(badgeDate) : null;

  const stopAll = (e: React.SyntheticEvent) => e.stopPropagation();

  const handlePick = (taskId: string) => {
    fileInputRefs.current[taskId]?.click();
  };

  const handleFile = async (task: FiscalTask, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingId(task.id);
      await onUploadAttachment(task, file);
    } finally {
      setUploadingId(null);
      e.target.value = '';
    }
  };

  return (
    <Card
      className={cn(
        'bg-card relative cursor-grab active:cursor-grabbing',
        anyOverdue
          ? 'border-destructive border-2 shadow-[0_0_0_1px_hsl(var(--destructive)/0.15)]'
          : 'border-border/50',
        onCardClick && 'hover:shadow-md transition-shadow',
      )}
      onClick={onCardClick}
      {...dragProps}
    >
      <CardContent className="p-3 space-y-2.5">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-foreground truncate flex-1">{contactName}</p>
            <Avatar className="w-6 h-6 shrink-0">
              <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                {responsibleInitials}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="flex items-center justify-between gap-2">
            {allDone ? (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1">
                <CheckCircle2 className="w-3 h-3" /> Concluído
              </Badge>
            ) : (
              <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', dateColor?.bg, dateColor?.text, dateColor?.border)}>
                <Calendar className="w-3 h-3 mr-1" />
                {badgeDate && format(parseISO(badgeDate), 'dd/MM/yyyy', { locale: ptBR })}
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground">
              {tasks.filter(isTaskDone).length}/{tasks.length} concluídas
            </span>
          </div>
        </div>

        {/* Checklist */}
        <ul
          className="space-y-1 pt-1 border-t border-border/40"
          onPointerDown={stopAll}
          onMouseDown={stopAll}
          onClick={stopAll}
        >
          {tasks.map((task) => {
            const done = isTaskDone(task);
            const overdue = isTaskOverdue(task);
            const isUploading = uploadingId === task.id;
            const itemDate = effDate(task);
            return (
              <li
                key={task.id}
                className={cn(
                  'flex items-center gap-2 text-xs rounded px-1.5 py-1 border',
                  done && 'bg-emerald-500/10 border-emerald-500/30',
                  !done && overdue && 'bg-destructive/10 border-destructive/40',
                  !done && !overdue && 'border-transparent',
                )}
              >
                <Checkbox
                  checked={done}
                  disabled
                  className="h-3.5 w-3.5 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                />
                <span className={cn('flex-1 truncate', done && 'line-through text-muted-foreground')}>
                  {task.title}
                </span>
                <span
                  className={cn(
                    'text-[10px] tabular-nums shrink-0',
                    overdue && !done ? 'text-destructive font-medium' : 'text-muted-foreground',
                  )}
                >
                  {itemDate && format(parseISO(itemDate), 'dd/MM', { locale: ptBR })}
                </span>
                {done ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : overdue ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                    <input
                      ref={(el) => (fileInputRefs.current[task.id] = el)}
                      type="file"
                      className="hidden"
                      onChange={(e) => handleFile(task, e)}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px] gap-1"
                      disabled={isUploading}
                      onClick={(e) => { e.stopPropagation(); handlePick(task.id); }}
                    >
                      {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
                    </Button>
                  </>
                ) : (
                  <>
                    <input
                      ref={(el) => (fileInputRefs.current[task.id] = el)}
                      type="file"
                      className="hidden"
                      onChange={(e) => handleFile(task, e)}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px] gap-1"
                      disabled={isUploading}
                      onClick={(e) => { e.stopPropagation(); handlePick(task.id); }}
                    >
                      {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
                      Anexar
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
