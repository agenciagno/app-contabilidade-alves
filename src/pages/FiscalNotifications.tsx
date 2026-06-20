import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO, startOfDay, endOfDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { iconForType } from '@/components/notifications/NotificationBell';

interface Row {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
  profile?: { id: string; name: string | null; email: string | null } | null;
}

const TYPE_OPTIONS = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'task_due', label: 'Tarefa próxima do prazo' },
  { value: 'task_overdue', label: 'Tarefa atrasada' },
  { value: 'task_completed', label: 'Tarefa concluída' },
  { value: 'task_assigned', label: 'Tarefa atribuída' },
  { value: 'transfer_start', label: 'Início de cobertura' },
  { value: 'transfer_end', label: 'Fim de cobertura' },
  { value: 'calendar_generated', label: 'Calendário gerado' },
  { value: 'system', label: 'Sistema' },
];

const PERIOD_OPTIONS = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: 'all', label: 'Todo o período' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'unread', label: 'Não lidas' },
  { value: 'read', label: 'Lidas' },
];

export default function FiscalNotifications() {
  const { user } = useAuth();
  const { company } = useCompany();
  const [typeFilter, setTypeFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('30');
  const [statusFilter, setStatusFilter] = useState('all');

  const companyId = (company as any)?.id;

  const { data: profiles = [] } = useQuery({
    queryKey: ['fiscal-notif-profiles', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .eq('company_id', companyId);
      return data ?? [];
    },
    enabled: !!companyId,
  });

  const profileMap = useMemo(() => {
    const m = new Map<string, { name: string | null; email: string | null }>();
    profiles.forEach((p: any) => m.set(p.user_id, { name: p.full_name, email: p.email }));
    return m;
  }, [profiles]);

  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ['fiscal-notifications', companyId, typeFilter, userFilter, periodFilter, statusFilter],
    queryFn: async () => {
      if (!companyId) return [];
      let q = (supabase as any)
        .from('notifications')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(500);

      if (typeFilter !== 'all') q = q.eq('type', typeFilter);
      if (userFilter !== 'all') q = q.eq('user_id', userFilter);
      if (periodFilter !== 'all') {
        const days = parseInt(periodFilter, 10);
        q = q.gte('created_at', startOfDay(subDays(new Date(), days)).toISOString());
      }
      if (statusFilter === 'unread') q = q.is('read_at', null);
      if (statusFilter === 'read') q = q.not('read_at', 'is', null);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    enabled: !!companyId,
  });

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Notificações</h1>
        <p className="text-sm text-muted-foreground">Histórico de notificações enviadas no módulo fiscal</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger><SelectValue placeholder="Colaborador" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os colaboradores</SelectItem>
              {profiles.map((p: any) => (
                <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.email || p.user_id}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">Tipo</TableHead>
                <TableHead>Destinatário</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead className="w-40">Data</TableHead>
                <TableHead className="w-24">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma notificação encontrada</TableCell></TableRow>
              ) : rows.map((r) => {
                const p = profileMap.get(r.user_id);
                return (
                  <TableRow key={r.id}>
                    <TableCell>{iconForType(r.type)}</TableCell>
                    <TableCell className="text-sm">{p?.name || p?.email || '—'}</TableCell>
                    <TableCell className="text-sm font-medium">{r.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-md truncate">{r.body || (r as any).message || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(parseISO(r.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      {r.read_at ? (
                        <Badge variant="secondary">Lida</Badge>
                      ) : (
                        <Badge>Não lida</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
