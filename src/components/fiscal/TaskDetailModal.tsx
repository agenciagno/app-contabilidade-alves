import { useState, useEffect, useMemo, useRef } from 'react';
import { format, parseISO, differenceInCalendarDays, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  Plus, ArrowRight, UserCog, Hash, AtSign,
} from 'lucide-react';
import { FiscalTask } from '@/hooks/useFiscalTasks';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { notifyTaskMention } from '@/lib/fiscal-notifications';

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
  mentions?: { profile_id: string; name: string }[];
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
        mentions: Array.isArray(n.mentions) ? n.mentions : undefined,
      }));
    }
  } catch { /* fallthrough to legacy */ }
  return [{ profile_id: null, profile_name: 'Histórico', text: trimmed, created_at: legacyDate, legacy: true }];
}

function initialsOf(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
}

// Renders note text with @mentions highlighted
function renderNoteText(text: string, mentions: { name: string }[] = []) {
  if (!mentions.length) return <>{text}</>;
  const names = mentions.map((m) => m.name).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`@(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  const parts: (string | { mention: string })[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    parts.push({ mention: m[0] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return (
    <>
      {parts.map((p, i) =>
        typeof p === 'string'
          ? <span key={i}>{p}</span>
          : <span key={i} className="text-primary font-medium">{p.mention}</span>
      )}
    </>
  );
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

  // Completion flow (single confirm dialog)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [protocolNumber, setProtocolNumber] = useState('');
  const [completionNotesInput, setCompletionNotesInput] = useState('');

  // @ mentions state for the new note
  const newNoteRef = useRef<HTMLTextAreaElement | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [pendingMentions, setPendingMentions] = useState<{ profile_id: string; name: string }[]>([]);


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
      setConfirmOpen(false);
      setProtocolNumber('');
      setCompletionNotesInput('');
      setPendingMentions([]);
      setMentionQuery(null);
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
    if (status === 'concluido' && !attachmentUrl && task.status !== 'concluido') {
      // Open confirm dialog to capture protocol/notes
      setConfirmOpen(true);
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

  // --- Mentions: detect @ and show popover ---
  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewNote(value);
    const caret = e.target.selectionStart ?? value.length;
    const upto = value.slice(0, caret);
    const m = upto.match(/(?:^|\s)@([\p{L}\p{N} ]{0,30})$/u);
    setMentionQuery(m ? m[1] : null);
  };

  const insertMention = (profile: { id: string; full_name: string | null }) => {
    const name = profile.full_name || 'Usuário';
    const ta = newNoteRef.current;
    const caret = ta?.selectionStart ?? newNote.length;
    const before = newNote.slice(0, caret);
    const after = newNote.slice(caret);
    const replaced = before.replace(/(?:^|\s)@([\p{L}\p{N} ]{0,30})$/u, (full, _q) => {
      const lead = full.startsWith(' ') ? ' ' : (full.startsWith('@') ? '' : '');
      return `${lead}@${name} `;
    });
    const next = replaced + after;
    setNewNote(next);
    setMentionQuery(null);
    setPendingMentions((prev) =>
      prev.some((p) => p.profile_id === profile.id) ? prev : [...prev, { profile_id: profile.id, name }]
    );
    setTimeout(() => {
      ta?.focus();
      const pos = replaced.length;
      ta?.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleAddNote = async () => {
    const text = newNote.trim();
    if (!text) return;
    const authorName = currentProfile?.full_name || currentProfile?.email?.split('@')[0] || 'Usuário';
    // Keep only mentions still present in text
    const effectiveMentions = pendingMentions.filter((m) => text.includes(`@${m.name}`));
    const entry: TeamNote = {
      profile_id: currentProfile?.id ?? null,
      profile_name: authorName,
      text,
      created_at: new Date().toISOString(),
      mentions: effectiveMentions.length ? effectiveMentions : undefined,
    };
    const next = [...teamNotes, entry];
    const serializable = next.map(({ legacy, ...rest }) => rest);
    const json = JSON.stringify(serializable);
    setNotesRaw(json);
    setNewNote('');
    setPendingMentions([]);
    setMentionQuery(null);
    onUpdate(task.id, { notes: json });
    toast({ title: '✅ Nota adicionada.' });

    if (effectiveMentions.length && companyId) {
      const contactName = contacts.find((c) => c.id === task.contact_id)?.name || '—';
      await notifyTaskMention({
        taskId: task.id,
        taskTitle: task.title,
        contactName,
        mentionedProfileIds: effectiveMentions.map((m) => m.profile_id),
        mentionedByName: authorName,
        companyId,
        actorUserId: user?.id ?? null,
      });
    }
  };

  const handleOpenCompletion = () => {
    if (attachmentUrl) {
      onUpdate(task.id, {
        status: 'concluido',
        completion_type: 'attachment',
        completed_at: new Date().toISOString(),
      } as any);
      onOpenChange(false);
      return;
    }
    setProtocolNumber('');
    setCompletionNotesInput('');
    setConfirmOpen(true);
  };

  const handleConfirmCompletion = () => {
    const proto = protocolNumber.trim();
    const obs = completionNotesInput.trim();
    if (!proto && obs.length < 10) {
      toast({
        title: 'Informe um protocolo ou uma observação com pelo menos 10 caracteres',
        variant: 'destructive',
      });
      return;
    }
    const completion_type = proto ? 'protocol' : 'transmitted';
    onUpdate(task.id, {
      status: 'concluido',
      completion_type,
      protocol_number: proto || null,
      completion_notes: obs || null,
      completed_at: new Date().toISOString(),
    } as any);
    setConfirmOpen(false);
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
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto px-6 py-6">
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
                {task.status === 'concluido' && (() => {
                  const ct = (task as any).completion_type as string | null;
                  if (ct === 'protocol') {
                    return (
                      <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30 inline-flex items-center gap-1">
                        <Hash className="w-3 h-3" /> Protocolo: {(task as any).protocol_number || '—'}
                      </Badge>
                    );
                  }
                  if (ct === 'transmitted') {
                    return (
                      <div className="space-y-1">
                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 inline-flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Transmitida
                        </Badge>
                        {(task as any).completion_notes && (
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap">{(task as any).completion_notes}</p>
                        )}
                      </div>
                    );
                  }
                  return attachmentUrl ? (
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 inline-flex items-center gap-1">
                      <Paperclip className="w-3 h-3" /> Documento anexado
                    </Badge>
                  ) : null;
                })()}
                {task.status !== 'concluido' && attachmentUrl && (
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                    ✅ Documento anexado
                  </Badge>
                )}
              </div>
            )}
          </section>

          {/* Painel de Conclusão antigo removido — agora usa Dialog (ver final do componente) */}


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
                      <p className="text-xs text-foreground whitespace-pre-wrap mt-0.5">
                        {renderNoteText(n.text, n.mentions ?? [])}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-2 items-end">
              <Popover open={mentionQuery !== null} onOpenChange={(o) => !o && setMentionQuery(null)}>
                <PopoverTrigger asChild>
                  <div className="flex-1 relative">
                    <Textarea
                      ref={newNoteRef}
                      value={newNote}
                      onChange={handleNoteChange}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setMentionQuery(null);
                      }}
                      rows={2}
                      placeholder="Escreva uma nota — use @ para mencionar a equipe..."
                      className="w-full pr-8"
                    />
                    <AtSign className="absolute right-2 top-2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" />
                  </div>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  side="top"
                  className="w-64 p-1"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  {(() => {
                    const q = (mentionQuery ?? '').toLowerCase().trim();
                    const filtered = profiles
                      .filter((p) => (p.full_name ?? '').toLowerCase().includes(q))
                      .slice(0, 6);
                    if (filtered.length === 0) {
                      return <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum membro encontrado</div>;
                    }
                    return filtered.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => insertMention(p)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/60 text-left"
                      >
                        <Avatar className="w-6 h-6">
                          <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                            {initialsOf(p.full_name || '?')}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm truncate">{p.full_name || 'Sem nome'}</span>
                      </button>
                    ));
                  })()}
                </PopoverContent>
              </Popover>
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
              {task.status !== 'concluido' && (
                <Button size="sm" variant="outline" onClick={handleOpenCompletion} className="gap-1.5">
                  <CheckCircle className="w-4 h-4" />
                  Concluir Tarefa
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>

      {/* Dialog de confirmação de conclusão sem anexo */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Concluir tarefa</DialogTitle>
            <DialogDescription>
              Como esta tarefa não tem anexo, informe o <strong>número de protocolo</strong> e/ou
              uma <strong>observação</strong> (mínimo 10 caracteres) para justificar a conclusão.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Número do protocolo (opcional)</Label>
              <Input
                value={protocolNumber}
                onChange={(e) => setProtocolNumber(e.target.value)}
                placeholder="Ex: 2.06.000.123456-7"
                maxLength={100}
              />
            </div>
            <div>
              <Label className="text-xs">Observação (opcional)</Label>
              <Textarea
                value={completionNotesInput}
                onChange={(e) => setCompletionNotesInput(e.target.value)}
                rows={3}
                placeholder="Descreva como/onde a obrigação foi cumprida..."
                maxLength={1000}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Se não houver protocolo, a observação precisa ter pelo menos 10 caracteres.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirmCompletion} className="gap-1.5">
              <CheckCircle className="w-4 h-4" /> Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
