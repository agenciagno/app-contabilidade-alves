import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowLeft, Loader2, Trash2, UserPlus, KeyRound, Copy, Check, Ban, ShieldCheck,
  Mail, RefreshCw, Plus, Settings2, Archive,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DsBadge, tabsListClass, tabsTriggerClass } from '@/components/ds';
import { EmailField, isValidEmail, normalizeEmail } from '@/components/tech/EmailField';
import { ModulosPickerTree, toggleModuloKey } from '@/components/tech/ModulosPickerTree';
import {
  useTenants, useTenantUsers, useTenantInvoices, useTenantPlans, useInvalidateTenants,
  invoiceState, type TenantUserRow, type TenantInvoiceRow,
} from '@/hooks/useTenants';
import { formatDoc, brl, dateBR, competenciaBR, BILLING_CYCLE_LABEL } from '@/lib/tenant-format';
import { PUBLIC_APP_URL } from '@/lib/environment';

/**
 * Sempre habilitado: sem ele o cliente não consegue nem se configurar.
 * "Início" deixou de ser fixo (pedido de Gabriel, 23/08) — agora dá pra desmarcar
 * como qualquer outro módulo; quem ficar sem nenhum módulo visível cai em /sem-acesso.
 */
const MODULOS_FIXOS = ['configuracoes'];

