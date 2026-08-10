import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, CheckCircle2, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPages } from '@/lib/fetch-all';
import { useQuery } from '@tanstack/react-query';
import { useCompany } from '@/hooks/useCompany';
import { FiscalCalendarEffectiveRow } from '@/hooks/useFiscalCalendar';

interface Props {
  rows: FiscalCalendarEffectiveRow[];
  reviewed: boolean;
  onReviewedChange: (v: boolean) => void;
}

interface EligibleContact {
  id: string;
  name: string;
  responsible_id: string | null;
}

export function CalendarLaunchPreview({ rows, reviewed, onReviewedChange }: Props) {
  const { company } = useCompany();
  const companyId = company?.id;

  // Mesmo critério de elegibilidade do RPC generate_monthly_fiscal_tasks:
  // is_active, responsible_id definido e categorizado como 'cliente'.
  const { data: contacts = [], isLoading: contactsLoading } = useQuery<EligibleContact[]>({
    queryKey: ['fiscal-eligible-contacts', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, responsible_id')
        .eq('company_id', companyId!)
        .eq('is_active', true)
        .not('responsible_id', 'is', null)
        .contains('categorias', ['cliente']);
      if (error) throw error;
      return (data ?? []) as EligibleContact[];
    },
    enabled: !!companyId,
  });

  // Vínculo real por cliente (client_obligations) — a mesma fonte que o RPC usa.
  // Não usar fiscal_obligations_catalog.applies_to (regime) pra contar clientes: uma
  // obrigação pode aplicar a um regime mas só estar marcada em alguns clientes dele.
  const { data: clientObligations = [], isLoading: clientObligationsLoading } = useQuery<
    { obligation_id: string; contact_id: string }[]
  >({
    queryKey: ['client-obligations-all', companyId],
    queryFn: async () =>
      // fetchAllPages: a tabela já passa de 1000 linhas — sem isso o PostgREST
      // corta e o preview subconta clientes por obrigação.
      fetchAllPages<{ obligation_id: string; contact_id: string }>(() =>
        supabase
          .from('client_obligations')
          .select('obligation_id, contact_id')
          .eq('company_id', companyId!)
          .order('id', { ascending: true })
      ),
    enabled: !!companyId,
  });

  const { data: profiles = [] } = useQuery<{ id: string; full_name: string | null; email: string | null }[]>({
    queryKey: ['profiles-min', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('company_id', companyId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
  });

  const profileName = (id: string | null) => {
    if (!id) return 'Sem responsável';
    const p = profiles.find((x) => x.id === id);
    return p?.full_name || p?.email?.split('@')[0] || 'Desconhecido';
  };

  const breakdown = useMemo(() => {
    // Para cada obrigação, contar só os clientes com vínculo real em client_obligations
    // (o mesmo dado que o RPC generate_monthly_fiscal_tasks usa pra gerar as tarefas).
    const contactsById = new Map(contacts.map((c) => [c.id, c]));
    const perObligation = rows.map((r) => {
      const linkedContactIds = clientObligations
        .filter((co) => co.obligation_id === r.obligation_id)
        .map((co) => co.contact_id);
      const clients = linkedContactIds
        .map((id) => contactsById.get(id))
        .filter((c): c is EligibleContact => !!c);
      return {
        id: r.id,
        name: r.fiscal_obligations_catalog?.name ?? '—',
        clientCount: clients.length,
        clients,
        adjustedDueDate: r.adjusted_due_date,
        internalDeliveryDate: r.internal_delivery_date,
      };
    });

    // Per-collaborator counts (one task per client per obligation that applies)
    const byProfile = new Map<string, number>();
    let totalTasks = 0;
    const clientsTouched = new Set<string>();
    perObligation.forEach((o) => {
      o.clients.forEach((c) => {
        totalTasks += 1;
        clientsTouched.add(c.id);
        const key = c.responsible_id ?? '__none__';
        byProfile.set(key, (byProfile.get(key) ?? 0) + 1);
      });
    });

    const perCollaborator = Array.from(byProfile.entries())
      .map(([id, count]) => ({
        id: id === '__none__' ? null : id,
        name: id === '__none__' ? 'Sem responsável' : profileName(id),
        count,
        pct: totalTasks > 0 ? (count / totalTasks) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      perObligation,
      perCollaborator,
      totalTasks,
      clientCount: clientsTouched.size,
    };
  }, [rows, contacts, clientObligations, profiles]);

  const overloaded = breakdown.perCollaborator.filter((c) => c.pct > 40);
  const loading = contactsLoading || clientObligationsLoading;

  // Reset reviewed flag when rows change
  useEffect(() => {
    onReviewedChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const initials = (name: string) =>
    name
      .split(' ')
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';

  return (
    <Card className="p-5 space-y-5 border-ok/20 bg-ok/[0.03]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-ok" />
            Pré-lançamento
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {loading ? (
              <Skeleton className="h-4 w-64" />
            ) : (
              <>
                Serão geradas <strong className="text-foreground">{breakdown.totalTasks}</strong> tarefa(s) para{' '}
                <strong className="text-foreground">{breakdown.clientCount}</strong> cliente(s).
              </>
            )}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <Checkbox checked={reviewed} onCheckedChange={(v) => onReviewedChange(!!v)} />
          Revisei a distribuição
        </label>
      </div>

      {overloaded.length > 0 && (
        <div className="space-y-2">
          {overloaded.map((c) => (
            <div
              key={c.id ?? 'none'}
              className="flex items-start gap-3 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-warn dark:text-warn mt-0.5" />
              <p>
                <strong>{c.name}</strong> ficará com <strong>{c.pct.toFixed(0)}%</strong> das tarefas ({c.count}) — considere
                redistribuir.
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <h3 className="text-sm font-semibold mb-2">Por obrigação</h3>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Obrigação</TableHead>
                  <TableHead className="text-right w-20">Clientes</TableHead>
                  <TableHead className="w-28">Vencimento</TableHead>
                  <TableHead className="w-28">Entrega</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 4 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  breakdown.perObligation.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{o.clientCount}</TableCell>
                      <TableCell className="text-sm">{format(parseISO(o.adjustedDueDate), 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="text-sm">{format(parseISO(o.internalDeliveryDate), 'dd/MM/yyyy')}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Users className="h-4 w-4" /> Por colaborador
          </h3>
          <div className="space-y-2">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : breakdown.perCollaborator.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma tarefa será gerada.</p>
            ) : (
              breakdown.perCollaborator.map((c) => (
                <div
                  key={c.id ?? 'none'}
                  className="flex items-center gap-3 rounded-md border bg-background p-2.5"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                      {initials(c.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1">
                      <div
                        className={
                          c.pct > 40
                            ? 'h-full bg-warn'
                            : c.pct > 25
                              ? 'h-full bg-ok'
                              : 'h-full bg-primary'
                        }
                        style={{ width: `${Math.min(100, c.pct)}%` }}
                      />
                    </div>
                  </div>
                  <Badge variant="outline" className="tabular-nums">
                    {c.count} ({c.pct.toFixed(0)}%)
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
