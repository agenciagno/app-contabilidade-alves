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
  tax_regime: string | null;
  responsible_id: string | null;
}

export function CalendarLaunchPreview({ rows, reviewed, onReviewedChange }: Props) {
  const { company } = useCompany();
  const companyId = company?.id;

  const { data: contacts = [], isLoading: contactsLoading } = useQuery<EligibleContact[]>({
    queryKey: ['fiscal-eligible-contacts', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, tax_regime, responsible_id')
        .eq('company_id', companyId!)
        .eq('is_active', true)
        .not('tax_regime', 'is', null);
      if (error) throw error;
      return ((data ?? []) as EligibleContact[]).filter((c) => {
        const v = (c.tax_regime ?? '').toString().trim().toLowerCase();
        return v !== '' && v !== 'nenhum';
      });
    },
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
    // For each row, count clients matching applies_to regimes
    const perObligation = rows.map((r) => {
      const applies = r.fiscal_obligations_catalog?.applies_to ?? [];
      const clients = contacts.filter((c) => applies.includes((c.tax_regime ?? '').toString()));
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
  }, [rows, contacts, profiles]);

  const overloaded = breakdown.perCollaborator.filter((c) => c.pct > 40);
  const loading = contactsLoading;

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
    <Card className="p-5 space-y-5 border-emerald-500/20 bg-emerald-500/[0.03]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
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
              className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
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
                            ? 'h-full bg-amber-500'
                            : c.pct > 25
                              ? 'h-full bg-emerald-500'
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
