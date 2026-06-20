import { useMemo, useState } from 'react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Search, Shield, Building } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

type Situacao = 'Ativa' | 'Suspensa' | 'Inapta' | 'Baixada' | string;

interface MonitorRow {
  id: string;
  contact_id: string;
  cnpj: string;
  situacao_anterior: string | null;
  situacao_nova: string;
  data_consulta: string;
  dados_completos: any;
}

interface ContactRow {
  id: string;
  name: string | null;
  document: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  tax_regime: string | null;
}

function formatCnpj(raw: string | null | undefined): string {
  if (!raw) return '—';
  const d = raw.replace(/\D/g, '');
  if (d.length !== 14) return raw;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function situacaoBadge(s: string | null | undefined) {
  const v = (s ?? '').toLowerCase();
  if (v.includes('ativ'))
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">
        Ativa
      </Badge>
    );
  if (v.includes('susp'))
    return (
      <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20">
        Suspensa
      </Badge>
    );
  if (v.includes('inap'))
    return (
      <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30 hover:bg-red-500/20">
        Inapta
      </Badge>
    );
  if (v.includes('baix'))
    return (
      <Badge className="bg-muted text-muted-foreground border-muted-foreground/30 hover:bg-muted">
        Baixada
      </Badge>
    );
  return <Badge variant="outline">{s ?? '—'}</Badge>;
}

function relativeDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return '—';
  }
}

