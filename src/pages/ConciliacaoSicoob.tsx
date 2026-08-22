import { useMemo, useState } from 'react';
import { format, addMonths, startOfMonth, parseISO, differenceInCalendarDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  RefreshCw, CheckCircle2, Loader2, X, FlaskConical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PageHeader, StatCardRow, DsAlert, DsBadge, SearchField, tabsListClass, tabsTriggerClass } from '@/components/ds';
import { SearchableSelect } from '@/components/fiscal/SearchableSelect';
import { useSicoobConciliacao, type SicoobLancamento, type BoletoParaMatch } from '@/hooks/useSicoobConciliacao';
import { cn } from '@/lib/utils';

const fmtBRL = (n: string | number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n));

const fmtDate = (s: string | null | undefined) => {
  if (!s) return '—';
  try { return format(parseISO(s.slice(0, 10)), 'dd/MM/yyyy'); } catch { return '—'; }
};

const tipoLabel = (tipo: string) => (tipo === 'CREDITO' ? 'Crédito' : tipo === 'DEBITO' ? 'Débito' : tipo);

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

// Texto real (não é copy nova) — já existia só na aba Divergências; agora também
// abre pelo "Ver detalhes" do banner de teste (22/08/2026), mesmo conteúdo nos 2 lugares.
const textoJanelaMatching = (
  <>
    O Sicoob não manda identificador do boleto nos lançamentos de recebimento — o cruzamento é por
    valor + data próxima do vencimento (±{JANELA_DIAS} dias). Quando mais de um boleto bate, escolha
    manualmente antes de confirmar. Nenhuma baixa acontece sem essa confirmação.
  </>
);

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

// Mapa de status real (4 estados) -> vocabulário visual do Figma (conciliado/sem par/divergente).
// BATE (achou 1 candidato, aguardando confirmação humana) não tem par 1:1 no Figma — mantido como
// estado próprio (tone "info") porque colapsá-lo em "conciliado" mentiria sobre o que já foi baixado.
function statusBadge(status: CompStatus, tipo: string): { tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral'; label: string } {
  if (status === 'JA_CONFIRMADO') return { tone: 'ok', label: 'Conciliado' };
  if (status === 'BATE') return { tone: 'info', label: 'Bate com boleto' };
  if (status === 'AMBIGUO') return { tone: 'danger', label: 'Divergente' };
  return tipo === 'CREDITO' ? { tone: 'warn', label: 'Sem par' } : { tone: 'neutral', label: 'Fora do escopo' };
}

