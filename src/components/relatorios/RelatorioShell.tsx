import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { endOfMonth, endOfYear, format, startOfMonth, startOfYear, subMonths } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateField, PageHeader } from '@/components/ds';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useBanks } from '@/hooks/useBanks';
import { useCompany } from '@/hooks/useCompany';
import { mapaCategorias } from '@/lib/relatorios';
import { exportarCSV, exportarPDF, type TabelaExport } from '@/lib/relatorio-export';

export const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
export const dataBR = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
export const hojeISO = () => format(new Date(), 'yyyy-MM-dd');

/** Lançamentos e cadastros que todo relatório usa — mesmo recorte do Pagar/Receber
 *  (sem transferência entre contas e sem banco invisível). */
export function useDadosRelatorio() {
  const { transactions, isLoading: carregandoTx } = useTransactions();
  const { categories, isLoading: carregandoCat } = useCategories();
  const { banks } = useBanks();
  const { company } = useCompany();

  const txs = useMemo(() => {
    const invisiveis = new Set(banks.filter((b) => b.is_invisible).map((b) => b.id));
    return transactions.filter((t) => !t.is_transfer && !(t.bank_id && invisiveis.has(t.bank_id)));
  }, [transactions, banks]);
  const porId = useMemo(() => mapaCategorias(categories), [categories]);

  return { txs, porId, empresa: (company as { name?: string } | null)?.name ?? null, carregando: carregandoTx || carregandoCat };
}

// ─── Período ─────────────────────────────────────────────────────────

type Preset = 'mes' | 'mes_passado' | 'tres_meses' | 'ano_ate_mes' | 'ano' | 'personalizado';

function intervaloDo(preset: Exclude<Preset, 'personalizado'>) {
  const hoje = new Date();
  const f = (d: Date) => format(d, 'yyyy-MM-dd');
  switch (preset) {
    case 'mes': return { inicio: f(startOfMonth(hoje)), fim: f(endOfMonth(hoje)) };
    case 'mes_passado': { const m = subMonths(hoje, 1); return { inicio: f(startOfMonth(m)), fim: f(endOfMonth(m)) }; }
    case 'tres_meses': return { inicio: f(startOfMonth(subMonths(hoje, 2))), fim: f(endOfMonth(hoje)) };
    case 'ano_ate_mes': return { inicio: f(startOfYear(hoje)), fim: f(endOfMonth(hoje)) };
    case 'ano': return { inicio: f(startOfYear(hoje)), fim: f(endOfYear(hoje)) };
  }
}

export function usePeriodo(inicial: Exclude<Preset, 'personalizado'> = 'mes') {
  const [preset, setPreset] = useState<Preset>(inicial);
  const [intervalo, setIntervalo] = useState(() => intervaloDo(inicial));
  return {
    ...intervalo,
    preset,
    escolher: (p: Preset) => { setPreset(p); if (p !== 'personalizado') setIntervalo(intervaloDo(p)); },
    mudar: (campo: 'inicio' | 'fim', v: string) => { setPreset('personalizado'); setIntervalo((i) => ({ ...i, [campo]: v })); },
    rotulo: `Período: ${dataBR(intervalo.inicio)} a ${dataBR(intervalo.fim)}`,
  };
}

export function PeriodoFiltro({ periodo, legenda }: { periodo: ReturnType<typeof usePeriodo>; legenda?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {legenda && <span className="text-meta text-muted-ink">{legenda}</span>}
      <Select value={periodo.preset} onValueChange={(v) => v && periodo.escolher(v as Preset)}>
        <SelectTrigger className="h-9 w-[190px] border-line bg-paper text-ui"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="mes">Este mês</SelectItem>
          <SelectItem value="mes_passado">Mês passado</SelectItem>
          <SelectItem value="tres_meses">Últimos 3 meses</SelectItem>
          <SelectItem value="ano_ate_mes">Este ano até este mês</SelectItem>
          <SelectItem value="ano">Este ano inteiro</SelectItem>
          <SelectItem value="personalizado">Personalizado</SelectItem>
        </SelectContent>
      </Select>
      <DateField value={periodo.inicio} onChange={(v) => v && periodo.mudar('inicio', v)} className="w-[150px] [&_input]:h-9" />
      <span className="text-meta text-muted-ink">até</span>
      <DateField value={periodo.fim} onChange={(v) => v && periodo.mudar('fim', v)} className="w-[150px] [&_input]:h-9" />
    </div>
  );
}

// ─── Moldura de cada relatório ───────────────────────────────────────

export function RelatorioShell({
  titulo, descricao, filtros, exportar, carregando, vazio, mensagemVazio = 'Nenhum lançamento neste período.', onVoltar, children,
}: {
  titulo: string;
  descricao: string;
  filtros?: ReactNode;
  /** Monta a tabela de exportação na hora do clique (dados já calculados). */
  exportar: () => TabelaExport;
  carregando: boolean;
  vazio: boolean;
  mensagemVazio?: string;
  onVoltar: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2 gap-1.5 text-muted-ink" onClick={onVoltar}>
          <ArrowLeft className="h-4 w-4" /> Relatórios
        </Button>
        <PageHeader
          kicker="~/financeiro · relatórios"
          title={`${titulo}.`}
          subtitle={descricao}
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={carregando || vazio}><Download className="h-4 w-4" /> Exportar</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="gap-2" onClick={() => exportarPDF(exportar())}><FileText className="h-4 w-4" /> PDF</DropdownMenuItem>
                <DropdownMenuItem className="gap-2" onClick={() => exportarCSV(exportar())}><FileSpreadsheet className="h-4 w-4" /> Planilha (CSV)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      </div>
      {filtros}
      {carregando ? (
        <Card><CardContent className="space-y-3 p-6">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</CardContent></Card>
      ) : vazio ? (
        <Card><CardContent className="p-12 text-center text-meta text-muted-ink">{mensagemVazio}</CardContent></Card>
      ) : children}
    </div>
  );
}
