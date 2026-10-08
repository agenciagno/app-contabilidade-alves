import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatCardRow, segmentedListClass, segmentedTriggerClass } from '@/components/ds';
import { cn } from '@/lib/utils';
import { relDre, type BaseDre, type BlocoDre } from '@/lib/relatorios';
import type { LinhaExport } from '@/lib/relatorio-export';
import { RelatorioShell, PeriodoFiltro, usePeriodo, useDadosRelatorio, brl } from './RelatorioShell';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (k: string) => `${MESES[Number(k.slice(5, 7)) - 1]}/${k.slice(2, 4)}`;
const pct = (v: number, base: number) => (base ? `${((v / base) * 100).toFixed(1).replace('.', ',')}%` : '—');
const num = 'text-right tabular-nums whitespace-nowrap';

/**
 * DRE simplificada do cliente externo: Receitas − Despesas = Resultado, montada das
 * categorias que ele mesmo cadastrou (macro com subeventos abertos embaixo). Não usa a
 * DRE da CA, que depende dos Eventos Contábeis com nome fixo de seção.
 */
export function DreSimplificada({ onVoltar }: { onVoltar: () => void }) {
  const { txs, porId, empresa, carregando } = useDadosRelatorio();
  const periodo = usePeriodo('ano_ate_mes');
  const [base, setBase] = useState<BaseDre>('realizado');
  const dre = useMemo(() => relDre(txs, periodo.inicio, periodo.fim, base, porId), [txs, periodo.inicio, periodo.fim, base, porId]);
  const receitaTotal = dre.receitas.total;
  const baseRotulo = base === 'realizado' ? 'Realizado (data do pagamento)' : 'Previsto (data do vencimento)';

  const exportBloco = (nome: string, b: BlocoDre): LinhaExport[] => [
    { celulas: [nome, ...b.meses.map(brl), brl(b.total), pct(b.total, receitaTotal)], destaque: true },
    ...b.linhas.map((l) => ({
      celulas: [`${l.nivel === 'sub' ? '      ' : '  '}${l.nome}`, ...l.meses.map(brl), brl(l.total), pct(l.total, receitaTotal)],
    })),
  ];

  const Bloco = ({ nome, b, tom }: { nome: string; b: BlocoDre; tom: 'ok' | 'danger' }) => (
    <>
      <TableRow className="bg-bg-2 hover:bg-bg-2">
        <TableCell className="sticky left-0 bg-bg-2 font-semibold text-ink">{nome}</TableCell>
        {b.meses.map((v, i) => <TableCell key={i} className={cn(num, 'font-semibold')}>{v ? brl(v) : '—'}</TableCell>)}
        <TableCell className={cn(num, 'font-semibold', tom === 'ok' ? 'text-ok' : 'text-danger')}>{brl(b.total)}</TableCell>
        <TableCell className={cn(num, 'font-semibold text-muted-ink')}>{pct(b.total, receitaTotal)}</TableCell>
      </TableRow>
      {b.linhas.length === 0 && (
        <TableRow><TableCell colSpan={b.meses.length + 3} className="pl-6 text-meta text-muted-ink">Nada neste período.</TableCell></TableRow>
      )}
      {b.linhas.map((l) => (
        <TableRow key={`${l.nivel}-${l.id}`}>
          <TableCell className={cn('sticky left-0 bg-paper', l.nivel === 'sub' ? 'pl-10 text-muted-ink' : 'pl-6 font-medium text-ink')}>{l.nome}</TableCell>
          {l.meses.map((v, i) => <TableCell key={i} className={cn(num, l.nivel === 'sub' && 'text-muted-ink')}>{v ? brl(v) : '—'}</TableCell>)}
          <TableCell className={cn(num, l.nivel === 'macro' && 'font-medium')}>{brl(l.total)}</TableCell>
          <TableCell className={cn(num, 'text-muted-ink')}>{pct(l.total, receitaTotal)}</TableCell>
        </TableRow>
      ))}
    </>
  );

  const resultado = dre.resultado.total;

  return (
    <RelatorioShell
      titulo="DRE simplificada"
      descricao="Receitas menos despesas no período, por categoria e por mês: mostra se deu lucro ou prejuízo."
      filtros={
        <div className="flex flex-wrap items-center gap-3">
          <PeriodoFiltro periodo={periodo} />
          <Tabs value={base} onValueChange={(v) => setBase(v as BaseDre)}>
            <TabsList className={segmentedListClass}>
              <TabsTrigger value="realizado" className={segmentedTriggerClass}>Realizado</TabsTrigger>
              <TabsTrigger value="previsto" className={segmentedTriggerClass}>Previsto</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      }
      carregando={carregando}
      vazio={dre.receitas.linhas.length === 0 && dre.despesas.linhas.length === 0}
      onVoltar={onVoltar}
      exportar={() => ({
        titulo: 'DRE simplificada',
        subtitulo: `${periodo.rotulo} · ${baseRotulo}`,
        empresa,
        cabecalho: ['', ...dre.meses.map(rotuloMes), 'Total', '% receita'],
        linhas: [
          ...exportBloco('RECEITAS', dre.receitas),
          ...exportBloco('DESPESAS', dre.despesas),
          { celulas: [resultado >= 0 ? 'RESULTADO (LUCRO)' : 'RESULTADO (PREJUÍZO)', ...dre.resultado.meses.map(brl), brl(resultado), pct(resultado, receitaTotal)], destaque: true },
        ],
        colunasValor: [...dre.meses.map((_, i) => i + 1), dre.meses.length + 1, dre.meses.length + 2],
        arquivo: `dre-simplificada-${base}-${periodo.inicio}-a-${periodo.fim}`,
      })}
    >
      <StatCardRow items={[
        { label: 'Receitas', value: brl(dre.receitas.total), hint: baseRotulo.toLowerCase() },
        { label: 'Despesas', value: brl(dre.despesas.total), hint: baseRotulo.toLowerCase() },
        {
          label: resultado >= 0 ? 'Lucro' : 'Prejuízo',
          value: brl(resultado),
          hint: receitaTotal ? `margem de ${pct(resultado, receitaTotal)}` : 'sem receita no período',
          emphasis: resultado < 0 ? 'warm' : 'none',
        },
      ]} className="xl:grid-cols-3" />
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 min-w-[200px] bg-paper">Categoria</TableHead>
                {dre.meses.map((m) => <TableHead key={m} className="text-right">{rotuloMes(m)}</TableHead>)}
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">% receita</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <Bloco nome="Receitas" b={dre.receitas} tom="ok" />
              <Bloco nome="Despesas" b={dre.despesas} tom="danger" />
              <TableRow className="border-t-2 border-line">
                <TableCell className="sticky left-0 bg-paper font-semibold text-ink">{resultado >= 0 ? 'Resultado (lucro)' : 'Resultado (prejuízo)'}</TableCell>
                {dre.resultado.meses.map((v, i) => (
                  <TableCell key={i} className={cn(num, 'font-semibold', v < 0 ? 'text-danger' : 'text-ink')}>{v ? brl(v) : '—'}</TableCell>
                ))}
                <TableCell className={cn(num, 'font-bold', resultado < 0 ? 'text-danger' : 'text-ok')}>{brl(resultado)}</TableCell>
                <TableCell className={cn(num, 'font-semibold text-muted-ink')}>{pct(resultado, receitaTotal)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </RelatorioShell>
  );
}