export default function MonitorCNPJ() {
  const { company } = useCompany();
  const companyId = (company as any)?.id;

  const [situacaoFilter, setSituacaoFilter] = useState<string>('todas');
  const [search, setSearch] = useState('');
  const [openContactId, setOpenContactId] = useState<string | null>(null);

  // Contacts with CNPJ (14 digits)
  const contactsQ = useQuery({
    queryKey: ['monitor-cnpj', 'contacts', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('contacts')
        .select('id, name, document, razao_social, nome_fantasia, tax_regime')
        .eq('company_id', companyId)
        .eq('is_active', true);
      if (error) throw error;
      return ((data ?? []) as ContactRow[]).filter(
        (c) => (c.document ?? '').replace(/\D/g, '').length === 14
      );
    },
  });

  const monitorQ = useQuery({
    queryKey: ['monitor-cnpj', 'rows', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('monitor_cnpj')
        .select('*')
        .eq('company_id', companyId)
        .order('data_consulta', { ascending: false });
      if (error) throw error;
      return (data ?? []) as MonitorRow[];
    },
  });

  const contacts = contactsQ.data ?? [];
  const monitorRows = monitorQ.data ?? [];

  // Group monitor rows by contact_id
  const byContact = useMemo(() => {
    const m = new Map<string, MonitorRow[]>();
    monitorRows.forEach((r) => {
      const arr = m.get(r.contact_id) ?? [];
      arr.push(r);
      m.set(r.contact_id, arr);
    });
    // Each list is sorted desc by data_consulta (server order)
    return m;
  }, [monitorRows]);

  const lastCheckAt = monitorRows[0]?.data_consulta ?? null;

  // Build table rows
  const tableRows = useMemo(() => {
    return contacts.map((c) => {
      const history = byContact.get(c.id) ?? [];
      const latest = history[0];
      const lastChange = history.find(
        (r) => r.situacao_anterior && r.situacao_anterior !== r.situacao_nova
      );
      const displayName = c.nome_fantasia || c.razao_social || c.name || '—';
      return {
        contact: c,
        displayName,
        latest,
        situacaoAtual: latest?.situacao_nova ?? null,
        ultimaVerificacao: latest?.data_consulta ?? null,
        ultimaAlteracao: lastChange ?? null,
        history,
      };
    });
  }, [contacts, byContact]);

  // KPIs
  const kpis = useMemo(() => {
    const monitored = contacts.length;
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const changes30 = monitorRows.filter(
      (r) =>
        r.situacao_anterior &&
        r.situacao_anterior !== r.situacao_nova &&
        parseISO(r.data_consulta) >= since
    ).length;
    const irregular = tableRows.filter((r) => {
      const s = (r.situacaoAtual ?? '').toLowerCase();
      return s && !s.includes('ativ');
    }).length;
    return { monitored, changes30, irregular };
  }, [contacts, monitorRows, tableRows]);

  // Apply filters
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const sDigits = search.replace(/\D/g, '');
    return tableRows.filter((row) => {
      if (situacaoFilter !== 'todas') {
        const cur = (row.situacaoAtual ?? '').toLowerCase();
        if (!cur.includes(situacaoFilter.toLowerCase())) return false;
      }
      if (s) {
        const nameMatch = row.displayName.toLowerCase().includes(s);
        const cnpjMatch =
          sDigits.length > 0 &&
          (row.contact.document ?? '').replace(/\D/g, '').includes(sDigits);
        if (!nameMatch && !cnpjMatch) return false;
      }
      return true;
    });
  }, [tableRows, situacaoFilter, search]);

  const openRow = openContactId
    ? tableRows.find((r) => r.contact.id === openContactId) ?? null
    : null;

  const isLoading = contactsQ.isLoading || monitorQ.isLoading;
  const hasNoMonitorData = !isLoading && monitorRows.length === 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold">Monitor CNPJ</h1>
        </div>
        <Badge variant="outline" className="text-xs">
          Última verificação:{' '}
          {lastCheckAt
            ? format(parseISO(lastCheckAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
            : '—'}
        </Badge>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Clientes Monitorados</p>
              <p className="text-3xl font-semibold mt-1">{kpis.monitored}</p>
            </div>
            <Building className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Alterações (30 dias)</p>
              <p className="text-3xl font-semibold mt-1">{kpis.changes30}</p>
            </div>
            <Search className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Situação Irregular</p>
              <p
                className={cn(
                  'text-3xl font-semibold mt-1',
                  kpis.irregular > 0 ? 'text-red-600 dark:text-red-400' : ''
                )}
              >
                {kpis.irregular}
              </p>
            </div>
            <Shield className="h-5 w-5 text-red-500" />
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={situacaoFilter} onValueChange={setSituacaoFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas situações</SelectItem>
            <SelectItem value="ativ">Ativa</SelectItem>
            <SelectItem value="susp">Suspensa</SelectItem>
            <SelectItem value="inap">Inapta</SelectItem>
            <SelectItem value="baix">Baixada</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Buscar por nome ou CNPJ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {hasNoMonitorData ? (
            <div className="flex flex-col items-center justify-center text-center py-16 px-6 text-muted-foreground">
              <Search className="h-12 w-12 mb-3 opacity-50" />
              <p className="font-medium">Monitoramento CNPJ ainda não configurado.</p>
              <p className="text-sm mt-1">
                As verificações serão realizadas automaticamente via N8N.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Situação Atual</TableHead>
                  <TableHead>Última Verificação</TableHead>
                  <TableHead>Última Alteração</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={5}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                      Nenhum cliente encontrado para os filtros aplicados.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row) => (
                    <TableRow
                      key={row.contact.id}
                      className="cursor-pointer"
                      onClick={() => setOpenContactId(row.contact.id)}
                    >
                      <TableCell className="font-medium">{row.displayName}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatCnpj(row.contact.document)}
                      </TableCell>
                      <TableCell>{situacaoBadge(row.situacaoAtual)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {relativeDate(row.ultimaVerificacao)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.ultimaAlteracao ? (
                          <span>
                            {format(parseISO(row.ultimaAlteracao.data_consulta), 'dd/MM/yyyy')}{' '}
                            <span className="text-muted-foreground">
                              ({row.ultimaAlteracao.situacao_anterior} →{' '}
                              {row.ultimaAlteracao.situacao_nova})
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* History modal */}
      <Dialog
        open={!!openContactId}
        onOpenChange={(o) => !o && setOpenContactId(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{openRow?.displayName ?? 'Cliente'}</DialogTitle>
            <DialogDescription>
              {openRow ? (
                <span className="flex flex-wrap gap-3 mt-1">
                  <span>CNPJ: <span className="font-mono">{formatCnpj(openRow.contact.document)}</span></span>
                  {openRow.contact.tax_regime && (
                    <span>Regime: {openRow.contact.tax_regime}</span>
                  )}
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[50vh] overflow-y-auto">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
              Histórico de verificações
            </p>
            {openRow && openRow.history.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Sem verificações registradas ainda.
              </p>
            ) : (
              <ol className="relative border-l border-border ml-2 space-y-4 pl-4">
                {openRow?.history.map((h) => {
                  const changed =
                    h.situacao_anterior && h.situacao_anterior !== h.situacao_nova;
                  return (
                    <li key={h.id} className="relative">
                      <span
                        className={cn(
                          'absolute -left-[21px] top-1.5 h-3 w-3 rounded-full border-2 border-background',
                          changed ? 'bg-orange-500' : 'bg-muted-foreground/40'
                        )}
                      />
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">
                          {format(parseISO(h.data_consulta), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                        {situacaoBadge(h.situacao_nova)}
                      </div>
                      {changed ? (
                        <p className="text-xs text-muted-foreground mt-1">
                          Alteração: <strong>{h.situacao_anterior}</strong> →{' '}
                          <strong>{h.situacao_nova}</strong>
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">
                          Sem alteração desde a última verificação.
                        </p>
                      )}
                      {h.dados_completos?.observacoes && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {String(h.dados_completos.observacoes)}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <DialogFooter>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button variant="outline" disabled>
                      <Search className="h-4 w-4" /> Verificar agora
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Verificação automática semanal via N8N</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
