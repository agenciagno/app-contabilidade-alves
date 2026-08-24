import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, Upload, User, KeyRound, Mail, Monitor, LogOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useCompany } from '@/hooks/useCompany';
import CompanyDataCard from '@/components/settings/CompanyDataCard';
import { maskCpf, maskPhone, unmaskPhone } from '@/lib/utils';
import { PUBLIC_APP_URL } from '@/lib/environment';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PageHeader, DsBadge, IconBox, tabsListClass, tabsTriggerClass } from '@/components/ds';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function parseDeviceInfo(ua: string | null): string {
  if (!ua) return 'Dispositivo desconhecido';
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
  return os ? `${os} · ${browser}` : browser;
}

/**
 * Minha Conta — substitui o antigo ProfileModal do rodapé do sidebar.
 * Senha aqui é só envio de link por e-mail: nenhuma tela do sistema
 * escreve senha, exceto /redefinir-senha (destino do próprio link).
 *
 * Cliente externo não tem Configurações, então os dados da empresa dele
 * aparecem aqui — mesmo card que a equipe interna vê em Configurações.
 */
export default function MinhaConta() {
  const { user } = useAuth();
  const { avatarUrl, fullName, isColaborador } = useUserRole();
  const { company } = useCompany();

  const isExterno = (company as any)?.is_internal === false;
  const mostrarDadosDaEmpresa = isExterno && !isColaborador;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['minha-conta', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, phone, cpf, full_name')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.first_name ?? '');
    setLastName(profile.last_name ?? '');
    setPhone(maskPhone(profile.phone ?? ''));
    setCpf(maskCpf(profile.cpf ?? ''));
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;
    if (firstName.trim().length < 2) {
      toast.error('Informe seu nome');
      return;
    }
    setSaving(true);
    try {
      // full_name segue sendo o nome de exibição em todo o sistema —
      // mantido derivado de nome + sobrenome.
      const composedName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
          phone: unmaskPhone(phone) || null,
          cpf: cpf.replace(/\D/g, '') || null,
          full_name: composedName,
        })
        .eq('user_id', user.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['minha-conta'] });
      queryClient.invalidateQueries({ queryKey: ['user-role-profile'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Dados atualizados!');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar seus dados');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Máximo 2MB');
      return;
    }
    setUploadingAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `avatars/${user.id}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('company-logos').getPublicUrl(fileName);
      const url = `${publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: url })
        .eq('user_id', user.id);
      if (updateError) throw updateError;
      queryClient.invalidateQueries({ queryKey: ['user-role-profile'] });
      toast.success('Foto atualizada!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar a foto');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!user?.email) return;
    setSendingReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${PUBLIC_APP_URL}/redefinir-senha`,
      });
      if (error) throw error;
      toast.success('Link enviado! Confira seu e-mail para definir a nova senha.');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao enviar o link de redefinição');
    } finally {
      setSendingReset(false);
    }
  };

  const initials = (fullName || user?.email || 'U').substring(0, 2).toUpperCase();

  const currentSessionUuid = useMemo(
    () => (typeof window !== 'undefined' ? localStorage.getItem('session_uuid') : null),
    [],
  );
  const queryClientSessions = useQueryClient();
  const { data: mySessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ['my-active-sessions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('active_sessions')
        .select('id, session_uuid, metadata, started_at, last_seen_at')
        .eq('user_id', user!.id)
        .order('last_seen_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });
  const [endingId, setEndingId] = useState<string | null>(null);
  const handleEndSession = async (id: string) => {
    setEndingId(id);
    const { error } = await supabase.from('active_sessions').delete().eq('id', id);
    setEndingId(null);
    if (error) {
      toast.error('Erro ao encerrar sessão');
      return;
    }
    queryClientSessions.invalidateQueries({ queryKey: ['my-active-sessions'] });
    toast.success('Sessão encerrada');
  };
  const handleEndAllOthers = async () => {
    if (!user?.id) return;
    const others = mySessions.filter((s) => s.session_uuid !== currentSessionUuid);
    if (others.length === 0) return;
    const { error } = await supabase.from('active_sessions').delete().in('id', others.map((s) => s.id));
    if (error) {
      toast.error('Erro ao encerrar sessões');
      return;
    }
    queryClientSessions.invalidateQueries({ queryKey: ['my-active-sessions'] });
    toast.success('Demais sessões encerradas');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/conta"
        title="Minha conta."
        subtitle="Dados de acesso, preferências e sessões ativas."
        actions={
          mySessions.length > 1 ? (
            <Button variant="outline" onClick={handleEndAllOthers}>
              <LogOut className="h-4 w-4" /> Sair de todos
            </Button>
          ) : undefined
        }
      />

      <Tabs defaultValue="perfil">
        <TabsList className={tabsListClass}>
          <TabsTrigger value="perfil" className={tabsTriggerClass}>Perfil</TabsTrigger>
          <TabsTrigger value="seguranca" className={tabsTriggerClass}>Segurança</TabsTrigger>
          <TabsTrigger value="sessoes" className={tabsTriggerClass}>Sessões</TabsTrigger>
        </TabsList>

        <TabsContent value="perfil" className="mt-6">
      <Card className="bg-card border-border/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <IconBox tone="accent" icon={<User strokeWidth={1.75} />} />
            <div>
              <CardTitle>Dados Pessoais</CardTitle>
              <CardDescription>Como você aparece para a equipe</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="w-20 h-20">
              {avatarUrl && <AvatarImage src={avatarUrl} alt="Avatar" />}
              <AvatarFallback className="text-lg bg-primary/10 text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
              >
                {uploadingAvatar ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                {avatarUrl ? 'Alterar foto' : 'Enviar foto'}
              </Button>
              <p className="text-xs text-muted-foreground">PNG ou JPG até 2MB</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>

          <Separator />

          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="first-name">Nome</Label>
                  <Input
                    id="first-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Seu nome"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last-name">Sobrenome</Label>
                  <Input
                    id="last-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Seu sobrenome"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" value={user?.email || ''} disabled className="bg-bg-2" />
                <Link
                  to="/suporte"
                  className="inline-block text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Alterar e-mail
                </Link>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(maskPhone(e.target.value))}
                    placeholder="(31) 90000-0000"
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cpf">CPF</Label>
                  <Input
                    id="cpf"
                    value={cpf}
                    onChange={(e) => setCpf(maskCpf(e.target.value))}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Salvar alterações
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {mostrarDadosDaEmpresa && <CompanyDataCard />}
        </TabsContent>

        <TabsContent value="seguranca" className="mt-6">
          <Card className="bg-card border-border/50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <IconBox tone="accent" icon={<KeyRound strokeWidth={1.75} />} />
                <div>
                  <CardTitle>Senha</CardTitle>
                  <CardDescription>Sua senha é definida sempre por e-mail — o sistema nunca a guarda em tela.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enviamos um link para <span className="text-foreground">{user?.email}</span>. Você define a
                nova senha por lá.
              </p>
              <Button variant="outline" onClick={handleSendPasswordReset} disabled={sendingReset}>
                {sendingReset ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4 mr-2" />
                )}
                Enviar link de redefinição de senha
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessoes" className="mt-6">
          <Card className="bg-card border-border/50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <IconBox tone="accent" icon={<Monitor strokeWidth={1.75} />} />
                <div>
                  <CardTitle>Sessões ativas</CardTitle>
                  <CardDescription>Dispositivos conectados à sua conta agora.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {sessionsLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : mySessions.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">Nenhuma sessão registrada.</p>
              ) : (
                mySessions.map((s) => {
                  const isSelf = s.session_uuid === currentSessionUuid;
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border border-line bg-bg px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Monitor className="h-4 w-4 shrink-0 text-muted-ink" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-ui-strong text-ink">
                              {parseDeviceInfo((s.metadata as any)?.device_info ?? null)}
                            </span>
                            {isSelf && <DsBadge tone="ok">agora</DsBadge>}
                          </div>
                          <span className="text-meta text-muted-ink">
                            última atividade {s.last_seen_at ? format(new Date(s.last_seen_at), "dd/MM 'às' HH:mm", { locale: ptBR }) : '—'}
                          </span>
                        </div>
                      </div>
                      {!isSelf && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEndSession(s.id)}
                          disabled={endingId === s.id}
                        >
                          Encerrar
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
