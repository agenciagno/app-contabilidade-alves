import { useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useCompany } from '@/hooks/useCompany';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { invoiceState, type TenantInvoiceRow } from '@/hooks/useTenants';
import { brl, dateBR, competenciaBR, BILLING_CYCLE_LABEL } from '@/lib/tenant-format';

const ESTADO: Record<string, { label: string; className: string }> = {
  paga: { label: 'Paga', className: 'bg-emerald-600 hover:bg-emerald-600' },
  aberta: { label: 'Em aberto', className: 'bg-blue-600 hover:bg-blue-600' },
  vencida: { label: 'Vencida', className: 'bg-destructive hover:bg-destructive' },
  cancelada: { label: 'Cancelada', className: 'bg-muted-foreground hover:bg-muted-foreground' },
};

/**
 * Faturas da assinatura do sistema. Só o admin da empresa que assina vê —
 * equipe interna da CA e colaboradores não. O gate vive aqui também (e não só
 * no menu) porque a rota pode ser digitada na barra de endereço.
 */
export default function Faturas() {
  const { isAdmin, isSuperAdmin, isLoading } = useUserRole();
  const { company, isLoading: loadingCompany } = useCompany();

  const companyId = (company as any)?.id as string | undefined;

  const { data: invoices, isLoading: loadingInvoices } = useQuery({
    queryKey: ['minhas-faturas', companyId],
    queryFn: async (): Promise<TenantInvoiceRow[]> => {
      const { data, error } = await supabase
        .from('tenant_invoices')
        .select('id, company_id, competencia, descricao, valor, vencimento, pago_em, metodo, status, origem, observacao')
        .eq('company_id', companyId!)
        .order('vencimento', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TenantInvoiceRow[];
    },
    enabled: !!companyId,
  });

  const emAberto = useMemo(
    () => (invoices ?? []).filter((i) => {
      const estado = invoiceState(i);
      return estado === 'aberta' || estado === 'vencida';
    }),
    [invoices],
  );

  if (isLoading || loadingCompany) return null;

  const isInternalCompany = (company as any)?.is_internal === true;
  const canSee = !isInternalCompany && (isAdmin || isSuperAdmin);
  if (!canSee) return <Navigate to="/" replace />;

  const plano = (company as any)?.plan_name as string | null;
  const preco = (company as any)?.plan_price as number | null;
  const ciclo = (company as any)?.billing_cycle as string | null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Faturas</h1>
        <p className="text-sm text-muted-foreground">
          Histórico de pagamento da assinatura do sistema.
        </p>
      </div>

      {plano && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{plano}</CardTitle>
            <CardDescription>
              {preco ? brl(Number(preco)) : 'Valor a combinar'}
              {ciclo ? ` · ${BILLING_CYCLE_LABEL[ciclo] ?? ciclo}` : ''}
              {emAberto.length > 0 && ` · ${emAberto.length} fatura(s) em aberto`}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingInvoices ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (invoices ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhuma fatura emitida ainda.
            </p>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(invoices ?? []).map((inv) => {
                    const badge = ESTADO[invoiceState(inv)];
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="tabular-nums">{competenciaBR(inv.competencia)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{inv.descricao ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{brl(Number(inv.valor))}</TableCell>
                        <TableCell className="tabular-nums">{dateBR(inv.vencimento)}</TableCell>
                        <TableCell><Badge className={badge.className}>{badge.label}</Badge></TableCell>
                        <TableCell className="tabular-nums">{dateBR(inv.pago_em)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
