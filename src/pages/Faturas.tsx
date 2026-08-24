import { useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useCompany } from '@/hooks/useCompany';
import { PageHeader, StatCardRow, DsBadge, type BadgeTone } from '@/components/ds';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { invoiceState, type TenantInvoiceRow } from '@/hooks/useTenants';
import { brl, dateBR, competenciaBR, BILLING_CYCLE_LABEL } from '@/lib/tenant-format';

const ESTADO: Record<string, { label: string; tone: BadgeTone }> = {
  paga: { label: 'paga', tone: 'ok' },
  aberta: { label: 'em aberto', tone: 'info' },
  vencida: { label: 'vencida', tone: 'danger' },
  cancelada: { label: 'cancelada', tone: 'neutral' },
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

  const total = (invoices ?? []).length;

  const stats = useMemo(() => {
    const limite30 = new Date();
    limite30.setDate(limite30.getDate() - 30);
    const limite30ISO = limite30.toISOString().slice(0, 10);

    let abertoSum = 0, abertoCount = 0;
    let vencidoSum = 0, vencidoCount = 0;
    let pagas30 = 0;
    for (const inv of invoices ?? []) {
      const estado = invoiceState(inv);
      if (estado === 'aberta') { abertoSum += Number(inv.valor); abertoCount++; }
      if (estado === 'vencida') { vencidoSum += Number(inv.valor); vencidoCount++; }
      if (estado === 'paga' && inv.pago_em && inv.pago_em.slice(0, 10) >= limite30ISO) pagas30++;
    }
    return { abertoSum, abertoCount, vencidoSum, vencidoCount, pagas30 };
  }, [invoices]);

  if (isLoading || loadingCompany) return null;

  const isInternalCompany = (company as any)?.is_internal === true;
  const canSee = !isInternalCompany && (isAdmin || isSuperAdmin);
  if (!canSee) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/faturas"
        title="Faturas."
        subtitle={`Cobranças do escritório · ${total} no histórico.`}
      />

      <div className="rounded-lg border border-line bg-paper px-[22px] py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div>
            <p className="text-meta text-muted-ink-2">Plano contratado</p>
            <p className="text-ui text-ink">
              {(company as any)?.plan_name ?? 'Sem plano definido'}
              {(company as any)?.plan_price != null && (
                <span className="text-muted-ink">
                  {' '}· {brl(Number((company as any).plan_price))} / {BILLING_CYCLE_LABEL[(company as any)?.billing_cycle] ?? (company as any)?.billing_cycle}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-meta text-muted-ink-2">
            {(company as any)?.billing_day != null && <span>Vencimento dia {(company as any).billing_day}</span>}
            {(company as any)?.contract_start && <span>Contrato desde {dateBR((company as any).contract_start)}</span>}
            {(company as any)?.max_users != null && (
              <span>Até {(company as any).max_users} usuário{(company as any).max_users === 1 ? '' : 's'}</span>
            )}
          </div>
        </div>
      </div>

      <StatCardRow
        items={[
          {
            label: 'Em aberto',
            value: brl(stats.abertoSum),
            hint: stats.abertoCount === 0
              ? 'sem próximas cobranças'
              : `${stats.abertoCount} fatura${stats.abertoCount === 1 ? '' : 's'} a vencer`,
            emphasis: stats.abertoSum > 0 ? 'warm' : 'none',
          },
          {
            label: 'Saldo atrasado',
            value: brl(stats.vencidoSum),
            hint: `${stats.vencidoCount} fatura${stats.vencidoCount === 1 ? '' : 's'} vencida${stats.vencidoCount === 1 ? '' : 's'}`,
          },
          {
            label: 'Pagas · 30 dias',
            value: stats.pagas30,
            hint: `${stats.pagas30} fatura${stats.pagas30 === 1 ? '' : 's'} quitada${stats.pagas30 === 1 ? '' : 's'}`,
          },
          {
            label: 'Total histórico',
            value: total,
            hint: 'faturas registradas',
          },
        ]}
      />

      <div className="overflow-hidden rounded-lg border border-line bg-paper">
        {loadingInvoices ? (
          <div className="space-y-2 p-[22px]">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : total === 0 ? (
          <p className="py-12 text-center text-body text-muted-ink">
            Nenhuma fatura emitida ainda.
          </p>
        ) : (
          <>
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
                        <TableCell className="text-ink">{inv.descricao ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{brl(Number(inv.valor))}</TableCell>
                        <TableCell className="tabular-nums">{dateBR(inv.vencimento)}</TableCell>
                        <TableCell><DsBadge tone={badge.tone}>{badge.label}</DsBadge></TableCell>
                        <TableCell className="tabular-nums">{dateBR(inv.pago_em)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="border-t border-line px-[22px] py-3 text-meta text-muted-ink">
              {total} de {total} fatura{total === 1 ? '' : 's'}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
