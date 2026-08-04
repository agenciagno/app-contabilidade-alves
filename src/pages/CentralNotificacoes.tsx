import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Loader2, X, CalendarClock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PageHeader } from '@/components/ds';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useCompany } from '@/hooks/useCompany';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

type TargetType = 'all' | 'company' | 'user' | 'users';
type Channel = 'push' | 'popup' | 'both';
type ScheduleMode = 'now' | 'schedule';

interface CompanyRow { id: string; name: string; cnpj: string | null }
interface ProfileRow { user_id: string; full_name: string | null; email: string | null }
interface InternalUserRow extends ProfileRow { department: string | null }
interface SavedListRow { id: string; name: string; user_ids: string[] }
interface ScheduledRow {
  id: string;
  title: string;
  body: string | null;
  channel: Channel;
  target_type: TargetType;
  target_company_id: string | null;
  target_user_id: string | null;
  target_user_ids: string[] | null;
  scheduled_at: string;
}

const CHANNEL_LABEL: Record<Channel, string> = {
  push: 'Push (notificação do dispositivo)',
  popup: 'Pop-up (dentro do sistema)',
  both: 'Push + pop-up',
};

// Os 8 valores fixos de profiles.department (mesmo CHECK do banco).
const DEPARTMENTS = [
  'Departamento Contábil', 'Departamento Financeiro', 'Departamento de Legalização/Comercial',
  'Departamento Pessoal', 'Departamento Fiscal', 'Diretoria', 'Departamento de Tecnologia', 'Suporte',
];

