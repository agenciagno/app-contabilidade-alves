import { useState, useEffect, useMemo } from 'react';
import { format, parseISO, differenceInCalendarDays, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Upload, Paperclip, CheckCircle, Trash2, Send,
  Clock, AlertTriangle, CheckCircle2, ExternalLink,
  Plus, ArrowRight, UserCog,
} from 'lucide-react';
import { FiscalTask } from '@/hooks/useFiscalTasks';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';

// ---- SLA helper ----
type SlaInfo = {
  tone: 'success' | 'warning' | 'danger' | 'critical' | 'done';
  Icon: typeof Clock;
  label: string;
  pulse?: boolean;
};

function getSlaInfo(task: any): SlaInfo {
  const completedAt: string | null = task.completed_at ?? null;
  const due = task.due_date ? parseISO(task.due_date) : null;
  if (task.status === 'concluido' && completedAt && due) {
    const c = parseISO(completedAt);
    const diff = differenceInCalendarDays(c, due);
    const base = `Concluída em ${format(c, 'dd/MM/yyyy')}`;
    if (diff <= 0) return { tone: 'done', Icon: CheckCircle2, label: `${base} · ✓ No prazo` };
    return { tone: 'danger', Icon: CheckCircle2, label: `${base} · entregue com ${diff} dia(s) de atraso` };
  }
  if (!due) return { tone: 'success', Icon: CheckCircle, label: 'Sem prazo definido' };
  const days = differenceInCalendarDays(due, new Date());
  if (days < 0) return { tone: 'critical', Icon: AlertTriangle, label: `Atrasada há ${Math.abs(days)} dia(s)`, pulse: true };
  if (days <= 2) return { tone: 'danger', Icon: AlertTriangle, label: `${days === 0 ? 'Vence hoje' : `${days} dia(s) para o vencimento`}` };
  if (days <= 5) return { tone: 'warning', Icon: Clock, label: `${days} dias para o vencimento` };
  return { tone: 'success', Icon: CheckCircle, label: `${days} dias para o vencimento` };
}

const slaToneClass: Record<SlaInfo['tone'], string> = {
  success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  danger: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30',
  critical: 'bg-red-700/15 text-red-800 dark:text-red-300 border-red-700/40',
  done: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
};

// ---- Portal lookup ----
function getObligationPortal(title: string, description?: string | null): { url: string; label: string } | null {
  const t = `${title || ''} ${description || ''}`.toUpperCase();
  if (/\bDAS\b|PGDAS/.test(t)) return { url: 'https://www8.receita.fazenda.gov.br/SimplesNacional/', label: 'Portal Simples Nacional' };
  if (/DCTFWEB|ESOCIAL|EFD[- ]?REINF|REINF/.test(t)) return { url: 'https://cav.receita.fazenda.gov.br/', label: 'Portal e-CAC' };
  if (/FGTS/.test(t)) return { url: 'https://conectividadesocial.caixa.gov.br/', label: 'Conectividade Social' };
  if (/\bDCTF\b|\bECF\b|\bEFD\b|SPED/.test(t)) return { url: 'https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/sped-sistema-publico-de-escrituracao-digital', label: 'Portal SPED' };
  return null;
}

// ---- Activity timeline ----
type TimelineEvent = {
  at: string;
  Icon: typeof Plus;
  iconClass: string;
  text: string;
};

function buildTimeline(task: any, profiles: { id: string; full_name: string | null }[]): TimelineEvent[] {
  const nameOf = (id: string | null | undefined) => (id ? profiles.find(p => p.id === id)?.full_name || '—' : '—');
  const events: TimelineEvent[] = [];
  if (task.created_at) {
    events.push({
      at: task.created_at,
      Icon: Plus,
      iconClass: 'text-muted-foreground bg-muted',
      text: task.is_auto_generated ? 'Tarefa criada automaticamente' : 'Tarefa criada',
    });
  }
  if (task.original_responsible_id && task.original_responsible_id !== task.responsible_id) {
    events.push({
      at: task.updated_at || task.created_at,
      Icon: UserCog,
      iconClass: 'text-purple-700 bg-purple-500/15',
      text: `Responsável alterado de ${nameOf(task.original_responsible_id)} para ${nameOf(task.responsible_id)}`,
    });
  }
  if (task.attachment_url) {
    events.push({
      at: task.updated_at || task.created_at,
      Icon: Paperclip,
      iconClass: 'text-amber-700 bg-amber-500/15',
      text: 'Arquivo anexado',
    });
  }
  if (task.status === 'concluido') {
    events.push({
      at: task.completed_at || task.updated_at || task.created_at,
      Icon: CheckCircle2,
      iconClass: 'text-emerald-700 bg-emerald-500/15',
      text: 'Tarefa concluída',
    });
  } else if (task.updated_at && task.updated_at !== task.created_at) {
    events.push({
      at: task.updated_at,
      Icon: ArrowRight,
      iconClass: 'text-blue-700 bg-blue-500/15',
      text: `Status atual: ${task.status}`,
    });
  }
  return events.sort((a, b) => b.at.localeCompare(a.at));
}

