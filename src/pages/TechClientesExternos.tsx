import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, Search, UserPlus, RefreshCw, AlertTriangle, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CadastrarClienteDialog } from '@/components/tech/CadastrarClienteDialog';
import {
  useTenants, useTenantUsers, useInvalidateTenants, monthlyValue, type TenantRow,
} from '@/hooks/useTenants';
import { formatDoc, brl } from '@/lib/tenant-format';
import { PageHeader, StatCardRow, DsBadge } from '@/components/ds';

type StatusFilter = 'todos' | 'active' | 'trial' | 'suspended';

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
      trial: externos.filter((c) => c.status === 'trial').length,
      suspensos: externos.filter((c) => c.status === 'suspended').length,
      usuarios: externos.reduce((acc, c) => acc + (usersByCompany.get(c.id) ?? 0), 0),
      mrr: externos
        .filter((c) => c.status === 'active')
        .reduce((acc, c) => acc + monthlyValue(c), 0),
      recentes: externos.filter((c) => new Date(c.created_at).getTime() >= trinta).length,
    };
  }, [externos, usersByCompany]);

  const planos = useMemo(
    () => Array.from(new Set(externos.map((c) => c.plan_name).filter((p): p is string => !!p))),
    [externos],
  );
  const [planoFilter, setPlanoFilter] = useState('todos');

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return externos.filter((c) => {
      if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
      if (planoFilter !== 'todos' && c.plan_name !== planoFilter) return false;
      if (!termo) return true;
      const doc = (c.cnpj ?? '').replace(/\D/g, '');
      return (
        c.name.toLowerCase().includes(termo) ||
        doc.includes(termo.replace(/\D/g, '')) ||
        (c.email ?? '').toLowerCase().includes(termo) ||
        (c.plan_name ?? '').toLowerCase().includes(termo)
      );
    });
  }, [externos, busca, statusFilter, planoFilter]);

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
      <PageHeader
        kicker="~/tech · saas"
        title="Clientes externos."
        subtitle="Escritórios que usam o sistema como produto."
        actions={
          <>
            <Button variant="outline" onClick={handleGerarFaturas} disabled={gerando}>
              {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Gerar faturas do mês
            </Button>
            <Button onClick={() => setCadastroOpen(true)}>
              <UserPlus className="h-4 w-4" />
              Novo cliente
            </Button>
          </>
        }
      />

      {carregando ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[116px] w-full" />)}
        </div>
      ) : (
        <StatCardRow
          items={[
            { label: 'Escritórios ativos', value: metrics.ativos, hint: 'em produção' },
            { label: 'Usuários', value: metrics.usuarios, hint: 'somando todos os planos' },
            { label: 'Em trial', value: metrics.trial, hint: 'vencem em 7 dias', emphasis: metrics.trial > 0 ? 'warm' : 'none' },
            { label: 'MRR', value: brl(metrics.mrr), hint: 'receita recorrente' },
          ]}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-ink-2" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar escritório..."
            className="h-10 border-line bg-paper pl-9 text-ui"
          />
        </div>
        <Select value={planoFilter} onValueChange={setPlanoFilter}>
          <SelectTrigger className="h-9 w-[150px] border-line bg-paper text-ui">
            <SelectValue placeholder="Plano" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os planos</SelectItem>
            {planos.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="h-9 w-[150px] border-line bg-paper text-ui">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="trial">Em trial</SelectItem>
            <SelectItem value="suspended">Suspensos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-paper">
        {carregando ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : filtrados.length === 0 ? (
          <div className="py-8 text-center text-body text-muted-ink">
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
        <div className="border-t border-line px-4 py-2.5 text-meta text-muted-ink-2">
          {filtrados.length} de {externos.length} escritórios
        </div>
      </div>

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
  const trial = cliente.status === 'trial';
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
                <Badge variant="outline" className="border-warn/50 text-warn dark:text-warn">
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
        <DsBadge tone={ativo ? 'ok' : trial ? 'warn' : 'danger'}>
          {ativo ? 'ativo' : trial ? 'trial' : 'suspenso'}
        </DsBadge>
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
