import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, addMonths, subMonths, startOfMonth, parseISO, isBefore, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertCircle, Zap, Mail, MessageCircle, Printer,
  FileX, MoreHorizontal, Eye, Send, CheckSquare, Download, RefreshCw, Loader2,
  Search, CalendarIcon, X, Copy, SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PageHeader, StatCardRow, DsBadge } from '@/components/ds';
import { useBoletoControls, type BoletoWithContact } from '@/hooks/useBoletoControls';
import { BoletoGenerationDialog } from '@/components/financeiro/BoletoGenerationDialog';
import { IndividualBoletoDialog } from '@/components/financeiro/IndividualBoletoDialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const fmtBRL = (n: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

const fmtDate = (s: string | null) => {
  if (!s) return '—';
  try { return format(parseISO(s), 'dd/MM/yyyy'); } catch { return '—'; }
};

const PAGE_SIZE = 20;

function isOverdue(b: BoletoWithContact) {
  if (b.status !== 'PENDENTE') return false;
  if (!b.data_vencimento) return false;
  return isBefore(parseISO(b.data_vencimento), startOfDay(new Date()));
}

function StatusBadge({ b }: { b: BoletoWithContact }) {
  if (isOverdue(b)) return <DsBadge tone="danger">vencido</DsBadge>;
  if (b.status === 'PAGO') return <DsBadge tone="ok">pago</DsBadge>;
  if (b.status === 'FILA_IMPRESSAO') return <DsBadge tone="info">gerado</DsBadge>;
  if (b.status === 'IMPRESSO') return <DsBadge tone="neutral">impresso</DsBadge>;
  return <DsBadge tone="warn">a vencer</DsBadge>;
}

function CanalIcon({ canal }: { canal: BoletoWithContact['canal_entrega'] }) {
  if (!canal) return <span className="text-muted-ink-2">—</span>;
  const cls = 'h-3.5 w-3.5 text-muted-ink';
  if (canal === 'whatsapp') return <span className="inline-flex items-center gap-1.5 text-ui text-ink"><MessageCircle className={cls} /> WhatsApp</span>;
  if (canal === 'email') return <span className="inline-flex items-center gap-1.5 text-ui text-ink"><Mail className={cls} /> E-mail</span>;
  if (canal === 'impresso') return <span className="inline-flex items-center gap-1.5 text-ui text-ink"><Printer className={cls} /> Impresso</span>;
  if (canal === 'whatsapp_email') return (
    <span className="inline-flex items-center gap-1.5 text-ui text-ink">
      <MessageCircle className={cls} /><Mail className={cls} /> WA + E-mail
    </span>
  );
  return <span className="text-ui text-ink">{canal}</span>;
}

function getMonthOptions(): string[] {
  const now = startOfMonth(new Date());
  const months: string[] = [];
  for (let i = -5; i <= 1; i++) {
    months.push(format(addMonths(now, i), 'yyyy-MM-01'));
  }
  return months.reverse(); // mais recentes/futuros primeiro
}