interface TeamNote {
  profile_id: string | null;
  profile_name: string;
  text: string;
  created_at: string;
  legacy?: boolean;
}

function parseNotes(raw: string | null, legacyDate: string): TeamNote[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.filter((n) => n && typeof n.text === 'string').map((n: any) => ({
        profile_id: n.profile_id ?? null,
        profile_name: n.profile_name || '—',
        text: String(n.text),
        created_at: n.created_at || legacyDate,
      }));
    }
  } catch { /* fallthrough to legacy */ }
  return [{ profile_id: null, profile_name: 'Histórico', text: trimmed, created_at: legacyDate, legacy: true }];
}

function initialsOf(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
}

interface TaskDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: FiscalTask | null;
  contacts: { id: string; name: string }[];
  profiles: { id: string; full_name: string | null }[];
  onUpdate: (id: string, data: Partial<FiscalTask>) => void;
  onDelete: (id: string) => void;
  groupTasks?: FiscalTask[] | null;
  onUploadForTask?: (task: FiscalTask, file: File) => Promise<void>;
}

const STATUS_OPTIONS = [
  { value: 'a_fazer', label: 'A Fazer' },
  { value: 'aguardando_cliente', label: 'Aguardando Cliente' },
  { value: 'em_progresso', label: 'Em Progresso' },
  { value: 'concluido', label: 'Concluído' },
];

const statusBadgeClass: Record<string, string> = {
  a_fazer: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
  aguardando_cliente: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
  em_progresso: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30',
  concluido: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
};

