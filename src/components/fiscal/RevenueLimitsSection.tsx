import { useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Plus, Trash2, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { SearchableSelect } from '@/components/fiscal/SearchableSelect';

const TETO_SN = 4_800_000;
const SUBLIMITE_MG = 3_600_000;
const MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

const fmtBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);

type SnContact = { id: string; name: string };
type YtdRow = {
  contact_id: string;
  ytd_revenue: number;
  months_reported: number;
  avg_monthly: number;
  projected_annual: number;
};
type ClientStat = SnContact & YtdRow & { pct: number };

interface Props {
  year: number;
  regime: string;
}

export function RevenueLimitsSection({ year, regime }: Props) {
  const { company } = useCompany();
  const companyId = (company as any)?.id as string | undefined;
  const qc = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);

  const visible = regime === 'todos' || regime === 'Simples Nacional';

  const contactsQ = useQuery({
    queryKey: ['sn-contacts', companyId],
    enabled: !!companyId && visible,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, tax_regime, is_active')
        .eq('company_id', companyId!)
        .eq('tax_regime', 'simples_nacional')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as SnContact[];
    },
  });

  const ytdQ = useQuery({
    queryKey: ['client-revenue-ytd', companyId, year],
    enabled: !!companyId && visible,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('client_revenue_ytd')
        .select('contact_id, ytd_revenue, months_reported, avg_monthly, projected_annual')
        .eq('company_id', companyId)
        .eq('competence_year', year);
      if (error) throw error;
      return (data ?? []) as YtdRow[];
    },
  });

  const stats: ClientStat[] = useMemo(() => {
    const contacts = contactsQ.data ?? [];
    const ytdMap = new Map((ytdQ.data ?? []).map((r) => [r.contact_id, r]));
    return contacts
      .map((c) => {
        const r = ytdMap.get(c.id);
        const ytd = Number(r?.ytd_revenue ?? 0);
        const avg = Number(r?.avg_monthly ?? 0);
        const proj = Number(r?.projected_annual ?? 0);
        const months = Number(r?.months_reported ?? 0);
        return {
          ...c,
          contact_id: c.id,
          ytd_revenue: ytd,
          months_reported: months,
          avg_monthly: avg,
          projected_annual: proj,
          pct: TETO_SN > 0 ? (ytd / TETO_SN) * 100 : 0,
        };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [contactsQ.data, ytdQ.data]);

  if (!visible) return null;

  const critical = stats.filter((s) => s.pct >= 95);
  const warning = stats.filter((s) => s.pct >= 80 && s.pct < 95);
  const aboveSublimite = stats.filter((s) => s.ytd_revenue >= 0.75 * SUBLIMITE_MG);
  const loading = contactsQ.isLoading || ytdQ.isLoading;

  const statusBadge = (pct: number) => {
    if (pct >= 95) return <Badge className="bg-red-500/15 text-red-700 border-red-500/30">Crítico</Badge>;
    if (pct >= 80) return <Badge className="bg-yellow-500/15 text-yellow-700 border-yellow-500/30">Atenção</Badge>;
    return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">Regular</Badge>;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Faturamento e Teto SN — {year}
        </CardTitle>
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4" /> Registrar Faturamento</Button>
          </DialogTrigger>
          <RevenueDialog
            companyId={companyId}
            contacts={contactsQ.data ?? []}
            onClose={() => setOpenDialog(false)}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ['client-revenue-ytd'] });
              setOpenDialog(false);
            }}
          />
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alertas */}
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {critical.length > 0 && (
              <Alert className="bg-red-500/10 border-red-500/40">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <AlertDescription>
                  <div className="font-medium mb-1">Acima de 95% do teto ({critical.length})</div>
                  <ul className="text-sm space-y-0.5">
                    {critical.map((c) => (
                      <li key={c.id}>
                        <span className="font-medium">{c.name}</span> — {fmtBRL(c.ytd_revenue)} ({c.pct.toFixed(1)}%)
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            {warning.length > 0 && (
              <Alert className="bg-yellow-500/10 border-yellow-500/40">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertDescription>
                  <div className="font-medium mb-1">Entre 80% e 95% do teto ({warning.length})</div>
                  <ul className="text-sm space-y-0.5">
                    {warning.map((c) => (
                      <li key={c.id}>
                        <span className="font-medium">{c.name}</span> — {fmtBRL(c.ytd_revenue)} ({c.pct.toFixed(1)}%)
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            {critical.length === 0 && warning.length === 0 && (
              <Alert className="bg-emerald-500/10 border-emerald-500/40 md:col-span-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <AlertDescription>Nenhum cliente próximo do teto do Simples Nacional.</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Tabela */}
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Faturamento YTD</TableHead>
                <TableHead className="w-[200px]">% do Teto</TableHead>
                <TableHead className="text-right">Média Mensal</TableHead>
                <TableHead className="text-right">Projeção Anual</TableHead>
                <TableHead className="text-center">Meses</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : stats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhum cliente Simples Nacional encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                stats.map((s) => {
                  const currentMonth = new Date().getMonth() + 1;
                  const totalMonths = year === new Date().getFullYear() ? currentMonth : 12;
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right">{fmtBRL(s.ytd_revenue)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={Math.min(s.pct, 100)} className="h-2 flex-1" />
                          <span className="text-xs tabular-nums w-12 text-right">{s.pct.toFixed(1)}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{fmtBRL(s.avg_monthly)}</TableCell>
                      <TableCell className="text-right">{fmtBRL(s.projected_annual)}</TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {s.months_reported} de {totalMonths}
                      </TableCell>
                      <TableCell>{statusBadge(s.pct)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Sublimite MG */}
        <Alert className={aboveSublimite.length > 0 ? 'bg-yellow-500/10 border-yellow-500/40' : ''}>
          <AlertDescription className="text-sm">
            <span className="font-medium">Sublimite ICMS/ISS MG:</span> {fmtBRL(SUBLIMITE_MG)}/ano
            {aboveSublimite.length > 0 && (
              <span className="ml-2 text-yellow-700">
                — {aboveSublimite.length} cliente(s) acima de 75% deste sublimite
              </span>
            )}
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

// ====== Dialog de Registro ======
type DraftEntry = {
  contact_id: string;
  contact_name: string;
  competence_year: number;
  competence_month: number;
  gross_revenue: number;
  source: string;
  notes: string;
};

function RevenueDialog({
  companyId, contacts, onClose, onSaved,
}: {
  companyId?: string;
  contacts: SnContact[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const now = new Date();
  const [contactId, setContactId] = useState('all');
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [amount, setAmount] = useState<string>('');
  const [source, setSource] = useState<string>('Manual');
  const [notes, setNotes] = useState('');
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);

  const reset = () => {
    setContactId('all'); setAmount(''); setSource('Manual'); setNotes('');
  };

  const parsed = Number(String(amount).replace(/\./g, '').replace(',', '.'));

  const addDraft = () => {
    if (contactId === 'all' || !parsed || parsed <= 0) {
      toast.error('Selecione o cliente e informe um valor válido.');
      return;
    }
    const contact = contacts.find((c) => c.id === contactId);
    setDrafts((d) => [...d, {
      contact_id: contactId,
      contact_name: contact?.name ?? '—',
      competence_year: year,
      competence_month: month,
      gross_revenue: parsed,
      source,
      notes,
    }]);
    reset();
  };

  const removeDraft = (idx: number) => setDrafts((d) => d.filter((_, i) => i !== idx));

  const saveMut = useMutation({
    mutationFn: async (entries: DraftEntry[]) => {
      if (!companyId) throw new Error('Empresa não identificada');
      const rows = entries.map((e) => ({
        company_id: companyId,
        contact_id: e.contact_id,
        competence_year: e.competence_year,
        competence_month: e.competence_month,
        gross_revenue: e.gross_revenue,
        source: e.source,
        notes: e.notes || null,
      }));
      const { error } = await (supabase as any).from('client_revenue').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Faturamento(s) registrado(s) com sucesso.');
      setDrafts([]);
      reset();
      onSaved();
    },
    onError: (e: any) => toast.error(e.message ?? 'Erro ao salvar.'),
  });

  const saveSingle = () => {
    if (contactId === 'all' || !parsed || parsed <= 0) {
      toast.error('Selecione o cliente e informe um valor válido.');
      return;
    }
    const contact = contacts.find((c) => c.id === contactId);
    saveMut.mutate([{
      contact_id: contactId,
      contact_name: contact?.name ?? '—',
      competence_year: year,
      competence_month: month,
      gross_revenue: parsed,
      source,
      notes,
    }]);
  };

  const saveAll = () => {
    if (drafts.length === 0) {
      toast.error('Adicione ao menos um lançamento.');
      return;
    }
    saveMut.mutate(drafts);
  };

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const options = contacts.map((c) => ({ value: c.id, label: c.name }));

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Registrar Faturamento</DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium">Cliente (Simples Nacional)</label>
            <SearchableSelect
              value={contactId}
              onChange={setContactId}
              options={options}
              placeholder="Selecione o cliente"
              allLabel="—"
              width="w-full"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Mês</label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Ano</label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Valor bruto (R$)</label>
            <Input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
            />
            {parsed > 0 && (
              <p className="text-xs text-muted-foreground">{fmtBRL(parsed)}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Fonte</label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Manual">Manual</SelectItem>
                <SelectItem value="NF-e">NF-e</SelectItem>
                <SelectItem value="Sicoob">Sicoob</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium">Observações</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        {drafts.length > 0 && (
          <div className="border rounded-md p-2 space-y-1">
            <p className="text-xs font-medium text-muted-foreground px-1">
              Lançamentos pendentes ({drafts.length})
            </p>
            {drafts.map((d, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-sm bg-muted/40 rounded px-2 py-1">
                <span className="truncate">
                  <span className="font-medium">{d.contact_name}</span>
                  {' · '}{String(d.competence_month).padStart(2,'0')}/{d.competence_year}
                  {' · '}{fmtBRL(d.gross_revenue)} ({d.source})
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeDraft(i)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button variant="outline" onClick={addDraft}>
          <Plus className="h-4 w-4" /> Adicionar mais
        </Button>
        {drafts.length > 0 ? (
          <Button onClick={saveAll} disabled={saveMut.isPending}>
            Salvar todos ({drafts.length})
          </Button>
        ) : (
          <Button onClick={saveSingle} disabled={saveMut.isPending}>Salvar</Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}
