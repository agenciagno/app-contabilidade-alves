import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BellRing, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useCompany } from '@/hooks/useCompany';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

type TargetType = 'all' | 'company' | 'user';

interface CompanyRow { id: string; name: string; cnpj: string | null }
interface ProfileRow { user_id: string; full_name: string | null; email: string | null }

export default function CentralNotificacoes() {
  const { isSuperAdmin, isLoading: roleLoading } = useUserRole();
  const { company } = useCompany();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/');
  const [targetType, setTargetType] = useState<TargetType>('all');
  const [companyId, setCompanyId] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [sending, setSending] = useState(false);

  // Empresas da carteira (clientes) + a própria CA, para o seletor.
  const { data: clientCompanies = [] } = useQuery({
    queryKey: ['notify-client-companies'],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_client_companies');
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
    return { type: 'user' as const, userId };
  };

  const validate = () => {
    if (!title.trim()) return 'Informe um título.';
    if (targetType === 'company' && !companyId) return 'Selecione uma empresa.';
    if (targetType === 'user' && !userId) return 'Selecione um usuário.';
    return null;
  };

  const send = async (overrideTarget?: { type: 'user'; userId: string }) => {
    const err = !overrideTarget && validate();
    if (err) { toast.error(err); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-push', {
        body: {
          title: title.trim() || 'Contabilidade Alves',
          body: body.trim(),
          url: url.trim() || '/',
          target: overrideTarget ?? buildTarget(),
        },
      });
      if (error) throw error;
      const r = data as { sent?: number; failed?: number; cleaned?: number; note?: string };
      if (r?.note === 'no_tokens' || (r?.sent ?? 0) === 0) {
        toast.warning('Nenhum dispositivo com notificações ativas para esse destinatário.');
      } else {
        toast.success(`Enviado: ${r.sent} dispositivo(s)${r.failed ? `, ${r.failed} falha(s)` : ''}.`);
      }
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

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <BellRing className="w-5 h-5 text-primary" />
          Central de Notificações
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Envie uma notificação push para quem instalou o app e ativou notificações.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova notificação</CardTitle>
          <CardDescription>Título e mensagem aparecem na notificação do dispositivo.</CardDescription>
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
            <Label htmlFor="notify-url">Abrir ao tocar (rota)</Label>
            <Input
              id="notify-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="/"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Destinatário</Label>
            <Select value={targetType} onValueChange={(v) => setTargetType(v as TargetType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos da carteira</SelectItem>
                <SelectItem value="company">Uma empresa</SelectItem>
                <SelectItem value="user">Um usuário</SelectItem>
              </SelectContent>
            </Select>
          </div>

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

          <div className="flex items-center gap-2 pt-2">
            <Button onClick={() => send()} disabled={sending} className="gap-1.5">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar
            </Button>
            <Button variant="outline" onClick={sendTestToMe} disabled={sending}>
              Enviar teste para mim
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
