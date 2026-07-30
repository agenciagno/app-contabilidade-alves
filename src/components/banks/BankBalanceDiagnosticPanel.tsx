import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, Bug } from 'lucide-react';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { useBanks } from '@/hooks/useBanks';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

const PAGE_SIZE = 1000;

async function fetchAllPaidTxThisYear() {
  const firstOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];
  let all: any[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, bank_id, type, amount, paid_amount, date, is_paid')
      .is('deleted_at', null)
      .eq('is_paid', true)
      .gte('date', firstOfYear)
      .lte('date', today)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

async function fetchAllPriorPaidTx() {
  const firstOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
  let all: any[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, bank_id, type, amount, paid_amount')
      .is('deleted_at', null)
      .eq('is_paid', true)
      .lt('date', firstOfYear)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

export function BankBalanceDiagnosticPanel() {
  const { isSuperAdmin } = useSuperAdmin();
  const { banks } = useBanks();
  const [open, setOpen] = useState(false);

  const { data: paidThisYear = [] } = useQuery({
    queryKey: ['diag-paid-this-year'],
    queryFn: fetchAllPaidTxThisYear,
    enabled: isSuperAdmin && open,
    staleTime: 1000 * 30,
  });

  const { data: priorPaid = [] } = useQuery({
    queryKey: ['diag-prior-paid'],
    queryFn: fetchAllPriorPaidTx,
    enabled: isSuperAdmin && open,
    staleTime: 1000 * 30,
  });

  if (!isSuperAdmin) return null;

  const sumByBank = (rows: any[]) => {
    const m = new Map<string | null, number>();
    rows.forEach((t) => {
      const eff = t.paid_amount != null ? Number(t.paid_amount) : Number(t.amount);
      const signed = t.type === 'receita' ? eff : -eff;
      m.set(t.bank_id ?? null, (m.get(t.bank_id ?? null) ?? 0) + signed);
    });
    return m;
  };

  const priorByBank = sumByBank(priorPaid);
  const yearByBank = sumByBank(paidThisYear);

  const allBankIds = new Set<string | null>([
    ...banks.map((b) => b.id as string | null),
    ...Array.from(priorByBank.keys()),
    ...Array.from(yearByBank.keys()),
  ]);

  const rows = Array.from(allBankIds).map((bid) => {
    const bank = banks.find((b) => b.id === bid);
    const initial = bank ? Number(bank.initial_balance) : 0;
    const prior = priorByBank.get(bid) ?? 0;
    const year = yearByBank.get(bid) ?? 0;
    return {
      id: bid,
      name: bank?.name ?? (bid == null ? '— SEM banco (NULL) —' : `— Banco órfão (${bid?.slice(0, 8)}…) —`),
      is_active: bank?.is_active ?? false,
      is_invisible: bank?.is_invisible ?? false,
      exists: !!bank,
      initial_balance: initial,
      prior,
      year,
      computed: initial + prior + year,
    };
  });

  const visibleActive = rows.filter((r) => r.exists && r.is_active && !r.is_invisible);
  const sumOfCards = visibleActive.reduce((s, r) => s + r.computed, 0);

  // Hook total replication: base = sum(initial of active visible) + sum prior in those + sum year in those
  const activeVisibleIds = new Set(visibleActive.map((r) => r.id));
  const baseBalance = banks.filter((b) => b.is_active && !b.is_invisible).reduce((s, b) => s + Number(b.initial_balance), 0);
  const priorInActive = priorPaid
    .filter((t) => activeVisibleIds.has(t.bank_id))
    .reduce((s, t) => {
      const eff = t.paid_amount != null ? Number(t.paid_amount) : Number(t.amount);
      return s + (t.type === 'receita' ? eff : -eff);
    }, 0);
  const yearInActive = paidThisYear
    .filter((t) => activeVisibleIds.has(t.bank_id))
    .reduce((s, t) => {
      const eff = t.paid_amount != null ? Number(t.paid_amount) : Number(t.amount);
      return s + (t.type === 'receita' ? eff : -eff);
    }, 0);
  const aggregateTotal = baseBalance + priorInActive + yearInActive;

  const diff = aggregateTotal - sumOfCards;

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bug className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              Diagnóstico de Saldos (Super Admin)
            </h3>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>

        {open && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="p-3 rounded-md bg-background/60 border border-border/50">
                <p className="text-xs text-muted-foreground">Soma dos cards (ativos visíveis)</p>
                <p className="font-semibold">{fmt(sumOfCards)}</p>
              </div>
              <div className="p-3 rounded-md bg-background/60 border border-border/50">
                <p className="text-xs text-muted-foreground">Total agregado (hook)</p>
                <p className="font-semibold">{fmt(aggregateTotal)}</p>
              </div>
              <div className={`p-3 rounded-md border ${Math.abs(diff) > 0.005 ? 'bg-destructive/10 border-destructive/40' : 'bg-green-500/10 border-green-500/40'}`}>
                <p className="text-xs text-muted-foreground">Diferença</p>
                <p className="font-semibold">{fmt(diff)}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-border/50">
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2 pr-2">Banco</th>
                    <th className="py-2 px-2">Status</th>
                    <th className="py-2 px-2 text-right">Inicial</th>
                    <th className="py-2 px-2 text-right">Prior pago</th>
                    <th className="py-2 px-2 text-right">Ano pago</th>
                    <th className="py-2 pl-2 text-right">Saldo calc.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id ?? 'null'} className="border-b border-border/30">
                      <td className="py-2 pr-2 font-medium">{r.name}</td>
                      <td className="py-2 px-2">
                        <div className="flex flex-wrap gap-1">
                          {!r.exists && <Badge variant="destructive" className="text-[10px]">ÓRFÃO</Badge>}
                          {r.exists && r.is_active && <Badge className="text-[10px] bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/40">Ativo</Badge>}
                          {r.exists && !r.is_active && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
                          {r.is_invisible && <Badge variant="destructive" className="text-[10px]">Invisível</Badge>}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmt(r.initial_balance)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmt(r.prior)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmt(r.year)}</td>
                      <td className="py-2 pl-2 text-right tabular-nums font-semibold">{fmt(r.computed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground">
              Bancos marcados em <span className="text-destructive font-medium">ÓRFÃO</span> indicam transações pagas
              cujo <code>bank_id</code> não existe mais na tabela de bancos. Bancos <strong>Inativos</strong> ou{' '}
              <strong>Invisíveis</strong> não entram no total agregado, mas podem ter transações que indicam dado órfão.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
