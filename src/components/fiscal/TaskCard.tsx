import { useState } from 'react';
import { differenceInDays, parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Paperclip, MoreVertical, Pencil, Trash2, Clock, UserCog } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
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
import { cn } from '@/lib/utils';
import { FiscalTask } from '@/hooks/useFiscalTasks';

interface TaskCardProps {
  task: FiscalTask;
  contactName: string;
  responsibleName: string;
  responsibleInitials: string;
  onClick: () => void;
  dragProps?: Record<string, any>;
  onEdit?: (task: FiscalTask) => void;
  onDelete?: (taskId: string) => void;
  temporaryCoverage?: { end_date: string } | null;
  profileOptions?: { id: string; name: string }[];
  onReassign?: (taskId: string, profileId: string) => void;
}

export function getSlaInfo(task: FiscalTask) {
  const dueStr = (task as any).fiscal_due_date || task.due_date;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseISO(dueStr);
  const daysLeft = differenceInDays(due, today);

  if (daysLeft < 0) {
    return {
      daysLeft,
      label: `Atrasado há ${Math.abs(daysLeft)}d`,
      badgeClass: 'bg-red-600 text-white border-red-700 animate-pulse',
      barClass: 'bg-red-700 animate-pulse',
      isOverdue: true,
    };
  }
  if (daysLeft <= 2) {
    return {
      daysLeft,
      label: `D-${daysLeft}`,
      badgeClass: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/40 animate-pulse',
      barClass: 'bg-red-500',
      isOverdue: false,
    };
  }
  if (daysLeft <= 5) {
    return {
      daysLeft,
      label: `D-${daysLeft}`,
      badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40',
      barClass: 'bg-amber-500',
      isOverdue: false,
    };
  }
  return {
    daysLeft,
    label: `D-${daysLeft}`,
    badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40',
    barClass: 'bg-emerald-500',
    isOverdue: false,
  };
}

export function TaskCard({
  task, contactName, responsibleName, responsibleInitials, onClick, dragProps,
  onEdit, onDelete, temporaryCoverage, profileOptions, onReassign,
}: TaskCardProps) {
  const sla = getSlaInfo(task);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isWaiting = task.status === 'aguardando_cliente';
  const dueStr = (task as any).fiscal_due_date || task.due_date;

  const stopAll = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      <Card
        className={cn(
          'group cursor-pointer hover:shadow-md transition-shadow border-border/50 bg-card relative overflow-hidden',
          isWaiting && 'border-l-4 border-l-amber-500',
        )}
        onClick={onClick}
        {...dragProps}
      >
        {/* SLA top bar (2px) */}
        <div className={cn('absolute top-0 left-0 right-0 h-0.5', sla.barClass)} />

        <CardContent className="p-3 space-y-2 pt-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm font-semibold text-foreground truncate">{contactName}</p>
                {isWaiting && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40">
                    Aguardando
                  </Badge>
                )}
                {temporaryCoverage && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30">
                    Temporário até {format(parseISO(temporaryCoverage.end_date), 'dd/MM')}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{task.title}</p>
              <p className="text-[10px] text-muted-foreground">
                {format(parseISO(dueStr), "dd 'de' MMM", { locale: ptBR })}
              </p>
            </div>
            <div
              onPointerDown={stopAll}
              onMouseDown={stopAll}
              onClick={stopAll}
              className="-mr-1 -mt-1 flex items-center gap-0.5"
            >
              {profileOptions && onReassign && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="h-6 w-6 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Reatribuir"
                      title="Reatribuir responsável"
                    >
                      <UserCog className="w-3.5 h-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={stopAll} className="max-h-72 overflow-y-auto">
                    <DropdownMenuLabel className="text-xs">Reatribuir para</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {profileOptions.map((p) => (
                      <DropdownMenuItem
                        key={p.id}
                        onClick={() => onReassign(task.id, p.id)}
                        className={cn(task.responsible_id === p.id && 'font-semibold')}
                      >
                        {p.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {(onEdit || onDelete) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="h-6 w-6 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
                      aria-label="Ações"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={stopAll}>
                    {onEdit && (
                      <DropdownMenuItem onClick={() => onEdit(task)}>
                        <Pencil className="w-4 h-4 mr-2" /> Editar
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setConfirmOpen(true)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Excluir
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 gap-2">
            {/* Bottom-left: attachment indicator */}
            <div className="flex items-center gap-1.5 min-w-0">
              {task.attachment_url && (
                <Paperclip className="w-[14px] h-[14px] text-muted-foreground shrink-0" />
              )}
              <Avatar className="w-6 h-6">
                <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                  {responsibleInitials}
                </AvatarFallback>
              </Avatar>
            </div>

            {/* Bottom-right: SLA badge */}
            <Badge
              variant="outline"
              className={cn('text-[10px] px-1.5 py-0 inline-flex items-center gap-1 shrink-0', sla.badgeClass)}
              title={`Vencimento: ${format(parseISO(dueStr), 'dd/MM/yyyy')}`}
            >
              <Clock className="w-3 h-3" />
              {sla.label}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent onClick={stopAll}>
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
              onClick={() => { onDelete?.(task.id); setConfirmOpen(false); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