export function TaskDetailModal({ open, onOpenChange, task, contacts, profiles, onUpdate, onDelete, groupTasks, onUploadForTask }: TaskDetailModalProps) {
  const { isColaborador, isSuperAdmin, isAdmin } = useUserRole();
  const { company } = useCompany();
  const { user } = useAuth();
  const companyId = company?.id;
  const { toast } = useToast();
  const canEdit = isSuperAdmin || isAdmin;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('a_fazer');
  const [dueDate, setDueDate] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [notesRaw, setNotesRaw] = useState<string | null>(null);
  const [newNote, setNewNote] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setStatus(task.status);
      setDueDate(task.due_date);
      setResponsibleId(task.responsible_id || '');
      setNotesRaw(task.notes ?? null);
      setNewNote('');
      setAttachmentUrl(task.attachment_url);
    }
  }, [task]);

  // Current user's profile (for authoring notes)
  const { data: currentProfile } = useQuery({
    queryKey: ['current-profile-notes', user?.id],
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

  const teamNotes = useMemo<TeamNote[]>(() => {
    if (!task) return [];
    const list = parseNotes(notesRaw, task.created_at);
    return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [notesRaw, task]);

  if (!task) return null;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `fiscal/${companyId}/${task.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('transaction-attachments')
        .upload(path, file);
      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('transaction-attachments')
        .getPublicUrl(path);

      setAttachmentUrl(urlData.publicUrl);
      setStatus('concluido');
      onUpdate(task.id, { attachment_url: urlData.publicUrl, status: 'concluido' });
      toast({ title: '✅ Anexo adicionado. Tarefa marcada como concluída.' });
    } catch {
      toast({ title: 'Erro ao enviar anexo', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveTaskInfo = () => {
    if (!canEdit) return;
    if (status === 'concluido' && !attachmentUrl) {
      toast({ title: 'Anexo obrigatório para concluir', variant: 'destructive' });
      return;
    }
    onUpdate(task.id, {
      title,
      description: description || null,
      due_date: dueDate,
      responsible_id: responsibleId || null,
      status: status as FiscalTask['status'],
    });
    toast({ title: '✅ Tarefa atualizada.' });
  };

  const handleAddNote = () => {
    const text = newNote.trim();
    if (!text) return;
    const authorName = currentProfile?.full_name || currentProfile?.email?.split('@')[0] || 'Usuário';
    const entry: TeamNote = {
      profile_id: currentProfile?.id ?? null,
      profile_name: authorName,
      text,
      created_at: new Date().toISOString(),
    };
    const next = [...teamNotes.filter((n) => !n.legacy || true), entry];
    // Persist as JSON array (legacy item is included so it survives)
    const serializable = next.map(({ legacy, ...rest }) => rest);
    const json = JSON.stringify(serializable);
    setNotesRaw(json);
    setNewNote('');
    onUpdate(task.id, { notes: json });
    toast({ title: '✅ Nota adicionada.' });
  };

  const handleMarkComplete = () => {
    if (!attachmentUrl) {
      toast({ title: 'Anexe um arquivo antes de concluir', variant: 'destructive' });
      return;
    }
    onUpdate(task.id, { status: 'concluido' });
    onOpenChange(false);
  };


  const contactName = contacts.find(c => c.id === task.contact_id)?.name || '—';
  const responsibleName = profiles.find(p => p.id === responsibleId)?.full_name || '—';
  const competencia = task.due_date ? format(parseISO(task.due_date), 'MM/yyyy') : '—';

  const sla = getSlaInfo(task);
  const SlaIcon = sla.Icon;
  const portal = getObligationPortal(title, description);
  const taskAny = task as any;
  const originalResponsibleId: string | null = taskAny.original_responsible_id ?? null;
  const wasTransferred = !!originalResponsibleId && originalResponsibleId !== task.responsible_id;
  const originalResponsibleName = originalResponsibleId
    ? profiles.find(p => p.id === originalResponsibleId)?.full_name || '—'
    : null;
  const transferDateLabel = taskAny.updated_at
    ? format(parseISO(taskAny.updated_at), 'dd/MM', { locale: ptBR })
    : '';
  const timeline = buildTimeline(task, profiles);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="space-y-2 pb-4">
          <SheetTitle className="text-2xl">{contactName}</SheetTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={statusBadgeClass[status]}>
              {STATUS_OPTIONS.find(s => s.value === status)?.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Vencimento: {dueDate ? format(parseISO(dueDate), 'dd/MM/yyyy') : '—'}
            </span>
          </div>
          <div
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${slaToneClass[sla.tone]} ${sla.pulse ? 'animate-pulse' : ''}`}
          >
            <SlaIcon className="w-4 h-4 shrink-0" />
            <span>{sla.label}</span>
          </div>
          {wasTransferred && (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 w-fit">
              Originalmente atribuída a {originalResponsibleName}
            </Badge>
          )}
        </SheetHeader>


        <div className="space-y-6 pb-8">
          {/* Informações da tarefa */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Informações da Tarefa</h3>

            <div>
              <Label>Obrigação</Label>
              {groupTasks && groupTasks.length > 1 ? (
                <p className="text-sm text-foreground mt-1">{groupTasks.length} obrigações</p>
              ) : canEdit ? (
                <Input value={title} onChange={e => setTitle(e.target.value)} />
              ) : (
                <p className="text-sm text-foreground mt-1">{title}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cliente</Label>
                <p className="text-sm text-foreground mt-1">{contactName}</p>
              </div>
              <div>
                <Label>Competência</Label>
                <p className="text-sm text-foreground mt-1">{competencia}</p>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <Label>Responsável</Label>
                {wasTransferred && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <UserCog className="w-3.5 h-3.5 text-amber-600 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Transferida de {originalResponsibleName}
                        {transferDateLabel ? ` em ${transferDateLabel}` : ''}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              {canEdit ? (
                <Select value={responsibleId} onValueChange={setResponsibleId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {profiles.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name || 'Sem nome'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-foreground mt-1">{responsibleName}</p>
              )}
            </div>


            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data de Vencimento</Label>
                {canEdit ? (
                  <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                ) : (
                  <p className="text-sm text-foreground mt-1">{dueDate ? format(parseISO(dueDate), 'dd/MM/yyyy') : '—'}</p>
                )}
              </div>
              <div>
                <Label>Status</Label>
                {canEdit ? (
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline" className={`mt-1 ${statusBadgeClass[status]}`}>
                    {STATUS_OPTIONS.find(s => s.value === status)?.label}
                  </Badge>
                )}
              </div>
            </div>

            {canEdit && (
              <div>
                <Label>Descrição</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <Button size="sm" onClick={handleSaveTaskInfo}>Salvar alterações</Button>
              )}
              {portal && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  asChild
                >
                  <a href={portal.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5" />
                    {portal.label}
                  </a>
                </Button>
              )}
            </div>
          </section>

          <Separator />

          {/* Checklist de documentos */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Checklist de Documentos</h3>

            {groupTasks && groupTasks.length > 1 ? (
              <div className="rounded-md border border-border/50 p-3 space-y-2">
                {groupTasks.map((gt) => (
                  <ChecklistRow
                    key={gt.id}
                    task={gt}
                    onUpload={onUploadForTask}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-border/50 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {attachmentUrl ? (
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-sm border border-muted-foreground/40 shrink-0" />
                    )}
                    <span className="text-sm truncate">{title}</span>
                  </div>
                  {attachmentUrl ? (
                    <a
                      href={attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary underline shrink-0 inline-flex items-center gap-1"
                    >
                      <Paperclip className="w-3 h-3" /> Ver anexo
                    </a>
                  ) : (
                    <Label htmlFor="task-attachment-detail" className="cursor-pointer shrink-0">
                      <div className="inline-flex items-center gap-1 px-2 py-1 rounded border border-dashed border-border hover:bg-muted/50 text-xs">
                        <Upload className="w-3 h-3" />
                        {uploading ? 'Enviando...' : '📎 Anexar'}
                      </div>
                    </Label>
                  )}
                  <input
                    id="task-attachment-detail"
                    type="file"
                    className="hidden"
                    onChange={handleUpload}
                    disabled={uploading}
                  />
                </div>
                {attachmentUrl && (
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                    ✅ Documento anexado
                  </Badge>
                )}
              </div>
            )}
          </section>

          <Separator />

          {/* Notas da Equipe */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Notas da Equipe</h3>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {teamNotes.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Nenhuma nota ainda.</p>
              ) : (
                teamNotes.map((n, idx) => (
                  <div key={idx} className="flex gap-2 rounded-md border border-border/50 bg-muted/20 p-2.5">
                    <Avatar className="w-7 h-7 shrink-0">
                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                        {initialsOf(n.profile_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-foreground">{n.profile_name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {format(parseISO(n.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                        {n.legacy && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0">legado</Badge>
                        )}
                      </div>
                      <p className="text-xs text-foreground whitespace-pre-wrap mt-0.5">{n.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-2 items-end">
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={2}
                placeholder="Escreva uma nota para a equipe..."
                className="flex-1"
              />
              <Button size="sm" onClick={handleAddNote} disabled={!newNote.trim()} className="gap-1.5">
                <Send className="w-3.5 h-3.5" /> Adicionar
              </Button>
            </div>
          </section>

          <Separator />

          {/* Histórico de Atividade */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Histórico</h3>
            {timeline.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Sem eventos registrados.</p>
            ) : (
              <ol className="relative space-y-3 border-l border-border/60 pl-4">
                {timeline.map((ev, idx) => {
                  const Ico = ev.Icon;
                  return (
                    <li key={idx} className="relative">
                      <span className={`absolute -left-[1.4rem] flex items-center justify-center w-5 h-5 rounded-full ${ev.iconClass}`}>
                        <Ico className="w-3 h-3" />
                      </span>
                      <div className="text-xs text-foreground">{ev.text}</div>
                      <div className="text-[10px] text-muted-foreground" title={format(parseISO(ev.at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}>
                        {formatDistanceToNow(parseISO(ev.at), { locale: ptBR, addSuffix: true })}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <Separator />



          {/* Footer actions */}
          <div className="flex justify-between pt-2">
            <div>
              {canEdit && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => { onDelete(task.id); onOpenChange(false); }}
                >
                  <Trash2 className="w-4 h-4" /> Excluir tarefa
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {isColaborador && task.status !== 'concluido' && (
                <Button size="sm" variant="outline" onClick={handleMarkComplete} className="gap-1.5">
                  <CheckCircle className="w-4 h-4" />
                  Concluir
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ChecklistRow({
  task,
  onUpload,
}: {
  task: FiscalTask;
  onUpload?: (task: FiscalTask, file: File) => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const done = task.status === 'concluido' || !!task.attachment_url;
  const inputId = `chk-${task.id}`;

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpload) return;
    try {
      setUploading(true);
      await onUpload(task, file);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {done ? (
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
        ) : (
          <div className="w-4 h-4 rounded-sm border border-muted-foreground/40 shrink-0" />
        )}
        <span className={`text-sm truncate ${done ? 'line-through text-muted-foreground' : ''}`}>
          {task.title}
        </span>
      </div>
      {done && task.attachment_url ? (
        <a
          href={task.attachment_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary underline shrink-0 inline-flex items-center gap-1"
        >
          <Paperclip className="w-3 h-3" /> Ver anexo
        </a>
      ) : done ? (
        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 shrink-0">
          ✅ Anexado
        </Badge>
      ) : (
        <>
          <Label htmlFor={inputId} className="cursor-pointer shrink-0">
            <div className="inline-flex items-center gap-1 px-2 py-1 rounded border border-dashed border-border hover:bg-muted/50 text-xs">
              <Upload className="w-3 h-3" />
              {uploading ? 'Enviando...' : '📎 Anexar'}
            </div>
          </Label>
          <input id={inputId} type="file" className="hidden" onChange={handle} disabled={uploading} />
        </>
      )}
    </div>
  );
}