// Resolve os user_id/company_id alvo a partir do mesmo padrão all/company/user/users
// usado pela send-push, pra fazer o fan-out do canal pop-up direto em `notifications`.
async function resolvePopupRecipients(target: { type: TargetType; companyId?: string; userId?: string; userIds?: string[] }) {
  if (target.type === 'user') {
    if (!target.userId) return [];
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, company_id')
      .eq('user_id', target.userId)
      .maybeSingle();
    if (error) throw error;
    return data ? [data] : [];
  }
  if (target.type === 'users') {
    if (!target.userIds || target.userIds.length === 0) return [];
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, company_id')
      .in('user_id', target.userIds);
    if (error) throw error;
    return data ?? [];
  }
  let q = supabase.from('profiles').select('user_id, company_id');
  if (target.type === 'company' && target.companyId) {
    q = q.eq('company_id', target.companyId);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export default function CentralNotificacoes() {
  const { isSuperAdmin, isLoading: roleLoading } = useUserRole();
  const { company } = useCompany();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/');
  const [buttonLabel, setButtonLabel] = useState('');
  const [channel, setChannel] = useState<Channel>('push');
  const [targetType, setTargetType] = useState<TargetType>('all');
  const [companyId, setCompanyId] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [listName, setListName] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('now');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [sending, setSending] = useState(false);

  // Empresas da carteira (clientes) + a própria CA, para o seletor.
  const { data: clientCompanies = [] } = useQuery({
    queryKey: ['notify-client-companies'],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, cnpj')
        .eq('is_internal', false);
      if (error) throw error;
      return (data as CompanyRow[]) ?? [];
    },
  });

  const companies = useMemo<CompanyRow[]>(() => {
    const own = company?.id
      ? [{ id: company.id, name: `${company.name} (interno)`, cnpj: company.cnpj ?? null }]
      : [];
    return [...own, ...clientCompanies];
  }, [company, clientCompanies]);

  // Usuários da empresa selecionada (para alvo = usuário).
  const { data: users = [] } = useQuery({
    queryKey: ['notify-company-users', companyId],
    enabled: isSuperAdmin && targetType === 'user' && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .eq('company_id', companyId);
      if (error) throw error;
      return (data as ProfileRow[]) ?? [];
    },
  });

  // Usuários internos da CA (para alvo = vários usuários / atalho por departamento).
  const { data: internalUsers = [] } = useQuery({
    queryKey: ['notify-internal-users', company?.id],
    enabled: isSuperAdmin && targetType === 'users' && !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, email, department')
        .eq('company_id', company!.id)
        .order('full_name');
      if (error) throw error;
      return (data as InternalUserRow[]) ?? [];
    },
  });

  // Listas de usuários salvas, reutilizáveis.
  const { data: savedLists = [] } = useQuery({
    queryKey: ['notify-saved-lists'],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_lists')
        .select('id, name, user_ids')
        .order('name');
      if (error) throw error;
      return (data as SavedListRow[]) ?? [];
    },
  });

  const saveListMutation = useMutation({
    mutationFn: async () => {
      if (!listName.trim()) throw new Error('Informe um nome pra lista.');
      const { error } = await supabase
        .from('notification_lists')
        .upsert({ name: listName.trim(), user_ids: Array.from(selectedUserIds) }, { onConflict: 'name' });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Lista salva.');
      queryClient.invalidateQueries({ queryKey: ['notify-saved-lists'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao salvar lista.'),
  });

  const addDepartment = (dept: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      internalUsers.filter((u) => u.department === dept).forEach((u) => next.add(u.user_id));
      return next;
    });
  };

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const loadList = (listId: string) => {
    setSelectedListId(listId);
    const list = savedLists.find((l) => l.id === listId);
    if (!list) return;
    setSelectedUserIds(new Set(list.user_ids));
    setListName(list.name);
  };

  // Agendamentos pendentes (ainda não disparados).
  const { data: pending = [] } = useQuery({
    queryKey: ['notify-pending-scheduled'],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scheduled_notifications')
        .select('id, title, body, channel, target_type, target_company_id, target_user_id, target_user_ids, scheduled_at')
        .eq('status', 'pending')
        .order('scheduled_at', { ascending: true });
      if (error) throw error;
      return (data as ScheduledRow[]) ?? [];
    },
  });

  const pendingUserIds = useMemo(
    () => Array.from(new Set(pending.filter((p) => p.target_type === 'user' && p.target_user_id).map((p) => p.target_user_id as string))),
    [pending]
  );
  const { data: pendingUsers = [] } = useQuery({
    queryKey: ['notify-pending-user-names', pendingUserIds],
    enabled: pendingUserIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', pendingUserIds);
      if (error) throw error;
      return (data as ProfileRow[]) ?? [];
    },
  });

  const cancelScheduled = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('scheduled_notifications')
        .update({ status: 'cancelled' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notify-pending-scheduled'] });
      toast.success('Agendamento cancelado.');
    },
    onError: (e: any) => toast.error(`Falha ao cancelar: ${e?.message ?? 'erro desconhecido'}`),
  });

  if (!roleLoading && !isSuperAdmin) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Acesso restrito à administração.</p>
      </div>
    );
  }

  const buildTarget = () => {
    if (targetType === 'all') return { type: 'all' as const };
    if (targetType === 'company') return { type: 'company' as const, companyId };
    if (targetType === 'users') return { type: 'users' as const, userIds: Array.from(selectedUserIds) };
    return { type: 'user' as const, userId };
  };

  const scheduledAt = scheduleDate && scheduleTime ? new Date(`${scheduleDate}T${scheduleTime}:00`) : null;

  const validate = () => {
    if (!title.trim()) return 'Informe um título.';
    if (targetType === 'company' && !companyId) return 'Selecione uma empresa.';
    if (targetType === 'user' && !userId) return 'Selecione um usuário.';
    if (targetType === 'users' && selectedUserIds.size === 0) return 'Selecione ao menos um usuário.';
    if (channel !== 'push' && buttonLabel.trim() && !url.trim()) return 'Informe o link do botão.';
    if (scheduleMode === 'schedule') {
      if (!scheduledAt) return 'Informe data e hora do agendamento.';
      if (scheduledAt.getTime() <= Date.now()) return 'Escolha uma data/hora futura.';
    }
    return null;
  };

  const send = async (overrideTarget?: { type: 'user'; userId: string }) => {
    const err = !overrideTarget && validate();
    if (err) { toast.error(err); return; }
    setSending(true);
    try {
      const target = overrideTarget ?? buildTarget();
      const finalTitle = title.trim() || 'Contabilidade Alves';
      const finalBody = body.trim();
      const finalUrl = url.trim() || '/';
      const finalButtonLabel = channel !== 'push' ? (buttonLabel.trim() || null) : null;

      if (scheduleMode === 'schedule' && !overrideTarget) {
        const { error } = await supabase.from('scheduled_notifications').insert({
          title: finalTitle,
          body: finalBody,
          action_url: finalUrl,
          button_label: finalButtonLabel,
          channel,
          target_type: target.type,
          target_company_id: target.type === 'company' ? target.companyId : null,
          target_user_id: target.type === 'user' ? target.userId : null,
          target_user_ids: target.type === 'users' ? target.userIds : null,
          scheduled_at: scheduledAt!.toISOString(),
        });
        if (error) throw error;
        toast.success(`Agendado para ${format(scheduledAt!, "dd/MM 'às' HH:mm", { locale: ptBR })}.`);
        queryClient.invalidateQueries({ queryKey: ['notify-pending-scheduled'] });
        return;
      }

      let pushSummary = '';
      if (channel === 'push' || channel === 'both') {
        const { data, error } = await supabase.functions.invoke('send-push', {
          body: { title: finalTitle, body: finalBody, url: finalUrl, target },
        });
        if (error) throw error;
        const r = data as { sent?: number; failed?: number; note?: string };
        pushSummary = r?.note === 'no_tokens' || (r?.sent ?? 0) === 0
          ? 'push: nenhum dispositivo ativo'
          : `push: ${r.sent} dispositivo(s)${r.failed ? `, ${r.failed} falha(s)` : ''}`;
      }

      let popupCount = 0;
      if (channel === 'popup' || channel === 'both') {
        const recipients = await resolvePopupRecipients(target);
        if (recipients.length > 0) {
          const rows = recipients.map((r) => ({
            user_id: r.user_id,
            company_id: r.company_id,
            type: 'popup',
            title: finalTitle,
            body: finalBody,
            action_url: finalUrl,
            button_label: finalButtonLabel,
          }));
          const { error } = await supabase.from('notifications').insert(rows);
          if (error) throw error;
          popupCount = rows.length;
        }
      }

      const parts = [pushSummary, channel !== 'push' ? `pop-up: ${popupCount} usuário(s)` : ''].filter(Boolean);
      toast.success(`Enviado — ${parts.join(' · ')}`);
    } catch (e: any) {
      toast.error(`Falha ao enviar: ${e?.message ?? 'erro desconhecido'}`);
    } finally {
      setSending(false);
    }
  };

  const sendTestToMe = async () => {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) { toast.error('Sessão não encontrada.'); return; }
    if (!title.trim()) setTitle('Teste de notificação');
    await send({ type: 'user', userId: uid });
  };

  const targetLabel = (row: ScheduledRow) => {
    if (row.target_type === 'all') return 'Todos da carteira';
    if (row.target_type === 'company') {
      const c = companies.find((c) => c.id === row.target_company_id);
      return c ? `Empresa: ${c.name}` : 'Empresa';
    }
    if (row.target_type === 'users') {
      return `${row.target_user_ids?.length ?? 0} usuário(s)`;
    }
    const u = pendingUsers.find((u) => u.user_id === row.target_user_id);
    return u ? `Usuário: ${u.full_name || u.email}` : 'Usuário';
  };

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        kicker="~/tech · notificações"
        title="Central de notificações."
        subtitle="Envie push, pop-up in-app, ou os dois — agora ou agendado."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova notificação</CardTitle>
          <CardDescription>Título e mensagem aparecem no push e/ou no pop-up, conforme o canal.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="notify-title">Título</Label>
            <Input
              id="notify-title"
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Boleto disponível"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notify-body">Mensagem</Label>
            <Textarea
              id="notify-body"
              value={body}
              maxLength={300}
              rows={3}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Ex.: Seu boleto de julho já está disponível no portal."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Canal</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => (
                  <SelectItem key={c} value={c}>{CHANNEL_LABEL[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="notify-url">Link (opcional)</Label>
              <Input
                id="notify-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="/"
              />
            </div>
            {channel !== 'push' && (
              <div className="space-y-1.5">
                <Label htmlFor="notify-button-label">Texto do botão (pop-up)</Label>
                <Input
                  id="notify-button-label"
                  value={buttonLabel}
                  maxLength={40}
                  onChange={(e) => setButtonLabel(e.target.value)}
                  placeholder="Ex.: Ver boleto"
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Destinatário</Label>
            <Select value={targetType} onValueChange={(v) => setTargetType(v as TargetType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos da carteira</SelectItem>
                <SelectItem value="company">Uma empresa</SelectItem>
                <SelectItem value="user">Um usuário</SelectItem>
                <SelectItem value="users">Vários usuários</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {targetType === 'users' && (
            <div className="space-y-3 rounded-md border border-border/50 p-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Atalho por departamento</Label>
                <div className="flex flex-wrap gap-1.5">
                  {DEPARTMENTS.map((d) => (
                    <Button
                      key={d}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => addDepartment(d)}
                    >
                      + {d.replace('Departamento de ', '').replace('Departamento ', '')}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-0.5 border-t border-border/40 pt-2">
                {internalUsers.map((u) => (
                  <label key={u.user_id} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                    <Checkbox
                      checked={selectedUserIds.has(u.user_id)}
                      onCheckedChange={() => toggleUser(u.user_id)}
                    />
                    <span className="flex-1 truncate">{u.full_name || u.email}</span>
                    {u.department && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {u.department.replace('Departamento de ', '').replace('Departamento ', '')}
                      </span>
                    )}
                  </label>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-border/40 pt-2">
                <span className="text-xs text-muted-foreground">{selectedUserIds.size} selecionado(s)</span>
                {selectedUserIds.size > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => { setSelectedUserIds(new Set()); setSelectedListId(''); setListName(''); }}
                  >
                    Limpar
                  </Button>
                )}
              </div>

              {savedLists.length > 0 && (
                <Select value={selectedListId} onValueChange={loadList}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Carregar lista salva" /></SelectTrigger>
                  <SelectContent>
                    {savedLists.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name} ({l.user_ids.length})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <div className="flex items-center gap-2">
                <Input
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  placeholder="Nome da lista"
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs shrink-0"
                  disabled={selectedUserIds.size === 0 || saveListMutation.isPending}
                  onClick={() => saveListMutation.mutate()}
                >
                  Salvar lista
                </Button>
              </div>
            </div>
          )}

          {(targetType === 'company' || targetType === 'user') && (
            <div className="space-y-1.5">
              <Label>Empresa</Label>
              <Select value={companyId} onValueChange={(v) => { setCompanyId(v); setUserId(''); }}>
                <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {targetType === 'user' && (
            <div className="space-y-1.5">
              <Label>Usuário</Label>
              <Select value={userId} onValueChange={setUserId} disabled={!companyId}>
                <SelectTrigger><SelectValue placeholder={companyId ? 'Selecione o usuário' : 'Escolha a empresa primeiro'} /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.full_name || u.email || u.user_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Quando</Label>
            <Select value={scheduleMode} onValueChange={(v) => setScheduleMode(v as ScheduleMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="now">Enviar agora</SelectItem>
                <SelectItem value="schedule">Agendar para depois</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scheduleMode === 'schedule' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="notify-date">Data</Label>
                <Input
                  id="notify-date"
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notify-time">Hora</Label>
                <Input
                  id="notify-time"
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button onClick={() => send()} disabled={sending} className="gap-1.5">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {scheduleMode === 'schedule' ? 'Agendar' : 'Enviar'}
            </Button>
            <Button variant="outline" onClick={sendTestToMe} disabled={sending}>
              Enviar teste para mim
            </Button>
          </div>
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-1.5">
              <CalendarClock className="w-4 h-4" />
              Agendados
            </CardTitle>
            <CardDescription>Ainda não disparados — dá pra cancelar até a hora marcada.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-3 border border-border/50 rounded-md px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{row.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(row.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    {' · '}{CHANNEL_LABEL[row.channel]}
                    {' · '}{targetLabel(row)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (window.confirm('Cancelar este agendamento?')) cancelScheduled.mutate(row.id);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