export default function ConciliacaoSicoob() {
  const monthOptions = useMemo(() => getMonthOptions(), []);
  const [periodo, setPeriodo] = useState(() => monthOptions[monthOptions.length - 1].value);
  const selected = monthOptions.find((m) => m.value === periodo) ?? monthOptions[monthOptions.length - 1];

  const {
    saldo, saldoLoading, saldoError,
    extrato, extratoLoading, extratoError, refetchExtrato,
    boletos, boletosLoading,
    confirmarBaixa,
  } = useSicoobConciliacao(selected.mes, selected.ano);

  // Filtros — compartilhados pelas 4 abas (Figma mostra uma única barra de busca/filtros
  // abaixo das abas, válida para qualquer uma delas).
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState('all');
  const [valorMin, setValorMin] = useState('');
  const [valorMax, setValorMax] = useState('');

  const [confirmTarget, setConfirmTarget] = useState<{ lanc: SicoobLancamento; candidatos: BoletoParaMatch[] } | null>(null);
  const [escolhido, setEscolhido] = useState<string>('');

  const tipos = useMemo(() => {
    const set = new Set((extrato?.transacoes ?? []).map((t) => t.tipo).filter(Boolean));
    return Array.from(set);
  }, [extrato]);

  // Comparativo — todo lançamento do extrato (crédito ou débito) cruzado com os boletos abertos.
  // Fonte única para as 4 abas: cada uma só filtra por `status`, sem recalcular nada.
  const comparativo = useMemo(() => {
    return (extrato?.transacoes ?? []).map((lanc) => {
      const candidatos = findCandidatos(lanc, boletos);
      return { lanc, candidatos, status: classificar(candidatos) };
    });
  }, [extrato, boletos]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const min = valorMin.trim() ? Number(valorMin.replace(',', '.')) : null;
    const max = valorMax.trim() ? Number(valorMax.replace(',', '.')) : null;
    return comparativo.filter(({ lanc, candidatos, status }) => {
      if (tipoFilter !== 'all' && lanc.tipo !== tipoFilter) return false;
      const valorAbs = Math.abs(Number(lanc.valor));
      if (min != null && !Number.isNaN(min) && !(valorAbs >= min)) return false;
      if (max != null && !Number.isNaN(max) && !(valorAbs <= max)) return false;
      if (term) {
        const nomes = status === 'JA_CONFIRMADO'
          ? candidatos.pagos.map((b) => b.contact_name).join(' ')
          : candidatos.pendentes.map((b) => b.contact_name).join(' ');
        const haystack = `${lanc.descricao ?? ''} ${lanc.descInfComplementar ?? ''} ${lanc.numeroDocumento ?? ''} ${lanc.cpfCnpj ?? ''} ${nomes}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [comparativo, search, tipoFilter, valorMin, valorMax]);

  const pendentesRevisao = comparativo.filter((r) => r.status === 'AMBIGUO' || r.status === 'NAO_IDENTIFICADO').length;
  const conciliadosCount = comparativo.filter((r) => r.status === 'JA_CONFIRMADO').length;

  const totais = useMemo(() => {
    const txs = extrato?.transacoes ?? [];
    const entradas = txs.filter((t) => t.tipo === 'CREDITO').reduce((s, t) => s + Math.abs(Number(t.valor)), 0);
    const saidas = txs.filter((t) => t.tipo === 'DEBITO').reduce((s, t) => s + Math.abs(Number(t.valor)), 0);
    return { entradas, saidas };
  }, [extrato]);

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

  const hasActiveFilters = search || tipoFilter !== 'all' || valorMin || valorMax;
  const clearFilters = () => { setSearch(''); setTipoFilter('all'); setValorMin(''); setValorMax(''); };

  const renderTabela = (rows: typeof filteredRows) => {
    const total = extrato?.transacoes.length ?? 0;
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-line bg-paper">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Lançamento (Sicoob)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[150px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {extratoLoading || boletosLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : extratoError ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-danger">{extratoError.message}</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-ink">Nenhum movimento encontrado</TableCell>
                </TableRow>
              ) : (
                rows.map(({ lanc, candidatos, status }) => {
                  const nomes = status === 'JA_CONFIRMADO'
                    ? candidatos.pagos.map((b) => b.contact_name).join(', ')
                    : candidatos.pendentes.map((b) => b.contact_name).join(', ');
                  const badge = statusBadge(status, lanc.tipo);
                  return (
                    <TableRow key={lanc.transactionId}>
                      <TableCell className="whitespace-nowrap">{fmtDate(lanc.data)}</TableCell>
                      <TableCell className="max-w-[260px]">
                        <p className="truncate text-ink">{lanc.descricao}</p>
                        {lanc.descInfComplementar && (
                          <p className="truncate text-meta text-muted-ink">{lanc.descInfComplementar.replace(/\|@/g, ' ')}</p>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-ink">{lanc.numeroDocumento || '—'}</TableCell>
                      <TableCell>{tipoLabel(lanc.tipo)}</TableCell>
                      <TableCell className={cn('text-right font-medium', lanc.tipo === 'DEBITO' ? 'text-danger' : 'text-ok')}>
                        {lanc.tipo === 'DEBITO' ? '- ' : ''}{fmtBRL(lanc.valor)}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-ui">{nomes || '—'}</TableCell>
                      <TableCell><DsBadge tone={badge.tone}>{badge.label}</DsBadge></TableCell>
                      <TableCell>
                        {(status === 'BATE' || status === 'AMBIGUO') && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => openConfirm(lanc, candidatos.pendentes)}
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
        </div>
        <p className="text-meta text-muted-ink">
          {rows.length} de {total} movimentos · competência {String(selected.mes).padStart(2, '0')}/{selected.ano}
        </p>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="space-y-5 px-6 py-4">
        <PageHeader
          kicker="~/financeiro · conciliação"
          title="Conciliação Sicoob."
          subtitle="Extrato bancário confrontado com os lançamentos do sistema."
          actions={
            <Button variant="outline" className="gap-1.5" onClick={() => refetchExtrato()} disabled={extratoLoading}>
              <RefreshCw className="h-3.5 w-3.5" /> Sincronizar
            </Button>
          }
        />

        <DsAlert
          tone="warn"
          icon={<FlaskConical />}
          title="Teste — confirme cada baixa manualmente"
          description="Leitura e confirmação manual, sem baixa automática."
          action={
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0">Ver detalhes</Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 text-body-sm text-ink">
                {textoJanelaMatching}
              </PopoverContent>
            </Popover>
          }
        />

        {/* Faixa de saldos — card próprio, label em cima/valor embaixo (era texto solto em linha). */}
        <div className="flex flex-wrap gap-x-10 gap-y-2 rounded-lg border border-line bg-paper px-5 py-4">
          <div>
            <p className="text-kicker uppercase text-muted-ink-2">Saldo Sicoob</p>
            <p className="mt-1 font-mono text-ui-strong text-ink">{saldoLoading ? '…' : saldoError ? '—' : fmtBRL(saldo?.saldo)}</p>
          </div>
          <div>
            <p className="text-kicker uppercase text-muted-ink-2">Bloqueado</p>
            <p className="mt-1 font-mono text-ui-strong text-ink">{saldoLoading ? '…' : fmtBRL(saldo?.saldoBloqueado)}</p>
          </div>
          <div>
            <p className="text-kicker uppercase text-muted-ink-2">Limite Disponível</p>
            <p className="mt-1 font-mono text-ui-strong text-ink">{saldoLoading ? '…' : fmtBRL(saldo?.saldoLimite)}</p>
          </div>
        </div>

        <StatCardRow
          items={[
            { label: 'Não conciliados', value: pendentesRevisao, hint: 'exigem revisão manual', emphasis: pendentesRevisao > 0 ? 'warm' : 'none' },
            { label: 'Conciliados', value: conciliadosCount, hint: 'no período' },
            { label: 'Entradas', value: fmtBRL(totais.entradas), hint: 'no extrato' },
            { label: 'Saídas', value: fmtBRL(totais.saidas), hint: 'no extrato' },
          ]}
        />
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        <Tabs defaultValue="extrato">
          <TabsList className={tabsListClass}>
            <TabsTrigger className={tabsTriggerClass} value="extrato">Extrato completo</TabsTrigger>
            <TabsTrigger className={tabsTriggerClass} value="nao_conciliados">Não conciliados</TabsTrigger>
            <TabsTrigger className={tabsTriggerClass} value="conciliados">Conciliados</TabsTrigger>
            <TabsTrigger className={tabsTriggerClass} value="divergencias">Divergências</TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-2 py-4">
            <SearchField
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por descrição, documento ou CPF/CNPJ…"
              wrapperClassName="flex-1 min-w-[240px]"
            />

            {/* Sem ícone à esquerda (calendário/setas/sliders) nos 3 chips — Figma só tem texto + chevron do próprio Select (22/08/2026). */}
            <Select value={periodo} onValueChange={setPeriodo}>
              <SelectTrigger className="h-9 w-auto gap-2 rounded-sm border-line bg-paper px-3 text-ui text-ink [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:opacity-100 [&>svg]:text-muted-ink-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {format(parseISO(m.value), "MMMM 'de' yyyy", { locale: ptBR })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <SearchableSelect
              value={tipoFilter}
              onChange={setTipoFilter}
              options={tipos.map((t) => ({ value: t, label: tipoLabel(t) }))}
              placeholder="Tipo"
              allLabel="Todos os tipos"
              width="w-[110px]"
            />

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-sm border border-line bg-paper px-3 text-ui text-muted-ink transition-colors hover:bg-bg-2"
                >
                  Mais filtros
                  {(valorMin || valorMax) && <span className="h-1.5 w-1.5 rounded-full bg-action" />}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 space-y-2 p-3">
                <Label className="text-xs">Faixa de valor</Label>
                <div className="flex items-center gap-1.5">
                  <Input type="number" inputMode="decimal" step="0.01" value={valorMin}
                    onChange={(e) => setValorMin(e.target.value)} placeholder="Mín." className="h-9" />
                  <span className="text-muted-ink text-sm">–</span>
                  <Input type="number" inputMode="decimal" step="0.01" value={valorMax}
                    onChange={(e) => setValorMax(e.target.value)} placeholder="Máx." className="h-9" />
                </div>
                {(valorMin || valorMax) && (
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs"
                    onClick={() => { setValorMin(''); setValorMax(''); }}>
                    <X className="h-3.5 w-3.5" /> Limpar
                  </Button>
                )}
              </PopoverContent>
            </Popover>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-ink" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" /> Limpar filtros
              </Button>
            )}

            {/* Contador — mesmo valor real do rodapé da tabela, só repetido aqui em cima (Figma mostra nos 2 lugares). */}
            <span className="ml-auto shrink-0 text-meta text-muted-ink">
              {filteredRows.length} de {extrato?.transacoes.length ?? 0} movimentos · competência {String(selected.mes).padStart(2, '0')}/{selected.ano}
            </span>
          </div>

          <TabsContent value="extrato" className="mt-0">
            {renderTabela(filteredRows)}
          </TabsContent>

          <TabsContent value="nao_conciliados" className="mt-0">
            {renderTabela(filteredRows.filter((r) => r.status !== 'JA_CONFIRMADO'))}
          </TabsContent>

          <TabsContent value="conciliados" className="mt-0">
            {renderTabela(filteredRows.filter((r) => r.status === 'JA_CONFIRMADO'))}
          </TabsContent>

          <TabsContent value="divergencias" className="mt-0 space-y-3">
            <p className="max-w-2xl text-xs text-muted-foreground">{textoJanelaMatching}</p>
            {renderTabela(filteredRows.filter((r) => r.status === 'AMBIGUO'))}
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
