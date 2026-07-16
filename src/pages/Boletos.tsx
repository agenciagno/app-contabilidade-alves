import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, addMonths, subMonths, startOfMonth, parseISO, isBefore, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  FileText, CheckCircle2, Clock, AlertCircle, Zap, Mail, MessageCircle, Printer,
  FileX, MoreHorizontal, Eye, Send, CheckSquare, Download, RefreshCw, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useBoletoControls, type BoletoWithContact } from '@/hooks/useBoletoControls';
import { BoletoGenerationDialog } from '@/components/financeiro/BoletoGenerationDialog';
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
  if (isOverdue(b)) {
    return <Badge className="bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/20">Vencido</Badge>;
  }
  if (b.status === 'PAGO') {
    return <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/20">Pago</Badge>;
  }
  if (b.status === 'FILA_IMPRESSAO') {
    return <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400 hover:bg-blue-500/20">Fila de Impressão</Badge>;
  }
  if (b.status === 'IMPRESSO') {
    return <Badge variant="outline">Impresso</Badge>;
  }
  return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20">Pendente</Badge>;
}

function CanalIcon({ canal }: { canal: BoletoWithContact['canal_entrega'] }) {
  if (!canal) return <span className="text-muted-foreground">—</span>;
  const cls = 'h-4 w-4';
  if (canal === 'whatsapp') return <span className="inline-flex items-center gap-1.5 text-sm"><MessageCircle className={cls} /> WhatsApp</span>;
  if (canal === 'email') return <span className="inline-flex items-center gap-1.5 text-sm"><Mail className={cls} /> E-mail</span>;
  if (canal === 'impresso') return <span className="inline-flex items-center gap-1.5 text-sm"><Printer className={cls} /> Impresso</span>;
  if (canal === 'whatsapp_email') return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <MessageCircle className={cls} /><Mail className={cls} /> WA + E-mail
    </span>
  );
  return <span className="text-sm">{canal}</span>;
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
  const [referenceMonth, setReferenceMonth] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-01'));
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDENTE' | 'PAGO' | 'VENCIDO' | 'FILA_IMPRESSAO'>('ALL');
  const [canalFilter, setCanalFilter] = useState<'ALL' | 'whatsapp' | 'email' | 'impresso' | 'whatsapp_email'>('ALL');
  const [page, setPage] = useState(1);
  const [detailsOf, setDetailsOf] = useState<BoletoWithContact | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ done: 0, total: 0 });
  const { toast } = useToast();

  const {
    boletoList, isLoading, markAsPrinted, resendBilling, fetchPreview, generateBoletos,
    listSyncContacts, findOrphanBoletos, downloadBoletoPdf,
  } = useBoletoControls(referenceMonth);

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
      toast({
        title: result.totalOrfaos > 0
          ? `${result.totalOrfaos} boleto(s) adicionado(s) à tabela`
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
    const totalPago = pago.reduce((s: number, b: BoletoWithContact) => s + (b.valor_pago ?? 0), 0);
    const pendentes = boletoList.filter((b: BoletoWithContact) => b.status === 'PENDENTE').length;
    const vencidos = boletoList.filter((b: BoletoWithContact) => isOverdue(b)).length;
    return { total, totalPago, pendentes, vencidos };
  }, [boletoList]);

  // Filtro
  const filtered = useMemo(() => {
    return (boletoList as BoletoWithContact[]).filter(b => {
      if (canalFilter !== 'ALL' && b.canal_entrega !== canalFilter) return false;
      if (statusFilter === 'ALL') return true;
      if (statusFilter === 'VENCIDO') return isOverdue(b);
      if (statusFilter === 'PENDENTE') return b.status === 'PENDENTE' && !isOverdue(b);
      return b.status === statusFilter;
    });
  }, [boletoList, statusFilter, canalFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="flex flex-col h-full">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between py-4 px-6 flex-wrap gap-4">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">Financeiro · Cobrança</p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FileText className="w-7 h-7 text-primary" />
            Controle de Boletos.
          </h1>
          <p className="text-[14px] text-muted-foreground">
            Painel da automação de cobrança
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {syncing
              ? `Sincronizando… ${syncProgress.done}/${syncProgress.total || '…'}`
              : 'Sincronizar com Sicoob'}
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setGenerateOpen(true)}
          >
            <Zap className="w-4 h-4" />
            Gerar boletos do mês
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="px-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<FileText className="h-4 w-4" />} label="Boletos gerados" value={String(kpis.total)} />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4 text-success" />} label="Total pago" value={fmtBRL(kpis.totalPago)} valueClass="text-success" />
        <KpiCard icon={<Clock className="h-4 w-4 text-amber-500" />} label="Pendentes" value={String(kpis.pendentes)} valueClass="text-amber-600 dark:text-amber-400" />
        <KpiCard icon={<AlertCircle className="h-4 w-4 text-destructive" />} label="Vencidos" value={String(kpis.vencidos)} valueClass="text-destructive" />
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 px-6 py-4 flex-wrap">
        <Select value={referenceMonth} onValueChange={(v) => { setReferenceMonth(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Mês de referência" />
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
          <SelectTrigger className="w-[180px]">
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
          <SelectTrigger className="w-[180px]">
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
      </div>

      {/* Tabela */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Data Pgto.</TableHead>
                  <TableHead>Valor Pago</TableHead>
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
                          <Link to={`/crm/cliente/${b.contact_id}`} className="hover:underline text-primary">
                            {b.contact_name}
                          </Link>
                        </TableCell>
                        <TableCell>{fmtBRL(b.valor)}</TableCell>
                        <TableCell className={cn(overdue && 'text-destructive font-medium')}>{fmtDate(b.data_vencimento)}</TableCell>
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
          </CardContent>
        </Card>

        {/* Paginação */}
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-4 text-sm">
            <span className="text-muted-foreground">
              Mostrando {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} de {filtered.length}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>
                Anterior
              </Button>
              <span className="px-3 py-1.5">{safePage} / {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>
                Próxima
              </Button>
            </div>
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
              {detailsOf.url_qrcode && (
                <div>
                  <p className="text-muted-foreground mb-1">QR Code</p>
                  <img src={detailsOf.url_qrcode} alt="QR Code" className="w-40 h-40 border rounded-md" />
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
        </DialogContent>
      </Dialog>

      {/* Dialog: geração de boletos (preview → seleção → progresso → resultado) */}
      <BoletoGenerationDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        referenceMonth={referenceMonth}
        fetchPreview={fetchPreview}
        generateBoletos={generateBoletos}
      />
    </div>
  );
}

function KpiCard({ icon, label, value, valueClass }: {
  icon: React.ReactNode; label: string; value: string; valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-muted-foreground text-[11px] font-medium uppercase tracking-[0.05em]">
          {icon}<span>{label}</span>
        </div>
        <p className={cn('text-[1.75rem] font-bold mt-2 tracking-tight leading-none', valueClass)}>{value}</p>
      </CardContent>
    </Card>
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
