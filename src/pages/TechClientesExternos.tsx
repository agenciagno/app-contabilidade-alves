import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, Search, UserPlus, RefreshCw, AlertTriangle, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CadastrarClienteDialog } from '@/components/tech/CadastrarClienteDialog';
import {
  useTenants, useTenantUsers, useInvalidateTenants, monthlyValue, type TenantRow,
} from '@/hooks/useTenants';
import { formatDoc, brl } from '@/lib/tenant-format';

type StatusFilter = 'todos' | 'active' | 'suspended';

export default function TechClientesExternos() {
  const { isSuperAdmin, isLoading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const invalidate = useInvalidateTenants();

  const { data: tenants, isLoading: loadingTenants } = useTenants();
  const { data: users, isLoading: loadingUsers } = useTenantUsers();

  const [busca, setBusca] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [cadastroOpen, setCadastroOpen] = useState(false);
  const [gerando, setGerando] = useState(false);

  const usersByCompany = useMemo(() => {
    const m = new Map<string, number>();
    (users ?? []).forEach((u) => {
      if (!u.company_id) return;
      m.set(u.company_id, (m.get(u.company_id) ?? 0) + 1);
    });
    return m;
  }, [users]);

  // Ninguém do cliente entrou ainda: todos os perfis seguem com troca de senha pendente.
  const semPrimeiroAcesso = useMemo(() => {
    const m = new Map<string, boolean>();
    (users ?? []).forEach((u) => {
      if (!u.company_id) return;
      const jaEntrou = !u.force_password_change || !!u.password_changed_at;
      m.set(u.company_id, (m.get(u.company_id) ?? true) && !jaEntrou);
    });
    return m;
  }, [users]);

  /** Clientes externos = tudo que não é a matriz da CA. */
  const externos = useMemo(() => (tenants ?? []).filter((t) => !t.is_internal), [tenants]);

  const metrics = useMemo(() => {
    const trinta = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return {
      total: externos.length,
      ativos: externos.filter((c) => c.status === 'active').length,
      suspensos: externos.filter((c) => c.status === 'suspended').length,
      usuarios: externos.reduce((acc, c) => acc + (usersByCompany.get(c.id) ?? 0), 0),
      mrr: externos
        .filter((c) => c.status === 'active')
        .reduce((acc, c) => acc + monthlyValue(c), 0),
      recentes: externos.filter((c) => new Date(c.created_at).getTime() >= trinta).length,
    };
  }, [externos, usersByCompany]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return externos.filter((c) => {
      if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
      if (!termo) return true;
      const doc = (c.cnpj ?? '').replace(/\D/g, '');
      return (
        c.name.toLowerCase().includes(termo) ||
        doc.includes(termo.replace(/\D/g, '')) ||
        (c.email ?? '').toLowerCase().includes(termo) ||
        (c.plan_name ?? '').toLowerCase().includes(termo)
      );
    });
  }, [externos, busca, statusFilter]);

  if (roleLoading) return null;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const handleGerarFaturas = async () => {
    setGerando(true);
    try {
      const { data, error } = await supabase.rpc('generate_tenant_invoices_admin', {});
      if (error) throw error;
      const n = Number(data ?? 0);
      toast.success(n > 0 ? `${n} fatura(s) gerada(s).` : 'Nenhuma fatura nova para este mês.');
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao gerar faturas.');
    } finally {
      setGerando(false);
    }
  };

  const carregando = loadingTenants || loadingUsers;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Clientes Externos</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro, acesso, módulos e faturas das empresas que assinam o sistema.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleGerarFaturas} disabled={gerando}>
            {gerando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Gerar faturas do mês
          </Button>
          <Button onClick={() => setCadastroOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2" />
            Cadastrar cliente
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {carregando ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <MetricCard label="Clientes" value={String(metrics.total)} />
            <MetricCard label="Ativos" value={String(metrics.ativos)} tone="success" />
            <MetricCard label="Suspensos" value={String(metrics.suspensos)} tone="danger" />
            <MetricCard label="Usuários" value={String(metrics.usuarios)} />
            <MetricCard label="Receita mensal" value={brl(metrics.mrr)} />
            <MetricCard label="Novos (30d)" value={String(metrics.recentes)} />
          </>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Clientes</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, documento, e-mail ou plano"
                className="pl-8 w-full sm:w-80"
              />
            </div>
            <div className="flex gap-1">
              {([
                ['todos', 'Todos'],
                ['active', 'Ativos'],
                ['suspended', 'Suspensos'],
              ] as [StatusFilter, string][]).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={statusFilter === key ? 'default' : 'outline'}
                  onClick={() => setStatusFilter(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtrados.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              {externos.length === 0
                ? 'Nenhum cliente externo cadastrado ainda.'
                : 'Nenhum cliente encontrado com esse filtro.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CNPJ/CPF</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Usuários</TableHead>
                    <TableHead>Cadastrado</TableHead>
                    <TableHead className="w-[40px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtrados.map((c) => (
                    <ClienteRow
                      key={c.id}
                      cliente={c}
                      usuarios={usersByCompany.get(c.id) ?? 0}
                      semAcesso={semPrimeiroAcesso.get(c.id) === true}
                      onOpen={() => navigate(`/tech/clientes-externos/${c.id}`)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CadastrarClienteDialog
        open={cadastroOpen}
        onOpenChange={setCadastroOpen}
        onCreated={(id) => navigate(`/tech/clientes-externos/${id}`)}
      />
    </div>
  );
}

function ClienteRow({
  cliente, usuarios, semAcesso, onOpen,
}: {
  cliente: TenantRow;
  usuarios: number;
  semAcesso: boolean;
  onOpen: () => void;
}) {
  const ativo = cliente.status === 'active';
  const orfao = usuarios === 0;

  return (
    <TableRow className="cursor-pointer" onClick={onOpen}>
      <TableCell className="font-medium">
        <div className="flex flex-wrap items-center gap-2">
          <span>{cliente.name}</span>
          {orfao && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> Sem usuário
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Empresa ativa sem ninguém que consiga entrar.</TooltipContent>
            </Tooltip>
          )}
          {!orfao && semAcesso && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
                  1º acesso pendente
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Ninguém do cliente trocou a senha provisória ainda.</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
      <TableCell className="tabular-nums">{formatDoc(cliente.cnpj)}</TableCell>
      <TableCell className="text-sm">
        {cliente.plan_name ? (
          <span>
            {cliente.plan_name}
            {cliente.plan_price ? (
              <span className="text-muted-foreground"> · {brl(Number(cliente.plan_price))}</span>
            ) : null}
          </span>
        ) : (
          <span className="text-muted-foreground">Sem plano</span>
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant={ativo ? 'default' : 'destructive'}
          className={ativo ? 'bg-emerald-600 hover:bg-emerald-600' : ''}
        >
          {ativo ? 'Ativo' : 'Suspenso'}
        </Badge>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {cliente.max_users != null ? (
          <span className={usuarios >= cliente.max_users ? 'text-destructive font-medium' : undefined}>
            {usuarios}/{cliente.max_users}
          </span>
        ) : (
          usuarios
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatDistanceToNow(new Date(cliente.created_at), { addSuffix: true, locale: ptBR })}
      </TableCell>
      <TableCell>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </TableCell>
    </TableRow>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'danger' }) {
  const colorClass =
    tone === 'success' ? 'text-emerald-600' : tone === 'danger' ? 'text-destructive' : 'text-foreground';
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold mt-1 ${colorClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
