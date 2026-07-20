import { useMemo, useState } from 'react';
import { format, addMonths, startOfMonth, parseISO, differenceInCalendarDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Landmark, Wallet, Search, AlertTriangle, CheckCircle2, HelpCircle, FlaskConical, Loader2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSicoobConciliacao, type SicoobLancamento, type BoletoParaMatch } from '@/hooks/useSicoobConciliacao';
import { cn } from '@/lib/utils';

const fmtBRL = (n: string | number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n));

const fmtDate = (s: string | null | undefined) => {
  if (!s) return '—';
  try { return format(parseISO(s.slice(0, 10)), 'dd/MM/yyyy'); } catch { return '—'; }
};

function getMonthOptions(): { value: string; mes: number; ano: number }[] {
  const now = startOfMonth(new Date());
  const months: { value: string; mes: number; ano: number }[] = [];
  for (let i = -5; i <= 0; i++) {
    const d = addMonths(now, i);
    months.push({ value: format(d, 'yyyy-MM-01'), mes: d.getMonth() + 1, ano: d.getFullYear() });
  }
  return months.reverse();
}

// Janela de tolerância entre a data do lançamento e o vencimento do boleto — cobre pagamento
// antecipado (desconto) e atraso. Sicoob não manda nenhum identificador de pagador nos lançamentos
// de "CRÉD.LIQUIDAÇÃO COBRANÇA" (nem numeroDocumento é o nosso_numero — confirmado em 20/07), então
// o cruzamento é por valor + proximidade de data, não por identificador único.
const JANELA_DIAS = 10;

interface Candidatos {
  pendentes: BoletoParaMatch[];
  pagos: BoletoParaMatch[];
}

function findCandidatos(lanc: SicoobLancamento, boletos: BoletoParaMatch[]): Candidatos {
  if (lanc.tipo !== 'CREDITO') return { pendentes: [], pagos: [] };
  const valorLanc = Math.abs(Number(lanc.valor));
  const dataLanc = parseISO(lanc.data.slice(0, 10));
  const bateValor = (b: BoletoParaMatch) => b.valor != null && Math.abs(Number(b.valor) - valorLanc) < 0.01;
  const bateJanela = (b: BoletoParaMatch) => {
    if (!b.data_vencimento) return false;
    return Math.abs(differenceInCalendarDays(dataLanc, parseISO(b.data_vencimento))) <= JANELA_DIAS;
  };
  const candidatos = boletos.filter((b) => bateValor(b) && bateJanela(b));
  return {
    pendentes: candidatos.filter((b) => b.status === 'PENDENTE'),
    pagos: candidatos.filter((b) => b.status === 'PAGO'),
  };
}

type CompStatus = 'BATE' | 'AMBIGUO' | 'JA_CONFIRMADO' | 'NAO_IDENTIFICADO';

function classificar(c: Candidatos): CompStatus {
  if (c.pendentes.length === 1) return 'BATE';
  if (c.pendentes.length > 1) return 'AMBIGUO';
  if (c.pagos.length > 0) return 'JA_CONFIRMADO';
  return 'NAO_IDENTIFICADO';
}