export default function TechClienteExternoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isSuperAdmin, isLoading: roleLoading } = useUserRole();
  const invalidate = useInvalidateTenants();

  const { data: tenants, isLoading: loadingTenants } = useTenants();
  const { data: allUsers } = useTenantUsers();
  const { data: invoices } = useTenantInvoices(id);

  const cliente = useMemo(() => tenants?.find((t) => t.id === id) ?? null, [tenants, id]);
  const usuarios = useMemo(
    () => (allUsers ?? []).filter((u) => u.company_id === id),
    [allUsers, id],
  );

  if (roleLoading) return null;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  if (loadingTenants) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/tech/clientes-externos')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
        </Button>
        <p className="text-sm text-muted-foreground">Cliente não encontrado.</p>
      </div>
    );
  }

  const ativo = cliente.status === 'active';
  const inativo = cliente.status === 'inactive';

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-link">
        <button
          onClick={() => navigate('/tech/clientes-externos')}
          className="flex items-center gap-1.5 text-muted-ink transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Clientes externos
        </button>
        <span className="text-meta text-muted-ink-2">/</span>
        <span className="truncate text-ink">{cliente.name}</span>
      </nav>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-md ${
            ativo ? 'bg-ok-soft text-ok' : inativo ? 'bg-bg-2 text-muted-ink' : 'bg-danger-soft text-danger'
          }`}
        >
          <ShieldCheck className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-display text-ink">{cliente.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-mono-sm text-muted-ink">{formatDoc(cliente.cnpj)}</span>
            {cliente.plan_name && <span className="text-meta text-muted-ink-2">Plano {cliente.plan_name}</span>}
            <DsBadge tone={ativo ? 'ok' : inativo ? 'neutral' : 'danger'}>
              {ativo ? 'ativo' : inativo ? 'inativo' : 'suspenso'}
            </DsBadge>
            {cliente.is_internal && <DsBadge tone="info">matriz (CA)</DsBadge>}
          </div>
        </div>
      </div>

      <Tabs defaultValue="geral">
        <TabsList className={tabsListClass}>
          <TabsTrigger value="geral" className={tabsTriggerClass}>Visão geral</TabsTrigger>
          <TabsTrigger value="usuarios" className={tabsTriggerClass}>Usuários ({usuarios.length})</TabsTrigger>
          <TabsTrigger value="modulos" className={tabsTriggerClass}>Módulos</TabsTrigger>
          <TabsTrigger value="faturas" className={tabsTriggerClass}>Faturamento ({invoices?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="historico" className={tabsTriggerClass}>Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="mt-4">
          <AbaGeral cliente={cliente} usuariosAtuais={usuarios.length} onChanged={invalidate} />
        </TabsContent>
        <TabsContent value="usuarios" className="mt-4">
          <AbaUsuarios cliente={cliente} usuarios={usuarios} onChanged={invalidate} />
        </TabsContent>
        <TabsContent value="modulos" className="mt-4">
          <AbaModulos cliente={cliente} onChanged={invalidate} />
        </TabsContent>
        <TabsContent value="faturas" className="mt-4">
          <AbaFaturas cliente={cliente} invoices={invoices ?? []} onChanged={invalidate} />
        </TabsContent>
        <TabsContent value="historico" className="mt-4">
          <AbaHistorico companyId={cliente.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ Visão geral */

type Cliente = NonNullable<ReturnType<typeof useTenants>['data']>[number];

function AbaGeral({
  cliente, usuariosAtuais, onChanged,
}: {
  cliente: Cliente;
  usuariosAtuais: number;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const { data: planos } = useTenantPlans();
  const [planName, setPlanName] = useState(cliente.plan_name ?? '');
  const [planPrice, setPlanPrice] = useState(cliente.plan_price != null ? String(cliente.plan_price) : '');
  const [cycle, setCycle] = useState(cliente.billing_cycle ?? 'mensal');
  const [billingDay, setBillingDay] = useState(cliente.billing_day != null ? String(cliente.billing_day) : '');
  const [contractStart, setContractStart] = useState(cliente.contract_start ?? '');
  const [maxUsers, setMaxUsers] = useState(cliente.max_users != null ? String(cliente.max_users) : '');
  const [notes, setNotes] = useState(cliente.notes ?? '');
  const [saving, setSaving] = useState(false);

  const [statusTarget, setStatusTarget] = useState<'active' | 'suspended' | 'inactive' | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setPlanName(cliente.plan_name ?? '');
    setPlanPrice(cliente.plan_price != null ? String(cliente.plan_price) : '');
    setCycle(cliente.billing_cycle ?? 'mensal');
    setBillingDay(cliente.billing_day != null ? String(cliente.billing_day) : '');
    setContractStart(cliente.contract_start ?? '');
    setMaxUsers(cliente.max_users != null ? String(cliente.max_users) : '');
    setNotes(cliente.notes ?? '');
  }, [cliente]);

  const salvarPlano = async () => {
    const price = planPrice.trim() ? Number(planPrice.replace(',', '.')) : null;
    if (price !== null && (Number.isNaN(price) || price < 0)) {
      toast.error('Valor do plano inválido.');
      return;
    }
    const day = billingDay.trim() ? Number(billingDay) : null;
    if (day !== null && (Number.isNaN(day) || day < 1 || day > 31)) {
      toast.error('Dia de vencimento precisa estar entre 1 e 31.');
      return;
    }
    const limite = maxUsers.trim() ? Number(maxUsers) : null;
    if (limite !== null && (Number.isNaN(limite) || limite < 1)) {
      toast.error('Limite de usuários precisa ser 1 ou mais. Deixe vazio para ilimitado.');
      return;
    }
    // Baixar o teto abaixo de quem já existe não tira o acesso de ninguém — só travaria
    // o cadastro do próximo. Melhor barrar aqui do que deixar o número mentir na tela.
    if (limite !== null && limite < usuariosAtuais) {
      toast.error(`O cliente já tem ${usuariosAtuais} usuário(s). Remova alguém antes de baixar o limite.`);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('companies')
        .update({
          plan_name: planName.trim() || null,
          plan_price: price,
          billing_cycle: cycle,
          billing_day: day,
          contract_start: contractStart || null,
          max_users: limite,
          notes: notes.trim() || null,
        })
        .eq('id', cliente.id);
      if (error) throw error;
      toast.success('Plano atualizado.');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar plano.');
    } finally {
      setSaving(false);
    }
  };

  const alterarStatus = async () => {
    if (!statusTarget) return;
    setChangingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke('set-tenant-status', {
        body: { company_id: cliente.id, status: statusTarget },
      });
      if (error) throw new Error(error.message || 'Falha ao alterar status.');
      const payload = data as { error?: string; sessions_revoked?: number } | null;
      if (payload?.error) throw new Error(payload.error);
      const MSG: Record<string, string> = {
        suspended: `Cliente suspenso. ${payload?.sessions_revoked ?? 0} sessão(ões) encerrada(s).`,
        inactive: `Cliente inativado. ${payload?.sessions_revoked ?? 0} sessão(ões) encerrada(s).`,
        active: 'Cliente reativado.',
      };
      toast.success(MSG[statusTarget]);
      onChanged();
      setStatusTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao alterar status.');
    } finally {
      setChangingStatus(false);
    }
  };

  const excluir = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-tenant', {
        body: { company_id: cliente.id },
      });
      if (error) throw new Error(error.message || 'Falha ao excluir empresa.');
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Empresa excluída definitivamente.');
      onChanged();
      navigate('/tech/clientes-externos');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao excluir empresa.');
    } finally {
      setDeleting(false);
    }
  };

  const ativo = cliente.status === 'active';
  const suspenso = cliente.status === 'suspended';

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cadastro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Linha rotulo="Documento" valor={formatDoc(cliente.cnpj)} />
          <Linha rotulo="E-mail" valor={cliente.email ?? '—'} />
          <Linha rotulo="Telefone" valor={cliente.phone ?? '—'} />
          <Linha
            rotulo="Cadastrado em"
            valor={new Date(cliente.created_at).toLocaleDateString('pt-BR')}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plano e cobrança</CardTitle>
          <CardDescription>
            As faturas do mês são geradas a partir daqui. Sem valor e dia de vencimento, nada é gerado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="plan-name">Plano</Label>
              <Select
                value={planName || undefined}
                onValueChange={(v) => {
                  setPlanName(v);
                  const p = planos?.find((pl) => pl.name === v);
                  if (p) {
                    setPlanPrice(String(p.price));
                    setCycle(p.billing_cycle);
                  }
                }}
              >
                <SelectTrigger id="plan-name">
                  <SelectValue placeholder={planos?.length ? 'Selecione um plano' : 'Nenhum plano cadastrado'} />
                </SelectTrigger>
                <SelectContent>
                  {(planos ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!planos?.length && (
                <p className="text-xs text-muted-foreground">
                  Cadastre planos na aba "Planos" da listagem de clientes externos.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-price">Valor (R$)</Label>
              <Input
                id="plan-price"
                value={planPrice}
                onChange={(e) => setPlanPrice(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-2">
              <Label>Ciclo</Label>
              <Select value={cycle} onValueChange={setCycle}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="trimestral">Trimestral</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="billing-day">Dia do vencimento</Label>
              <Input
                id="billing-day"
                value={billingDay}
                onChange={(e) => setBillingDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
                placeholder="10"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contract-start">Início do contrato</Label>
              <Input
                id="contract-start"
                type="date"
                value={contractStart}
                onChange={(e) => setContractStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-users">Limite de usuários</Label>
              <Input
                id="max-users"
                value={maxUsers}
                onChange={(e) => setMaxUsers(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Vazio = ilimitado"
                inputMode="numeric"
              />
              <p className="text-xs text-muted-foreground">
                Em uso: {usuariosAtuais}
                {cliente.max_users != null ? ` de ${cliente.max_users}` : ' · sem limite'}
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <Button onClick={salvarPlano} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar plano
          </Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Acesso e encerramento</CardTitle>
          <CardDescription>
            Suspender encerra na hora as sessões abertas — não espera o próximo login.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {ativo && (
            <Button variant="outline" onClick={() => setStatusTarget('suspended')} disabled={cliente.is_internal}>
              <Ban className="w-4 h-4 mr-2" />
              Suspender cliente
            </Button>
          )}
          {(ativo || suspenso) && (
            <Button variant="outline" onClick={() => setStatusTarget('inactive')} disabled={cliente.is_internal}>
              <Archive className="w-4 h-4 mr-2" />
              Inativar cliente
            </Button>
          )}
          {!ativo && (
            <Button variant="default" onClick={() => setStatusTarget('active')} disabled={cliente.is_internal}>
              <ShieldCheck className="w-4 h-4 mr-2" />
              Reativar cliente
            </Button>
          )}
          <Button
            variant="destructive"
            onClick={() => { setDeleteInput(''); setDeleteOpen(true); }}
            disabled={cliente.is_internal}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Excluir empresa
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={!!statusTarget} onOpenChange={(o) => !o && setStatusTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusTarget === 'suspended' && 'Suspender cliente?'}
              {statusTarget === 'inactive' && 'Inativar cliente?'}
              {statusTarget === 'active' && 'Reativar cliente?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusTarget === 'suspended' &&
                `Os usuários de "${cliente.name}" são desconectados agora e não conseguem mais entrar. Use para algo temporário (ex.: inadimplência) — dá pra reativar depois.`}
              {statusTarget === 'inactive' &&
                `"${cliente.name}" deixa de ser cliente do sistema. Os usuários são desconectados agora; dados e faturas continuam guardados e o acesso pode ser reativado depois, se precisar.`}
              {statusTarget === 'active' &&
                `Reativar o acesso de "${cliente.name}"?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={changingStatus}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={alterarStatus} disabled={changingStatus}>
              {changingStatus && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeleteInput(''); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Excluir empresa definitivamente?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Apaga <strong>{cliente.name}</strong>, todos os usuários, faturas e dados financeiros.
                  É <strong>irreversível</strong>. Se a ideia for só cortar o acesso, use Suspender.
                </p>
                <p>Digite o nome exato da empresa para confirmar:</p>
                <Input autoFocus value={deleteInput} onChange={(e) => setDeleteInput(e.target.value)} placeholder={cliente.name} />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={excluir}
              disabled={deleting || deleteInput.trim() !== cliente.name}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 pb-2 last:border-0">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right break-all">{valor}</span>
    </div>
  );
}

