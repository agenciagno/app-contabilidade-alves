import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, LogOut, RefreshCw, Wifi } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';

function parseDeviceInfo(ua: string | null): string {
  if (!ua) return 'Desconhecido';
  let browser = 'Navegador';
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari')) browser = 'Safari';
  let os = '';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  return os ? `${browser} · ${os}` : browser;
}

export default function ActiveSessionsPanel() {
  const queryClient = useQueryClient();
  const { isSuperAdmin } = useSuperAdmin();
  const [pendingDelete, setPendingDelete] = useState<{ id: string; isSelf: boolean } | null>(null);

  const currentSessionUuid = useMemo(
    () => (typeof window !== 'undefined' ? localStorage.getItem('session_uuid') : null),
    []
  );

  const { data: sessions = [], isLoading, refetch } = useQuery({
    queryKey: ['active-sessions', isSuperAdmin],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('active_sessions')
        .select('id, user_id, company_id, session_uuid, device_info, logged_in_at, last_seen_at')
        .order('last_seen_at', { ascending: false });
      if (error) throw error;

      const userIds = [...new Set((data || []).map((s) => s.user_id))];
      const companyIds = [...new Set((data || []).map((s) => s.company_id).filter(Boolean))];

      const [profilesRes, companiesRes] = await Promise.all([
        userIds.length
          ? supabase.from('profiles').select('user_id, full_name, email').in('user_id', userIds)
          : Promise.resolve({ data: [] as any[] }),
        companyIds.length
          ? supabase.from('companies').select('id, name').in('id', companyIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.user_id, p]));
      const companyMap = new Map((companiesRes.data || []).map((c: any) => [c.id, c]));

      return (data || []).map((s) => ({
        ...s,
        profile: profileMap.get(s.user_id) || null,
        company: companyMap.get(s.company_id) || null,
      }));
    },
    refetchInterval: 30000,
    enabled: isSuperAdmin,
  });

  const disconnectSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase.from('active_sessions').delete().eq('id', sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-sessions'] });
      toast.success('Sessão encerrada com sucesso');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao encerrar sessão');
    },
  });

  const handleDisconnectClick = (sessionId: string, sessionUuid: string) => {
    const isSelf = !!currentSessionUuid && sessionUuid === currentSessionUuid;
    if (isSelf) {
      setPendingDelete({ id: sessionId, isSelf: true });
    } else {
      disconnectSession.mutate(sessionId);
    }
  };

  return (
    <Card className="bg-card border-border/50 mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Wifi className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>Sessões Ativas</CardTitle>
              <CardDescription>Sessões de usuários conectados ao sistema</CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Wifi className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma sessão ativa no momento</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Dispositivo</TableHead>
                <TableHead>Conectado desde</TableHead>
                <TableHead>Última atividade</TableHead>
                <TableHead className="w-[80px]">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session: any) => {
                const isSelf = !!currentSessionUuid && session.session_uuid === currentSessionUuid;
                return (
                  <TableRow key={session.id} className={isSelf ? 'bg-primary/5' : undefined}>
                    <TableCell>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {session.profile?.full_name || 'Usuário'}
                          </span>
                          {isSelf && (
                            <Badge variant="secondary" className="text-[10px]">Esta sessão</Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {session.profile?.email || '-'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {session.company?.name || '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {parseDeviceInfo(session.device_info)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {session.logged_in_at
                        ? format(new Date(session.logged_in_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                        : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {session.last_seen_at
                        ? format(new Date(session.last_seen_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDisconnectClick(session.id, session.session_uuid)}
                        disabled={disconnectSession.isPending}
                        className="text-muted-foreground hover:text-destructive"
                        title="Desconectar"
                      >
                        <LogOut className="w-4 h-4" style={{ color: 'var(--apple-red)' }} />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar esta sessão?</AlertDialogTitle>
            <AlertDialogDescription>
              Você será desconectado imediatamente deste dispositivo e redirecionado para a tela de login.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) disconnectSession.mutate(pendingDelete.id);
                setPendingDelete(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