export default function ConciliacaoSicoob() {
  const monthOptions = useMemo(() => getMonthOptions(), []);
  const [periodo, setPeriodo] = useState(() => monthOptions[monthOptions.length - 1].value);
  const selected = monthOptions.find((m) => m.value === periodo) ?? monthOptions[monthOptions.length - 1];

  const {
    saldo, saldoLoading, saldoError,
    extrato, extratoLoading, extratoError,
    boletos, boletosLoading,
    confirmarBaixa,
  } = useSicoobConciliacao(selected.mes, selected.ano);

  // Filtros — Extrato completo
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState('ALL');
  const [valorMin, setValorMin] = useState('');
  const [valorMax, setValorMax] = useState('');

  // Filtros — Comparativo
  const [compStatus, setCompStatus] = useState<'ALL' | CompStatus>('ALL');
  const [compSearch, setCompSearch] = useState('');

  const [confirmTarget, setConfirmTarget] = useState<{ lanc: SicoobLancamento; candidatos: BoletoParaMatch[] } | null>(null);
  const [escolhido, setEscolhido] = useState<string>('');

  const tipos = useMemo(() => {
    const set = new Set((extrato?.transacoes ?? []).map((t) => t.tipo).filter(Boolean));
    return Array.from(set);
  }, [extrato]);

  const filteredExtrato = useMemo(() => {
    const term = search.trim().toLowerCase();
    const min = valorMin.trim() ? Number(valorMin.replace(',', '.')) : null;
    const max = valorMax.trim() ? Number(valorMax.replace(',', '.')) : null;
    return (extrato?.transacoes ?? []).filter((t) => {
      if (tipoFilter !== 'ALL' && t.tipo !== tipoFilter) return false;
      if (term) {
        const haystack = `${t.descricao ?? ''} ${t.descInfComplementar ?? ''} ${t.numeroDocumento ?? ''} ${t.cpfCnpj ?? ''}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      const valorAbs = Math.abs(Number(t.valor));
      if (min != null && !Number.isNaN(min) && !(valorAbs >= min)) return false;
      if (max != null && !Number.isNaN(max) && !(valorAbs <= max)) return false;
      return true;
    });
  }, [extrato, search, tipoFilter, valorMin, valorMax]);

  const comparativo = useMemo(() => {
    return (extrato?.transacoes ?? []).map((lanc) => {
      const candidatos = findCandidatos(lanc, boletos);
      return { lanc, candidatos, status: classificar(candidatos) };
    });
  }, [extrato, boletos]);

  const filteredComparativo = useMemo(() => {
    const term = compSearch.trim().toLowerCase();
    return comparativo.filter((row) => {
      if (compStatus !== 'ALL' && row.status !== compStatus) return false;
      if (term) {
        const nomes = [...row.candidatos.pendentes, ...row.candidatos.pagos].map((b) => b.contact_name).join(' ');
        const haystack = `${row.lanc.descricao ?? ''} ${nomes} ${row.lanc.numeroDocumento ?? ''}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [comparativo, compStatus, compSearch]);

  const pendentesRevisao = comparativo.filter((r) => r.status === 'AMBIGUO' || r.status === 'NAO_IDENTIFICADO').length;

  const openConfirm = (lanc: SicoobLancamento, candidatos: BoletoParaMatch[]) => {
    setEscolhido(candidatos.length === 1 ? candidatos[0].id : '');
    setConfirmTarget({ lanc, candidatos });
  };

  const handleConfirmarBaixa = () => {
    if (!confirmTarget || !escolhido) return;
    confirmarBaixa.mutate(
      { boletoId: escolhido, dataPagamento: confirmTarget.lanc.data.slice(0, 10), valorPago: Math.abs(Number(confirmTarget.lanc.valor)) },
      { onSuccess: () => setConfirmTarget(null) },
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between py-4 px-6 flex-wrap gap-4">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">Financeiro · Conciliação</p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Landmark className="w-7 h-7 text-primary" />
            Conciliação Sicoob
          </h1>
          <p className="text-[14px] text-muted-foreground">
            Extrato real da conta e comparativo com os dados do sistema — leitura e confirmação manual, sem baixa automática
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10">
          <FlaskConical className="h-3.5 w-3.5" /> Teste — confirme cada baixa manualmente
        </Badge>
      </div>

      {/* Saldo + período */}
      <div className="px-6 flex items-center gap-3 flex-wrap">
        <Card className="flex-1 min-w-[220px]">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground text-[11px] font-medium uppercase tracking-[0.05em]">
              <Wallet className="h-4 w-4" /><span>Saldo atual (Sicoob)</span>
            </div>
            {saldoLoading ? (
              <Skeleton className="h-8 w-32 mt-2" />
            ) : saldoError ? (
              <p className="text-sm text-destructive mt-2">{saldoError.message}</p>
            ) : (
              <p className="text-[1.75rem] font-bold mt-2 tracking-tight leading-none">{fmtBRL(saldo?.saldo)}</p>
            )}
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[220px]">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground text-[11px] font-medium uppercase tracking-[0.05em]">
              <span>Saldo bloqueado</span>
            </div>
            <p className="text-[1.75rem] font-bold mt-2 tracking-tight leading-none">
              {saldoLoading ? <Skeleton className="h-8 w-24" /> : fmtBRL(saldo?.saldoBloqueado)}
            </p>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[220px]">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground text-[11px] font-medium uppercase tracking-[0.05em]">
              <span>Limite disponível</span>
            </div>
            <p className="text-[1.75rem] font-bold mt-2 tracking-tight leading-none">
              {saldoLoading ? <Skeleton className="h-8 w-24" /> : fmtBRL(saldo?.saldoLimite)}
            </p>
          </CardContent>
        </Card>

        <Select value={periodo} onValueChange={setPeriodo}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Mês do extrato" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {format(parseISO(m.value), "MMMM 'de' yyyy", { locale: ptBR })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        <Tabs defaultValue="extrato">
          <TabsList>
            <TabsTrigger value="extrato">Extrato completo</TabsTrigger>
            <TabsTrigger value="comparativo" className="gap-1.5">
              Comparativo
              {pendentesRevisao > 0 && (
                <Badge variant="outline" className="h-5 px-1.5 border-amber-500/40 text-amber-700 dark:text-amber-400">
                  {pendentesRevisao}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ---------------- Extrato completo ---------------- */}
          <TabsContent value="extrato" className="space-y-4 mt-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por descrição, documento ou CPF/CNPJ…"
                  className="pl-9 w-[300px]"
                />
              </div>
              <Select value={tipoFilter} onValueChange={setTipoFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Tipo de lançamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos os tipos</SelectItem>
                  {tipos.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5">
                <Input type="number" inputMode="decimal" step="0.01" value={valorMin}
                  onChange={(e) => setValorMin(e.target.value)} placeholder="Valor mín." className="w-[110px]" />
                <span className="text-muted-foreground text-sm">–</span>
                <Input type="number" inputMode="decimal" step="0.01" value={valorMax}
                  onChange={(e) => setValorMax(e.target.value)} placeholder="Valor máx." className="w-[110px]" />
              </div>
              {(search || tipoFilter !== 'ALL' || valorMin || valorMax) && (
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground"
                  onClick={() => { setSearch(''); setTipoFilter('ALL'); setValorMin(''); setValorMax(''); }}>
                  <X className="h-3.5 w-3.5" /> Limpar filtros
                </Button>
              )}
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {extratoLoading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 5 }).map((__, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : extratoError ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-32 text-center text-destructive">{extratoError.message}</TableCell>
                      </TableRow>
                    ) : filteredExtrato.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">Nenhum lançamento no período</TableCell>
                      </TableRow>
                    ) : (
                      filteredExtrato.map((t) => (
                        <TableRow key={t.transactionId}>
                          <TableCell>{fmtDate(t.data)}</TableCell>
                          <TableCell className="max-w-[360px] truncate" title={t.descInfComplementar || undefined}>
                            {t.descricao}{t.descInfComplementar ? ` — ${t.descInfComplementar.replace(/\|@/g, ' ')}` : ''}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{t.numeroDocumento || '—'}</TableCell>
                          <TableCell>{t.tipo}</TableCell>
                          <TableCell className={cn('text-right font-medium', t.tipo === 'DEBITO' ? 'text-destructive' : 'text-success')}>
                            {t.tipo === 'DEBITO' ? '- ' : ''}{fmtBRL(t.valor)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- Comparativo ---------------- */}
          <TabsContent value="comparativo" className="space-y-4 mt-4">
            <p className="text-xs text-muted-foreground max-w-2xl">
              O Sicoob não manda identificador do boleto nos lançamentos de recebimento — o cruzamento é por
              valor + data próxima do vencimento (±{JANELA_DIAS} dias). Quando mais de um boleto bate, escolha
              manualmente antes de confirmar. Nenhuma baixa acontece sem essa confirmação.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={compSearch}
                  onChange={(e) => setCompSearch(e.target.value)}
                  placeholder="Buscar por cliente, descrição ou documento…"
                  className="pl-9 w-[300px]"
                />
              </div>
              <Select value={compStatus} onValueChange={(v: any) => setCompStatus(v)}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="BATE">Bate com um boleto</SelectItem>
                  <SelectItem value="AMBIGUO">Múltiplos candidatos</SelectItem>
                  <SelectItem value="JA_CONFIRMADO">Já confirmado</SelectItem>
                  <SelectItem value="NAO_IDENTIFICADO">Não identificado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Lançamento (Sicoob)</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Cliente / candidato(s)</TableHead>
                      <TableHead className="w-[160px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {extratoLoading || boletosLoading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 6 }).map((__, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : filteredComparativo.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">Nenhum lançamento no período</TableCell>
                      </TableRow>
                    ) : (
                      filteredComparativo.map((row) => {
                        const nomes = row.status === 'JA_CONFIRMADO'
                          ? row.candidatos.pagos.map((b) => b.contact_name).join(', ')
                          : row.candidatos.pendentes.map((b) => b.contact_name).join(', ');
                        return (
                          <TableRow key={row.lanc.transactionId}>
                            <TableCell>{fmtDate(row.lanc.data)}</TableCell>
                            <TableCell className="max-w-[260px] truncate">{row.lanc.descricao}</TableCell>
                            <TableCell className={cn('text-right font-medium', row.lanc.tipo === 'DEBITO' ? 'text-destructive' : 'text-success')}>
                              {fmtBRL(row.lanc.valor)}
                            </TableCell>
                            <TableCell>
                              {row.status === 'BATE' && (
                                <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400">Bate com boleto</Badge>
                              )}
                              {row.status === 'AMBIGUO' && (
                                <Badge className="bg-purple-500/15 text-purple-600 border-purple-500/30 dark:text-purple-400">
                                  <HelpCircle className="h-3 w-3 mr-1" />{row.candidatos.pendentes.length} candidatos
                                </Badge>
                              )}
                              {row.status === 'JA_CONFIRMADO' && (
                                <Badge className="bg-success/15 text-success border-success/30"><CheckCircle2 className="h-3 w-3 mr-1" />Já confirmado</Badge>
                              )}
                              {row.status === 'NAO_IDENTIFICADO' && row.lanc.tipo === 'CREDITO' && (
                                <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">
                                  <AlertTriangle className="h-3 w-3 mr-1" />Não identificado
                                </Badge>
                              )}
                              {row.lanc.tipo === 'DEBITO' && row.status === 'NAO_IDENTIFICADO' && (
                                <Badge variant="outline">Débito (fora de boleto)</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">{nomes || '—'}</TableCell>
                            <TableCell>
                              {(row.status === 'BATE' || row.status === 'AMBIGUO') && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5"
                                  onClick={() => openConfirm(row.lanc, row.candidatos.pendentes)}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar baixa
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Confirmação — ação humana explícita, nunca automática */}
      <AlertDialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar baixa do boleto?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {confirmTarget && (
                  <p>
                    Lançamento de {fmtBRL(confirmTarget.lanc.valor)} em {fmtDate(confirmTarget.lanc.data)}
                    {confirmTarget.candidatos.length > 1
                      ? ' — mais de um boleto com esse valor e vencimento próximo. Escolha qual é:'
                      : '.'}
                  </p>
                )}
                {confirmTarget && confirmTarget.candidatos.length > 1 && (
                  <Select value={escolhido} onValueChange={setEscolhido}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o cliente/boleto" />
                    </SelectTrigger>
                    <SelectContent>
                      {confirmTarget.candidatos.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.contact_name} — venc. {fmtDate(b.data_vencimento)} — {fmtBRL(b.valor)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {confirmTarget && confirmTarget.candidatos.length === 1 && (
                  <p className="font-medium text-foreground">
                    {confirmTarget.candidatos[0].contact_name} — venc. {fmtDate(confirmTarget.candidatos[0].data_vencimento)}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmarBaixa} disabled={confirmarBaixa.isPending || !escolhido}>
              {confirmarBaixa.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar baixa'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
