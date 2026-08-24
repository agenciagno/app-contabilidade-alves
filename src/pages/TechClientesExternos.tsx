import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Loader2, Search, UserPlus, RefreshCw, AlertTriangle, ChevronRight, Pencil, Trash2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CadastrarClienteDialog } from '@/components/tech/CadastrarClienteDialog';
import {
  useTenants, useTenantUsers, useTenantPlans, useInvalidateTenants, monthlyValue,
  type TenantRow, type TenantPlanRow,
} from '@/hooks/useTenants';
import { formatDoc, brl, BILLING_CYCLE_LABEL } from '@/lib/tenant-format';
import { PageHeader, StatCardRow, DsBadge, tabsListClass, tabsTriggerClass } from '@/components/ds';

type StatusFilter = 'todos' | 'active' | 'trial' | 'suspended' | 'inactive';

export default function TechClientesExternos() {
  const { isSuperAdmin, isLoading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const invalidate = useInvalidateTenants();

  const { data: tenants, isLoading: loadingTenants } = useTenants();
  const { data: users, isLoading: loadingUsers } = useTenantUsers();

  const [tab, setTab] = useState<'clientes' | 'planos'>('clientes');
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
          tab === 'clientes' ? (
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
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'clientes' | 'planos')}>
        <TabsList className={tabsListClass}>
          <TabsTrigger value="clientes" className={tabsTriggerClass}>Clientes</TabsTrigger>
          <TabsTrigger value="planos" className={tabsTriggerClass}>Planos</TabsTrigger>
        </TabsList>

        <TabsContent value="clientes" className="mt-4 space-y-6">
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
                <SelectItem value="inactive">Inativos</SelectItem>
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
        </TabsContent>

        <TabsContent value="planos" className="mt-4">
          <PlanosTab />
        </TabsContent>
      </Tabs>

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
  const inativo = cliente.status === 'inactive';
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
        <DsBadge tone={ativo ? 'ok' : trial ? 'warn' : inativo ? 'neutral' : 'danger'}>
          {ativo ? 'ativo' : trial ? 'trial' : inativo ? 'inativo' : 'suspenso'}
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

/* ---------------------------------------------------------------------- Planos */

function PlanosTab() {
  const { data: planos, isLoading } = useTenantPlans();
  const invalidate = useInvalidateTenants();

  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [valor, setValor] = useState('');
  const [ciclo, setCiclo] = useState('mensal');
  const [salvando, setSalvando] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TenantPlanRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const resetForm = () => {
    setEditId(null);
    setNome('');
    setValor('');
    setCiclo('mensal');
  };

  const editar = (p: TenantPlanRow) => {
    setEditId(p.id);
    setNome(p.name);
    setValor(String(p.price));
    setCiclo(p.billing_cycle);
  };

  const salvar = async () => {
    const nomeTrim = nome.trim();
    if (!nomeTrim) { toast.error('Informe o nome do plano.'); return; }
    const price = Number(valor.replace(',', '.'));
    if (Number.isNaN(price) || price < 0) { toast.error('Valor inválido.'); return; }
    setSalvando(true);
    try {
      if (editId) {
        const { error } = await supabase
          .from('tenant_plans')
          .update({ name: nomeTrim, price, billing_cycle: ciclo, updated_at: new Date().toISOString() })
          .eq('id', editId);
        if (error) throw error;
        toast.success('Plano atualizado.');
      } else {
        const { error } = await supabase.from('tenant_plans').insert({ name: nomeTrim, price, billing_cycle: ciclo });
        if (error) throw error;
        toast.success('Plano criado.');
      }
      resetForm();
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar plano.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('tenant_plans').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success('Plano excluído.');
      if (editId === deleteTarget.id) resetForm();
      invalidate();
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao excluir plano.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{editId ? 'Editar plano' : 'Novo plano'}</CardTitle>
          <CardDescription>Aparece no dropdown de "Plano e cobrança" de cada cliente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="plano-nome">Nome do plano</Label>
            <Input
              id="plano-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Financeiro Essencial"
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plano-valor">Valor (R$)</Label>
            <Input
              id="plano-valor"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
            />
          </div>
          <div className="space-y-2">
            <Label>Ciclo</Label>
            <Select value={ciclo} onValueChange={setCiclo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mensal">Mensal</SelectItem>
                <SelectItem value="trimestral">Trimestral</SelectItem>
                <SelectItem value="anual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button onClick={salvar} disabled={salvando}>
              {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editId ? 'Salvar alterações' : 'Salvar plano'}
            </Button>
            {editId && (
              <Button variant="outline" onClick={resetForm} disabled={salvando}>
                Cancelar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Planos cadastrados</CardTitle>
          <CardDescription>{planos?.length ?? 0} plano(s).</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !planos || planos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum plano cadastrado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Ciclo</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {planos.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{brl(Number(p.price))}</TableCell>
                      <TableCell>{BILLING_CYCLE_LABEL[p.billing_cycle] ?? p.billing_cycle}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => editar(p)} title="Editar plano">
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(p)} title="Excluir plano">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir plano?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{deleteTarget?.name}</strong> do catálogo. Clientes que já usam esse plano não são
              afetados — o valor deles já foi copiado no cadastro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={excluir}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