export default function Boletos() {
  const monthOptions = useMemo(() => getMonthOptions(), []);
  const [vencimentoMonth, setVencimentoMonth] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-01'));
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDENTE' | 'PAGO' | 'VENCIDO' | 'FILA_IMPRESSAO'>('ALL');
  const [canalFilter, setCanalFilter] = useState<'ALL' | 'whatsapp' | 'email' | 'impresso' | 'whatsapp_email'>('ALL');
  const [search, setSearch] = useState('');
  const [valorMin, setValorMin] = useState('');
  const [valorMax, setValorMax] = useState('');
  const [pagamentoStart, setPagamentoStart] = useState<Date | null>(null);
  const [pagamentoEnd, setPagamentoEnd] = useState<Date | null>(null);
  const [page, setPage] = useState(1);
  const [detailsOf, setDetailsOf] = useState<BoletoWithContact | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [singleOpen, setSingleOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ done: 0, total: 0 });
  const { toast } = useToast();

  const {
    boletoList, isLoading, markAsPrinted, resendBilling, fetchPreview, generateBoletos,
    generateSingleBoleto, listSyncContacts, findOrphanBoletos, downloadBoletoPdf,
  } = useBoletoControls(vencimentoMonth);

  const handleSync = async () => {
    setSyncing(true);
    setSyncProgress({ done: 0, total: 0 });
    try {
      const contacts = await listSyncContacts();
      setSyncProgress({ done: 0, total: contacts.length });
      const result = await findOrphanBoletos(
        contacts.map((c) => c.contact_id),
        (done, total) => setSyncProgress({ done, total }),
      );
      const novidades = result.totalOrfaos > 0 || result.totalAtualizados > 0;
      toast({
        title: novidades
          ? [
              result.totalOrfaos > 0 ? `${result.totalOrfaos} boleto(s) adicionado(s)` : null,
              result.totalAtualizados > 0 ? `${result.totalAtualizados} marcado(s) como pago` : null,
            ].filter(Boolean).join(' · ')
          : 'Tudo em dia — nada de novo no Sicoob',
        description: `${result.contactsScanned} clientes consultados, ${result.totalEncontrados} boletos encontrados no Sicoob${result.errors > 0 ? `, ${result.errors} com erro` : ''}.`,
        variant: result.errors > 0 ? 'destructive' : 'default',
      });
    } catch (e: any) {
      toast({ title: 'Erro ao sincronizar', description: e?.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  // KPIs (sobre todo o mês, não a página)
  const kpis = useMemo(() => {
    const total = boletoList.length;
    const pago = boletoList.filter((b: BoletoWithContact) => b.status === 'PAGO');
    // `valor_pago` só é preenchido pela baixa manual na Conciliação — a sincronização com o
    // Sicoob marca PAGO mas não traz o valor (a API de cobrança não expõe valor pago em
    // nenhum endpoint). Somar só `valor_pago` fazia o card mostrar R$ 0,00 mesmo com dezenas
    // de boletos quitados; o fallback usa o valor emitido, e `estimado` avisa quando isso
    // acontece para ninguém ler o número como conciliado.
    const totalPago = pago.reduce((s: number, b: BoletoWithContact) => s + (b.valor_pago ?? b.valor ?? 0), 0);
    const estimado = pago.some((b: BoletoWithContact) => b.valor_pago == null);
    const pendentes = boletoList.filter((b: BoletoWithContact) => b.status === 'PENDENTE').length;
    const vencidos = boletoList.filter((b: BoletoWithContact) => isOverdue(b)).length;
    return { total, totalPago, estimado, pendentes, vencidos, liquidados: pago.length };
  }, [boletoList]);

  // Filtro
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const min = valorMin.trim() ? Number(valorMin.replace(',', '.')) : null;
    const max = valorMax.trim() ? Number(valorMax.replace(',', '.')) : null;
    return (boletoList as BoletoWithContact[]).filter(b => {
      if (canalFilter !== 'ALL' && b.canal_entrega !== canalFilter) return false;

      if (statusFilter !== 'ALL') {
        const matchesStatus =
          statusFilter === 'VENCIDO' ? isOverdue(b) :
          statusFilter === 'PENDENTE' ? b.status === 'PENDENTE' && !isOverdue(b) :
          b.status === statusFilter;
        if (!matchesStatus) return false;
      }

      if (term) {
        const haystack = `${b.contact_name} ${b.contact_document ?? ''} ${b.nosso_numero ?? ''} ${b.seu_numero ?? ''}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }

      if (min != null && !Number.isNaN(min) && !(b.valor != null && b.valor >= min)) return false;
      if (max != null && !Number.isNaN(max) && !(b.valor != null && b.valor <= max)) return false;

      if (pagamentoStart && (!b.data_pagamento || parseISO(b.data_pagamento) < pagamentoStart)) return false;
      if (pagamentoEnd && (!b.data_pagamento || parseISO(b.data_pagamento) > pagamentoEnd)) return false;

      return true;
    });
  }, [boletoList, statusFilter, canalFilter, search, valorMin, valorMax, pagamentoStart, pagamentoEnd]);

  const hasExtraFilters = !!search || !!valorMin || !!valorMax || !!pagamentoStart || !!pagamentoEnd;
  const clearExtraFilters = () => {
    setSearch(''); setValorMin(''); setValorMax('');
    setPagamentoStart(null); setPagamentoEnd(null);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/financeiro · cobrança"
        title="Controle de boletos."
        subtitle={`Painel da automação de cobrança · ${kpis.total} boleto${kpis.total === 1 ? '' : 's'} no mês.`}
        actions={
          <>
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 text-ui text-muted-ink transition-colors hover:text-ink disabled:opacity-60"
            >
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {syncing
                ? `Sincronizando… ${syncProgress.done}/${syncProgress.total || '…'}`
                : 'atualizar'}
            </button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setSingleOpen(true)}
            >
              <Zap className="h-4 w-4" />
              Boleto avulso
            </Button>
            <Button
              className="gap-2"
              onClick={() => setGenerateOpen(true)}
            >
              <Zap className="h-4 w-4" />
              Gerar lote
            </Button>
          </>
        }
      />

      <StatCardRow
        items={[
          { label: 'Boletos gerados', value: kpis.total, hint: 'no mês' },
          {
            label: 'Pendentes',
            value: kpis.pendentes,
            hint: 'aguardando pagamento',
            emphasis: kpis.pendentes > 0 ? 'warm' : 'none',
          },
          { label: 'Vencidos', value: kpis.vencidos, hint: 'em atraso' },
          {
            label: 'Liquidados',
            value: kpis.liquidados,
            hint: kpis.estimado ? `${fmtBRL(kpis.totalPago)} (estimado)` : fmtBRL(kpis.totalPago),
          },
        ]}
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-ink-2" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por cliente ou nosso número…"
            className="h-10 border-line bg-paper pl-9 text-ui"
          />
        </div>

        <Select value={vencimentoMonth} onValueChange={(v) => { setVencimentoMonth(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[180px] border-line bg-paper text-ui">
            <SelectValue placeholder="Mês de vencimento" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map(m => (
              <SelectItem key={m} value={m}>
                {format(parseISO(m), "MMMM 'de' yyyy", { locale: ptBR })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v: any) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[170px] border-line bg-paper text-ui">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os status</SelectItem>
            <SelectItem value="PENDENTE">Pendente</SelectItem>
            <SelectItem value="PAGO">Pago</SelectItem>
            <SelectItem value="VENCIDO">Vencido</SelectItem>
            <SelectItem value="FILA_IMPRESSAO">Fila de Impressão</SelectItem>
          </SelectContent>
        </Select>

        <Select value={canalFilter} onValueChange={(v: any) => { setCanalFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[170px] border-line bg-paper text-ui">
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os canais</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="email">E-mail</SelectItem>
            <SelectItem value="impresso">Impresso</SelectItem>
            <SelectItem value="whatsapp_email">WhatsApp + E-mail</SelectItem>
          </SelectContent>
        </Select>

        {/* Mais filtros — faixa de valor + data de pagamento, sem slot no Figma mas
            continuam funcionais (nada de real foi descartado, ver FiscalTasks.tsx). */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-sm border border-line bg-paper px-3 text-ui text-muted-ink transition-colors hover:bg-bg-2"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
              Mais filtros
              {(valorMin || valorMax || pagamentoStart || pagamentoEnd) && (
                <span className="h-1.5 w-1.5 rounded-full bg-action" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 space-y-3 p-3" align="start">
            <div className="space-y-1.5">
              <p className="text-xs text-muted-ink px-1">Faixa de valor</p>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number" inputMode="decimal" step="0.01"
                  value={valorMin}
                  onChange={(e) => { setValorMin(e.target.value); setPage(1); }}
                  placeholder="Valor mín."
                  className="h-9 border-line bg-paper text-ui"
                />
                <span className="text-muted-ink text-sm">–</span>
                <Input
                  type="number" inputMode="decimal" step="0.01"
                  value={valorMax}
                  onChange={(e) => { setValorMax(e.target.value); setPage(1); }}
                  placeholder="Valor máx."
                  className="h-9 border-line bg-paper text-ui"
                />
              </div>
            </div>

            <div className="space-y-1.5 border-t border-line pt-3">
              <p className="text-xs text-muted-ink px-1">Data de pagamento</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-ink-2 px-1">De</p>
                  <CalendarPicker
                    mode="single"
                    selected={pagamentoStart ?? undefined}
                    onSelect={(d) => { setPagamentoStart(d ?? null); setPage(1); }}
                    initialFocus
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-ink-2 px-1">Até</p>
                  <CalendarPicker
                    mode="single"
                    selected={pagamentoEnd ?? undefined}
                    onSelect={(d) => { setPagamentoEnd(d ?? null); setPage(1); }}
                  />
                </div>
              </div>
              {(pagamentoStart || pagamentoEnd) && (
                <Button
                  variant="ghost" size="sm" className="w-full gap-1.5"
                  onClick={() => { setPagamentoStart(null); setPagamentoEnd(null); setPage(1); }}
                >
                  <X className="h-3.5 w-3.5" /> Limpar período
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {hasExtraFilters && (
          <Button variant="ghost" size="sm" onClick={clearExtraFilters} className="gap-1.5 text-muted-ink">
            <X className="h-3.5 w-3.5" /> Limpar filtros
          </Button>
        )}
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-lg border border-line bg-paper">
        <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Data pgto.</TableHead>
                  <TableHead>Valor pago</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : pageRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-48 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <FileX className="h-10 w-10 opacity-30" />
                        <span>Nenhum boleto encontrado para o período selecionado</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  pageRows.map(b => {
                    const overdue = isOverdue(b);
                    const canResend = (b.status === 'PENDENTE' || overdue) && b.canal_entrega !== 'impresso';
                    const canMarkPrinted = b.status === 'FILA_IMPRESSAO';
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">
                          <div className="flex flex-col">
                            <Link to={`/crm/cliente/${b.contact_id}`} className="text-ink hover:underline">
                              {b.contact_name}
                            </Link>
                            {b.contact_document && (
                              <span className="text-xs text-muted-ink-2">{b.contact_document}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{fmtBRL(b.valor)}</TableCell>
                        <TableCell className={cn(overdue && 'text-danger font-medium')}>{fmtDate(b.data_vencimento)}</TableCell>
                        <TableCell><StatusBadge b={b} /></TableCell>
                        <TableCell><CanalIcon canal={b.canal_entrega} /></TableCell>
                        <TableCell>{fmtDate(b.data_pagamento)}</TableCell>
                        <TableCell>{fmtBRL(b.valor_pago)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setDetailsOf(b)}>
                                <Eye className="h-4 w-4 mr-2" /> Ver detalhes
                              </DropdownMenuItem>
                              {b.pdf_url && (
                                <DropdownMenuItem onClick={() => downloadBoletoPdf(b)}>
                                  <Download className="h-4 w-4 mr-2" /> Baixar PDF
                                </DropdownMenuItem>
                              )}
                              {canResend && (
                                <DropdownMenuItem
                                  onClick={() => resendBilling.mutate(b)}
                                  disabled={resendBilling.isPending}
                                >
                                  <Send className="h-4 w-4 mr-2" /> Reenviar cobrança
                                </DropdownMenuItem>
                              )}
                              {canMarkPrinted && (
                                <DropdownMenuItem
                                  onClick={() => markAsPrinted.mutate(b.id)}
                                  disabled={markAsPrinted.isPending}
                                >
                                  <CheckSquare className="h-4 w-4 mr-2" /> Marcar como impresso
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between text-meta text-muted-ink">
        <span>
          {pageRows.length} de {filtered.length} boleto{filtered.length === 1 ? '' : 's'} · ordenado por vencimento
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>
              Anterior
            </Button>
            <span className="px-3 py-1.5">{safePage} / {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>
              Próxima
            </Button>
          </div>
        )}
      </div>

      {/* Dialog: detalhes do boleto */}
      <Dialog open={!!detailsOf} onOpenChange={(o) => !o && setDetailsOf(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do boleto</DialogTitle>
            <DialogDescription>{detailsOf?.contact_name}</DialogDescription>
          </DialogHeader>
          {detailsOf && (
            <div className="space-y-3 text-sm">
              <Field label="Linha digitável" value={detailsOf.linha_digitavel} mono />
              <Field label="Código de barras" value={detailsOf.codigo_barras} mono />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nosso número" value={detailsOf.nosso_numero} />
                <Field label="Seu número" value={detailsOf.seu_numero} />
              </div>
              <EncargosSection b={detailsOf} />
              {detailsOf.url_qrcode && (
                <div>
                  <p className="text-muted-foreground mb-1">PIX copia e cola</p>
                  <div className="flex items-start gap-2">
                    <p className="font-mono text-xs break-all bg-muted/30 border rounded-md p-2 flex-1">
                      {detailsOf.url_qrcode}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(detailsOf.url_qrcode!);
                        toast({ title: 'Código Pix copiado' });
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              {detailsOf.sicoob_response && (
                <details className="border rounded-md p-3 bg-muted/30">
                  <summary className="cursor-pointer text-muted-foreground">Resposta Sicoob (debug)</summary>
                  <pre className="mt-2 text-xs overflow-auto max-h-60">
                    {JSON.stringify(detailsOf.sicoob_response, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}
          {detailsOf && (
            <DialogFooter>
              {detailsOf.pdf_url ? (
                <Button className="gap-2" onClick={() => downloadBoletoPdf(detailsOf)}>
                  <Download className="h-4 w-4" /> Baixar PDF
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">PDF não disponível para este boleto</span>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: geração de boletos (preview → seleção → progresso → resultado) */}
      <BoletoGenerationDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        fetchPreview={fetchPreview}
        generateBoletos={generateBoletos}
      />

      {/* Dialog: boleto avulso (busca cliente → valor/vencimento → geração) */}
      <IndividualBoletoDialog
        open={singleOpen}
        onOpenChange={setSingleOpen}
        fetchPreview={fetchPreview}
        generateSingleBoleto={generateSingleBoleto}
      />
    </div>
  );
}

// Padrão vigente: multa 2%, juros de mora 0,07%/dia. Boletos gerados pelo fluxo N8N antigo
// (antes de 16/07/2026) foram registrados no Sicoob com 2%/dia de juros por engano — o valor
// abaixo serve só pra sinalizar esse desvio na tela, não é usado em nenhum cálculo de geração.
const JUROS_DIA_ESPERADO = 0.07;

function EncargosSection({ b }: { b: BoletoWithContact }) {
  const r = b.sicoob_response;
  if (!r || (r.valorPrimeiroDesconto == null && r.valorMulta == null && r.valorJurosMora == null)) {
    return null;
  }
  const fmtPct = (v: number | undefined) =>
    v != null ? `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%` : '—';
  const jurosDivergente = r.valorJurosMora != null && Number(r.valorJurosMora) !== JUROS_DIA_ESPERADO;
  return (
    <div className="border rounded-md p-3 bg-muted/30 space-y-1 text-sm">
      <p className="text-muted-foreground text-xs mb-1.5">Desconto, multa e juros</p>
      {r.dataPrimeiroDesconto && (
        <p>Até {fmtDate(r.dataPrimeiroDesconto)}: <span className="text-success font-medium">{fmtPct(r.valorPrimeiroDesconto)} de desconto</span></p>
      )}
      {r.dataSegundoDesconto && (
        <p>Até {fmtDate(r.dataSegundoDesconto)}: <span className="text-success font-medium">{fmtPct(r.valorSegundoDesconto)} de desconto</span></p>
      )}
      {r.dataMulta && (
        <p>A partir de {fmtDate(r.dataMulta)}: <span className="text-destructive font-medium">{fmtPct(r.valorMulta)} de multa</span></p>
      )}
      {r.dataJurosMora && (
        <p>
          A partir de {fmtDate(r.dataJurosMora)}: <span className="text-destructive font-medium">{fmtPct(r.valorJurosMora)} de juros ao dia</span>
        </p>
      )}
      {jurosDivergente && (
        <div className="flex items-start gap-1.5 text-xs text-warn dark:text-warn bg-warn/10 border border-warn/30 rounded p-2 mt-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Juros registrado no Sicoob ({fmtPct(r.valorJurosMora)}/dia) diverge do padrão vigente ({JUROS_DIA_ESPERADO}%/dia).
            Provavelmente boleto gerado antes da correção de 16/07 — confirme com o banco antes de comunicar ao cliente.
          </span>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs mb-1">{label}</p>
      <p className={cn('break-all', mono && 'font-mono text-xs')}>{value || '—'}</p>
    </div>
  );
}
