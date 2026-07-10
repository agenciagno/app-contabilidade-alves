import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, MoreHorizontal, KeyRound, Trash2, UserPlus, Copy, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface CompanyRow {
  id: string;
  name: string;
  cnpj: string | null;
  status: string | null;
  plan_modules: string[] | null;
  created_at: string;
}

interface ProfileRow {
  user_id: string;
  company_id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  status_active: boolean | null;
}

const FINANCEIRO_SUBMODULES: { key: string; label: string }[] = [
  { key: 'financeiro_dashboard', label: 'Dashboard' },
  { key: 'financeiro_lancamentos', label: 'Lançamentos' },
  { key: 'financeiro_pagar_receber', label: 'Pagar/Receber' },
  { key: 'financeiro_conta_corrente', label: 'Conta Corrente' },
  { key: 'financeiro_dre', label: 'DRE' },
  { key: 'financeiro_boletos', label: 'Boletos' },
  { key: 'financeiro_eventos_contabeis', label: 'Eventos Contábeis' },
];
const BASE_MODULES = ['home', 'financeiro', 'configuracoes'];

function formatCnpj(cnpj: string | null): string {
  if (!cnpj) return '—';
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export default function TechOperacao() {
  const { isSuperAdmin, isLoading: roleLoading } = useUserRole();
  const { company: matriz } = useCompany();
  const queryClient = useQueryClient();

  const [suspendTarget, setSuspendTarget] = useState<CompanyRow | null>(null);
  const [modulesTarget, setModulesTarget] = useState<CompanyRow | null>(null);
  const [usersTarget, setUsersTarget] = useState<CompanyRow | null>(null);
  const [pickedModules, setPickedModules] = useState<string[]>([]);
  const [savingModules, setSavingModules] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);

  const { data: companies, isLoading: loadingCompanies } = useQuery({
    queryKey: ['tech-operacao-companies'],
    queryFn: async (): Promise<CompanyRow[]> => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, cnpj, status, plan_modules, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CompanyRow[];
    },
    enabled: !!isSuperAdmin,
  });

  const { data: profiles, isLoading: loadingProfiles } = useQuery({
    queryKey: ['tech-operacao-profiles'],
    queryFn: async (): Promise<ProfileRow[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, company_id, full_name, email, role, status_active');
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
    enabled: !!isSuperAdmin,
  });

  const usersByCompany = useMemo(() => {
    const m = new Map<string, ProfileRow[]>();
    (profiles ?? []).forEach((p) => {
      if (!p.company_id) return;
      const arr = m.get(p.company_id) ?? [];
      arr.push(p);
      m.set(p.company_id, arr);
    });
    return m;
  }, [profiles]);

  const metrics = useMemo(() => {
    const list = companies ?? [];
    const thirty = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return {
      total: list.length,
      active: list.filter((c) => c.status === 'active').length,
      suspended: list.filter((c) => c.status === 'suspended').length,
      users: (profiles ?? []).length,
      recent: list.filter((c) => new Date(c.created_at).getTime() >= thirty).length,
    };
  }, [companies, profiles]);

  if (roleLoading) return null;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const matrizId = matriz?.id ?? null;

  const handleToggleStatus = async () => {
    if (!suspendTarget) return;
    setSuspending(true);
    try {
      const next = suspendTarget.status === 'active' ? 'suspended' : 'active';
      const { error } = await supabase
        .from('companies')
        .update({ status: next })
        .eq('id', suspendTarget.id);
      if (error) throw error;
      toast.success(next === 'active' ? 'Cliente ativado' : 'Cliente suspenso');
      queryClient.invalidateQueries({ queryKey: ['tech-operacao-companies'] });
      setSuspendTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao atualizar status');
    } finally {
      setSuspending(false);
    }
  };

  const openModules = (c: CompanyRow) => {
    const current = c.plan_modules ?? [];
    setPickedModules(FINANCEIRO_SUBMODULES.map((s) => s.key).filter((k) => current.includes(k)));
    setModulesTarget(c);
  };

  const togglePicked = (key: string, checked: boolean) => {
    setPickedModules((prev) =>
      checked ? Array.from(new Set([...prev, key])) : prev.filter((k) => k !== key),
    );
  };

  const handleSaveModules = async () => {
    if (!modulesTarget) return;
    setSavingModules(true);
    try {
      const nextModules = Array.from(new Set([...BASE_MODULES, ...pickedModules]));
      const { error } = await supabase
        .from('companies')
        .update({ plan_modules: nextModules })
        .eq('id', modulesTarget.id);
      if (error) throw error;
      toast.success('Módulos atualizados');
      queryClient.invalidateQueries({ queryKey: ['tech-operacao-companies'] });
      setModulesTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar módulos');
    } finally {
      setSavingModules(false);
    }
  };

  const handleResetPassword = async (email: string | null) => {
    if (!email) {
      toast.error('Usuário sem e-mail cadastrado');
      return;
    }
    setResetting(email);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/',
      });
      if (error) throw error;
      toast.success('E-mail de redefinição enviado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar e-mail');
    } finally {
      setResetting(null);
    }
  };

  const isMatriz = (id: string) => matrizId === id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Operação Interna</h1>
        <p className="text-sm text-muted-foreground">
          Painel da GNO para gestão dos clientes (tenants) do produto.
        </p>
      </div>

      {/* Seção 1: Cards macro */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {loadingCompanies || loadingProfiles ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-8 w-16" /></CardContent></Card>
          ))
        ) : (
          <>
            <MetricCard label="Total de clientes" value={metrics.total} />
            <MetricCard label="Ativos" value={metrics.active} tone="success" />
            <MetricCard label="Suspensos" value={metrics.suspended} tone="danger" />
            <MetricCard label="Total de usuários" value={metrics.users} />
            <MetricCard label="Provisionados (30d)" value={metrics.recent} />
          </>
        )}
      </div>

      {/* Seção 2: Tabela */}
      <Card>
        <CardHeader>
          <CardTitle>Clientes</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingCompanies ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (companies ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Nenhum cliente encontrado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Usuários</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(companies ?? []).map((c) => {
                    const matriz = isMatriz(c.id);
                    const usersCount = usersByCompany.get(c.id)?.length ?? 0;
                    const active = c.status === 'active';
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span>{c.name}</span>
                            {matriz && <Badge variant="outline">Matriz (CA)</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums">{formatCnpj(c.cnpj)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={active ? 'default' : 'destructive'}
                            className={active ? 'bg-emerald-600 hover:bg-emerald-600' : ''}
                          >
                            {active ? 'Ativo' : 'Suspenso'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{usersCount}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="Ações">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                disabled={matriz}
                                onClick={() => setSuspendTarget(c)}
                              >
                                {active ? 'Suspender' : 'Ativar'}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openModules(c)}>
                                Controle de módulos
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setUsersTarget(c)}>
                                Usuários
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmação ativar/suspender */}
      <AlertDialog open={!!suspendTarget} onOpenChange={(o) => !o && setSuspendTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {suspendTarget?.status === 'active' ? 'Suspender cliente?' : 'Ativar cliente?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {suspendTarget?.status === 'active'
                ? `Ao suspender, os usuários de "${suspendTarget?.name}" não conseguirão mais fazer login.`
                : `Reativar o acesso de "${suspendTarget?.name}"?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={suspending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleStatus} disabled={suspending}>
              {suspending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: controle de módulos */}
      <Dialog open={!!modulesTarget} onOpenChange={(o) => !o && setModulesTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Módulos do Financeiro</DialogTitle>
            <DialogDescription>
              Selecione os submódulos habilitados para {modulesTarget?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {FINANCEIRO_SUBMODULES.map((s) => {
              const checked = pickedModules.includes(s.key);
              return (
                <label key={s.key} className="flex items-center gap-3 cursor-pointer">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => togglePicked(s.key, v === true)}
                  />
                  <span className="text-sm">{s.label}</span>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModulesTarget(null)} disabled={savingModules}>
              Cancelar
            </Button>
            <Button onClick={handleSaveModules} disabled={savingModules}>
              {savingModules && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: usuários */}
      <Dialog open={!!usersTarget} onOpenChange={(o) => !o && setUsersTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Usuários de {usersTarget?.name}</DialogTitle>
            <DialogDescription>
              Envie um e-mail de redefinição de senha para qualquer usuário.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[160px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(usersTarget ? usersByCompany.get(usersTarget.id) ?? [] : []).map((u) => (
                  <TableRow key={u.user_id}>
                    <TableCell>{u.full_name ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email ?? '—'}</TableCell>
                    <TableCell><Badge variant="outline">{u.role ?? '—'}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={u.status_active ? 'default' : 'secondary'}>
                        {u.status_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resetting === u.email}
                        onClick={() => handleResetPassword(u.email)}
                      >
                        {resetting === u.email
                          ? <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                          : <KeyRound className="w-3 h-3 mr-2" />}
                        Reset de senha
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {usersTarget && (usersByCompany.get(usersTarget.id) ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                      Nenhum usuário nesse cliente.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUsersTarget(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'danger' }) {
  const colorClass =
    tone === 'success' ? 'text-emerald-600'
      : tone === 'danger' ? 'text-destructive'
      : 'text-foreground';
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold mt-1 ${colorClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