/* -------------------------------------------------------------------- Usuários */

function AbaUsuarios({
  cliente, usuarios, onChanged,
}: {
  cliente: Cliente;
  usuarios: TenantUserRow[];
  onChanged: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoEmail, setNovoEmail] = useState('');
  const [novoPapel, setNovoPapel] = useState<'admin' | 'colaborador'>('colaborador');
  const [novoModulos, setNovoModulos] = useState<string[]>(cliente.plan_modules ?? []);
  const [criando, setCriando] = useState(false);
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const [acao, setAcao] = useState<string | null>(null);
  const [blockTarget, setBlockTarget] = useState<TenantUserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TenantUserRow | null>(null);
  const [processando, setProcessando] = useState(false);

  const [modulosTarget, setModulosTarget] = useState<TenantUserRow | null>(null);
  const [modulosSelecionados, setModulosSelecionados] = useState<string[]>([]);
  const [salvandoModulos, setSalvandoModulos] = useState(false);
  // Plano usado pelos dois pickers. Não confia no `cliente` da lista em memória
  // (cache que só atualiza com invalidate + refetch assíncrono, e na prática
  // ficava um passo atrás) — busca direto no banco toda vez que um picker abre.
  const [planoAtual, setPlanoAtual] = useState<string[]>(cliente.plan_modules ?? []);

  const cheio = cliente.max_users != null && usuarios.length >= cliente.max_users;

  const buscarPlanoAtual = async () => {
    const { data, error } = await supabase.from('companies').select('plan_modules').eq('id', cliente.id).single();
    if (error) { toast.error('Falha ao buscar módulos do plano.'); return cliente.plan_modules ?? []; }
    const fresh = (data?.plan_modules as string[] | null) ?? [];
    setPlanoAtual(fresh);
    return fresh;
  };

  const resetForm = () => {
    setNovoNome(''); setNovoEmail(''); setNovoPapel('colaborador');
    setNovoModulos(cliente.plan_modules ?? []);
    setCreds(null); setCopiado(false);
  };

  const abrirAdicionar = async () => {
    resetForm();
    const fresh = await buscarPlanoAtual();
    setNovoModulos(fresh);
    setAddOpen(true);
  };

  // Mesmo motivo do `buscarPlanoAtual`: o cliente pode ter mexido nos próprios módulos
  // pela Equipe dele (self-service) entre o último fetch da lista e este clique — sem
  // buscar fresco aqui, salvar module reverte silenciosamente o que o cliente acabou
  // de fazer (a leitura stale de `u` vira o payload que sobrescreve o banco).
  const abrirEditarModulos = async (u: TenantUserRow) => {
    setAcao(`modulos-${u.user_id}`);
    try {
      const [planoFresco, { data: userFresco, error }] = await Promise.all([
        buscarPlanoAtual(),
        supabase
          .from('profiles')
          .select('full_name, email, role, status_active, allowed_modules')
          .eq('user_id', u.user_id)
          .single(),
      ]);
      if (error) throw error;
      setModulosTarget({ ...u, ...userFresco });
      setModulosSelecionados((userFresco?.allowed_modules as string[] | null) ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao buscar dados atuais do usuário.');
    } finally {
      setAcao(null);
    }
  };

  const criarUsuario = async () => {
    if (!novoNome.trim()) { toast.error('Informe o nome.'); return; }
    if (!isValidEmail(novoEmail)) { toast.error('E-mail inválido.'); return; }
    if (cheio) { toast.error('Limite de usuários do plano atingido.'); return; }
    setCriando(true);
    try {
      const email = normalizeEmail(novoEmail);
      const { data, error } = await supabase.functions.invoke('create-tenant-user', {
        body: {
          company_id: cliente.id, email, name: novoNome.trim(), role: novoPapel,
          allowed_modules: novoModulos,
        },
      });
      if (error) {
        // Status != 2xx (ex.: 409 do limite de plano) chega aqui com a mensagem no corpo.
        let msg = error.message || 'Falha ao criar funcionário.';
        const ctx = (error as any)?.context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          } catch { /* mantém a mensagem original */ }
        }
        throw new Error(msg);
      }
      const payload = data as { provisional_password?: string; error?: string } | null;
      if (!payload || payload.error) throw new Error(payload?.error || 'Falha ao criar funcionário.');
      if (!payload.provisional_password) throw new Error('Resposta sem senha provisória.');
      setCreds({ email, password: payload.provisional_password });
      toast.success('Funcionário criado.');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao criar funcionário.');
    } finally {
      setCriando(false);
    }
  };

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      toast.success('Credenciais copiadas.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  };

  const reemitirSenha = async (u: TenantUserRow) => {
    setAcao(`senha-${u.user_id}`);
    try {
      const { data, error } = await supabase.functions.invoke('reset-tenant-user-password', {
        body: { user_id: u.user_id },
      });
      if (error) throw new Error(error.message || 'Falha ao reemitir senha.');
      const payload = data as { provisional_password?: string; email?: string; error?: string } | null;
      if (!payload || payload.error) throw new Error(payload?.error || 'Falha ao reemitir senha.');
      setCreds({ email: payload.email ?? u.email ?? '', password: payload.provisional_password! });
      setCopiado(false);
      setAddOpen(true);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao reemitir senha.');
    } finally {
      setAcao(null);
    }
  };

  const enviarEmailReset = async (u: TenantUserRow) => {
    if (!u.email) { toast.error('Usuário sem e-mail cadastrado.'); return; }
    setAcao(`email-${u.user_id}`);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(u.email, {
        redirectTo: PUBLIC_APP_URL + '/redefinir-senha',
      });
      if (error) throw error;
      toast.success('E-mail de redefinição disparado. Se o cliente não receber, use Reemitir senha.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar e-mail.');
    } finally {
      setAcao(null);
    }
  };

  const salvarModulosUsuario = async () => {
    if (!modulosTarget) return;
    setSalvandoModulos(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-update-user', {
        body: {
          userId: modulosTarget.user_id,
          fullName: modulosTarget.full_name || modulosTarget.email || 'Usuário',
          role: modulosTarget.role || 'colaborador',
          statusActive: modulosTarget.status_active ?? true,
          allowedModules: modulosSelecionados,
        },
      });
      if (error) throw new Error(error.message || 'Falha ao salvar módulos.');
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Módulos do usuário atualizados.');
      onChanged();
      setModulosTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar módulos.');
    } finally {
      setSalvandoModulos(false);
    }
  };

  const alternarBloqueio = async () => {
    if (!blockTarget) return;
    const bloqueando = (blockTarget.status ?? 'active') !== 'blocked';
    setProcessando(true);
    try {
      const { data, error } = await supabase.functions.invoke('set-tenant-user-status', {
        body: { user_id: blockTarget.user_id, blocked: bloqueando },
      });
      if (error) throw new Error(error.message || 'Falha ao alterar acesso.');
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(bloqueando ? 'Acesso bloqueado.' : 'Acesso liberado.');
      onChanged();
      setBlockTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao alterar acesso.');
    } finally {
      setProcessando(false);
    }
  };

  const excluirUsuario = async () => {
    if (!deleteTarget) return;
    setProcessando(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-tenant-user', {
        body: { user_id: deleteTarget.user_id },
      });
      if (error) throw new Error(error.message || 'Falha ao excluir usuário.');
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Usuário excluído.');
      onChanged();
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao excluir usuário.');
    } finally {
      setProcessando(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">
            Usuários {cliente.max_users != null && (
              <span className={cheio ? 'text-destructive' : 'text-muted-foreground'}>
                {usuarios.length} de {cliente.max_users}
              </span>
            )}
          </CardTitle>
          <CardDescription>
            {cliente.max_users == null
              ? 'Acesso de quem usa o sistema dentro do cliente. Plano sem limite de usuários.'
              : cheio
                ? 'Limite do plano atingido. Aumente em Visão geral para adicionar mais.'
                : `Restam ${cliente.max_users - usuarios.length} vaga(s) no plano.`}
          </CardDescription>
        </div>
        <Button
          size="sm"
          disabled={cheio}
          onClick={abrirAdicionar}
          title={cheio ? 'Limite de usuários do plano atingido' : undefined}
        >
          <UserPlus className="w-4 h-4 mr-2" /> Adicionar
        </Button>
      </CardHeader>
      <CardContent>
        {usuarios.length === 0 ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Este cliente está no ar sem nenhum usuário — ninguém consegue entrar. Adicione o admin.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Acesso</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.map((u) => {
                  const bloqueado = (u.status ?? 'active') === 'blocked';
                  const naoEntrou = u.force_password_change && !u.password_changed_at;
                  return (
                    <TableRow key={u.user_id}>
                      <TableCell className="font-medium">{u.full_name ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground break-all">{u.email ?? '—'}</TableCell>
                      <TableCell><Badge variant="outline">{u.role ?? '—'}</Badge></TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={bloqueado ? 'destructive' : 'default'} className={bloqueado ? '' : 'bg-ok hover:bg-ok'}>
                            {bloqueado ? 'Bloqueado' : 'Liberado'}
                          </Badge>
                          {naoEntrou && (
                            <Badge variant="outline" className="border-warn/50 text-warn dark:text-warn">
                              1º acesso
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            size="sm" variant="outline"
                            disabled={acao === `senha-${u.user_id}`}
                            onClick={() => reemitirSenha(u)}
                            title="Gera uma senha provisória na hora, sem depender de e-mail"
                          >
                            {acao === `senha-${u.user_id}`
                              ? <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                              : <KeyRound className="w-3 h-3 mr-2" />}
                            Resetar senha
                          </Button>
                          <Button
                            size="sm" variant="outline"
                            disabled={acao === `email-${u.user_id}`}
                            onClick={() => enviarEmailReset(u)}
                            title="Envia o link de redefinição para o e-mail do usuário"
                          >
                            {acao === `email-${u.user_id}`
                              ? <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                              : <Mail className="w-3 h-3 mr-2" />}
                            Enviar redefinição por email
                          </Button>
                          <Button
                            size="sm" variant="outline"
                            disabled={acao === `modulos-${u.user_id}`}
                            onClick={() => abrirEditarModulos(u)}
                            title="Controla o que este usuário enxerga, dentro do plano do cliente"
                          >
                            {acao === `modulos-${u.user_id}`
                              ? <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                              : <Settings2 className="w-3 h-3 mr-2" />}
                            Módulos
                          </Button>
                          <Button
                            size="sm"
                            variant={bloqueado ? 'default' : 'outline'}
                            onClick={() => setBlockTarget(u)}
                          >
                            {bloqueado ? <ShieldCheck className="w-3 h-3 mr-2" /> : <Ban className="w-3 h-3 mr-2" />}
                            {bloqueado ? 'Liberar' : 'Bloquear'}
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(u)} title="Excluir usuário">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={addOpen} onOpenChange={(o) => { if (!o && creds) return; setAddOpen(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{creds ? 'Credenciais de acesso' : 'Adicionar funcionário'}</DialogTitle>
            <DialogDescription>
              {creds ? 'Copie antes de fechar — a senha não é exibida de novo.' : `Novo usuário para ${cliente.name}.`}
            </DialogDescription>
          </DialogHeader>

          {creds ? (
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Link de acesso</Label>
                <div className="p-3 rounded-md bg-muted font-mono text-sm break-all">{PUBLIC_APP_URL}</div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">E-mail</Label>
                <div className="p-3 rounded-md bg-muted font-mono text-sm break-all">{creds.email}</div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Senha provisória</Label>
                <div className="p-3 rounded-md bg-muted font-mono text-sm break-all">{creds.password}</div>
              </div>
              <p className="text-xs text-muted-foreground">Troca obrigatória no primeiro acesso.</p>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  variant="outline"
                  onClick={() => copiar(`Acesso: ${PUBLIC_APP_URL} | E-mail: ${creds.email} | Senha provisória: ${creds.password}`)}
                >
                  {copiado ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                  Copiar credenciais
                </Button>
                <Button onClick={() => { setAddOpen(false); resetForm(); }}>Fechar</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="novo-nome">Nome *</Label>
                <Input id="novo-nome" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} maxLength={200} />
              </div>
              <EmailField id="novo-email" label="E-mail" value={novoEmail} onChange={setNovoEmail} required />
              <div className="space-y-2">
                <Label>Papel *</Label>
                <Select value={novoPapel} onValueChange={(v) => setNovoPapel(v as 'admin' | 'colaborador')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="colaborador">Colaborador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Módulos que este usuário vê</Label>
                <p className="text-xs text-muted-foreground">
                  Só aparece o que o plano de {cliente.name} já contratou.
                </p>
                <div className="rounded-md border border-border p-3 max-h-[280px] overflow-y-auto">
                  <ModulosPickerTree
                    planModules={planoAtual}
                    selecionados={novoModulos}
                    onToggle={toggleModuloKey(setNovoModulos)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setAddOpen(false); resetForm(); }} disabled={criando}>
                  Cancelar
                </Button>
                <Button onClick={criarUsuario} disabled={criando}>
                  {criando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Criar funcionário
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!blockTarget} onOpenChange={(o) => !o && setBlockTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {(blockTarget?.status ?? 'active') === 'blocked' ? 'Liberar acesso?' : 'Bloquear acesso?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(blockTarget?.status ?? 'active') === 'blocked'
                ? `${blockTarget?.full_name ?? blockTarget?.email} volta a conseguir entrar.`
                : `${blockTarget?.full_name ?? blockTarget?.email} é desconectado agora e não consegue mais entrar. O usuário e os dados dele continuam existindo.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={alternarBloqueio} disabled={processando}>
              {processando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              O acesso de <strong>{deleteTarget?.full_name ?? deleteTarget?.email}</strong> é removido
              e não volta. Para apenas cortar o acesso, use Bloquear.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={excluirUsuario}
              disabled={processando}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!modulosTarget} onOpenChange={(o) => !o && setModulosTarget(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Módulos de {modulosTarget?.full_name ?? modulosTarget?.email}</DialogTitle>
            <DialogDescription>
              O que este usuário enxerga, dentro do que o plano de {cliente.name} já contratou.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border p-3 max-h-[50vh] overflow-y-auto">
            <ModulosPickerTree
              planModules={planoAtual}
              selecionados={modulosSelecionados}
              onToggle={toggleModuloKey(setModulosSelecionados)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModulosTarget(null)} disabled={salvandoModulos}>
              Cancelar
            </Button>
            <Button onClick={salvarModulosUsuario} disabled={salvandoModulos}>
              {salvandoModulos && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar módulos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* --------------------------------------------------------------------- Módulos */

function AbaModulos({ cliente, onChanged }: { cliente: Cliente; onChanged: () => void }) {
  const [selecionados, setSelecionados] = useState<string[]>(cliente.plan_modules ?? []);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { setSelecionados(cliente.plan_modules ?? []); }, [cliente]);

  const salvar = async () => {
    setSalvando(true);
    try {
      // Grava exatamente o que está na tela + os fixos. A tela mostra a árvore inteira,
      // então nada some sem o operador ver — antes só o Financeiro era editável e o
      // resto era apagado no salvamento.
      const next = Array.from(new Set([...MODULOS_FIXOS, ...selecionados]));
      const { error } = await supabase.from('companies').update({ plan_modules: next }).eq('id', cliente.id);
      if (error) throw error;
      toast.success('Módulos atualizados.');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar módulos.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Módulos contratados</CardTitle>
        <CardDescription>Define o que o cliente enxerga.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ModulosPickerTree selecionados={selecionados} onToggle={toggleModuloKey(setSelecionados)} />
        <Button onClick={salvar} disabled={salvando}>
          {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Salvar módulos
        </Button>
      </CardContent>
    </Card>
  );
}

/* --------------------------------------------------------------------- Faturas */

const ESTADO_BADGE: Record<string, { label: string; className: string }> = {
  paga: { label: 'Paga', className: 'bg-ok hover:bg-ok' },
  aberta: { label: 'Em aberto', className: 'bg-blue-600 hover:bg-blue-600' },
  vencida: { label: 'Vencida', className: 'bg-destructive hover:bg-destructive' },
  cancelada: { label: 'Cancelada', className: 'bg-muted-foreground hover:bg-muted-foreground' },
};

function AbaFaturas({
  cliente, invoices, onChanged,
}: {
  cliente: Cliente;
  invoices: TenantInvoiceRow[];
  onChanged: () => void;
}) {
  const [acao, setAcao] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [novaOpen, setNovaOpen] = useState(false);
  const [novaComp, setNovaComp] = useState('');
  const [novoValor, setNovoValor] = useState('');
  const [novoVenc, setNovoVenc] = useState('');
  const [novaDesc, setNovaDesc] = useState('');
  const [criando, setCriando] = useState(false);

  const totais = useMemo(() => {
    let pago = 0, aberto = 0, vencido = 0;
    invoices.forEach((i) => {
      const estado = invoiceState(i);
      if (estado === 'paga') pago += Number(i.valor);
      else if (estado === 'vencida') vencido += Number(i.valor);
      else if (estado === 'aberta') aberto += Number(i.valor);
    });
    return { pago, aberto, vencido };
  }, [invoices]);

  const atualizarStatus = async (inv: TenantInvoiceRow, status: 'paga' | 'aberta' | 'cancelada') => {
    setAcao(inv.id);
    try {
      const { error } = await supabase
        .from('tenant_invoices')
        .update({
          status,
          pago_em: status === 'paga' ? new Date().toISOString().slice(0, 10) : null,
        })
        .eq('id', inv.id);
      if (error) throw error;
      toast.success(status === 'paga' ? 'Fatura marcada como paga.' : 'Fatura atualizada.');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao atualizar fatura.');
    } finally {
      setAcao(null);
    }
  };

  const gerarDoPlano = async () => {
    setGerando(true);
    try {
      const { data, error } = await supabase.rpc('generate_tenant_invoices_admin', { p_company_id: cliente.id });
      if (error) throw error;
      const n = Number(data ?? 0);
      toast.success(
        n > 0
          ? 'Fatura do mês gerada.'
          : 'Nada a gerar: a fatura deste mês já existe ou falta plano/dia de vencimento.',
      );
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao gerar fatura.');
    } finally {
      setGerando(false);
    }
  };

  const criarManual = async () => {
    const valor = Number(novoValor.replace(',', '.'));
    if (!novaComp) { toast.error('Informe a competência.'); return; }
    if (Number.isNaN(valor) || valor <= 0) { toast.error('Valor inválido.'); return; }
    if (!novoVenc) { toast.error('Informe o vencimento.'); return; }
    setCriando(true);
    try {
      const { error } = await supabase.from('tenant_invoices').insert({
        company_id: cliente.id,
        competencia: `${novaComp}-01`,
        descricao: novaDesc.trim() || null,
        valor,
        vencimento: novoVenc,
        origem: 'manual',
      });
      if (error) {
        throw new Error(
          error.code === '23505'
            ? 'Já existe uma fatura para essa competência.'
            : error.message,
        );
      }
      toast.success('Fatura criada.');
      setNovaOpen(false);
      setNovaComp(''); setNovoValor(''); setNovoVenc(''); setNovaDesc('');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao criar fatura.');
    } finally {
      setCriando(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">Faturas</CardTitle>
          <CardDescription>
            Pago {brl(totais.pago)} · Em aberto {brl(totais.aberto)} · Vencido {brl(totais.vencido)}
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={gerarDoPlano} disabled={gerando}>
            {gerando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Gerar do plano
          </Button>
          <Button size="sm" onClick={() => setNovaOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Fatura avulsa
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {invoices.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            {cliente.plan_price && cliente.billing_day
              ? 'Nenhuma fatura ainda. Use "Gerar do plano" para criar a deste mês.'
              : 'Defina plano, valor e dia de vencimento na aba Visão geral para gerar faturas.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Competência</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Pago em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => {
                  const estado = invoiceState(inv);
                  const badge = ESTADO_BADGE[estado];
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="tabular-nums">{competenciaBR(inv.competencia)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {inv.descricao ?? '—'}
                        {inv.origem === 'manual' && (
                          <Badge variant="outline" className="ml-2 text-[10px]">avulsa</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{brl(Number(inv.valor))}</TableCell>
                      <TableCell className="tabular-nums">{dateBR(inv.vencimento)}</TableCell>
                      <TableCell><Badge className={badge.className}>{badge.label}</Badge></TableCell>
                      <TableCell className="tabular-nums">{dateBR(inv.pago_em)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {estado === 'paga' ? (
                            <Button size="sm" variant="outline" disabled={acao === inv.id} onClick={() => atualizarStatus(inv, 'aberta')}>
                              Reabrir
                            </Button>
                          ) : estado === 'cancelada' ? (
                            <Button size="sm" variant="outline" disabled={acao === inv.id} onClick={() => atualizarStatus(inv, 'aberta')}>
                              Reativar
                            </Button>
                          ) : (
                            <>
                              <Button size="sm" disabled={acao === inv.id} onClick={() => atualizarStatus(inv, 'paga')}>
                                {acao === inv.id && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
                                Marcar paga
                              </Button>
                              <Button size="sm" variant="ghost" disabled={acao === inv.id} onClick={() => atualizarStatus(inv, 'cancelada')}>
                                Cancelar
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={novaOpen} onOpenChange={setNovaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fatura avulsa</DialogTitle>
            <DialogDescription>
              Para cobrança fora do plano. Só uma fatura por competência.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="nova-comp">Competência *</Label>
              <Input id="nova-comp" type="month" value={novaComp} onChange={(e) => setNovaComp(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="novo-valor">Valor (R$) *</Label>
              <Input id="novo-valor" value={novoValor} onChange={(e) => setNovoValor(e.target.value)} placeholder="0,00" inputMode="decimal" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="novo-venc">Vencimento *</Label>
              <Input id="novo-venc" type="date" value={novoVenc} onChange={(e) => setNovoVenc(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nova-desc">Descrição</Label>
              <Input id="nova-desc" value={novaDesc} onChange={(e) => setNovaDesc(e.target.value)} maxLength={200} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovaOpen(false)} disabled={criando}>Cancelar</Button>
            <Button onClick={criarManual} disabled={criando}>
              {criando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar fatura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ------------------------------------------------------------------- Histórico */

function AbaHistorico({ companyId }: { companyId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['clientes-externos', 'logs', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('global_logs')
        .select('id, action, details, entity_name, user_name, created_at')
        .eq('module', 'clientes_externos')
        .eq('entity_id', companyId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Histórico administrativo</CardTitle>
        <CardDescription>Suspensões, bloqueios de acesso e reemissões de senha.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma ação administrativa registrada.
          </p>
        ) : (
          <ul className="space-y-3">
            {(data ?? []).map((log) => (
              <li key={log.id} className="flex flex-col gap-1 border-b border-border/50 pb-3 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="outline">{log.action}</Badge>
                  <span>{log.entity_name}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {log.details} · {log.user_name ?? 'sistema'} ·{' '}
                  {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: ptBR })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
