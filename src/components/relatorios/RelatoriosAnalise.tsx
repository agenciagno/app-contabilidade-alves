import { Fragment, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatCardRow } from '@/components/ds';
import { cn } from '@/lib/utils';
import {
  relMovimentos, relInadimplentes, relPorCategoria, relPorContraparte,
  type LinhaCategoria, type LinhaContraparte, type Posicao,
} from '@/lib/relatorios';
import type { LinhaExport } from '@/lib/relatorio-export';
import { RelatorioShell, PeriodoFiltro, usePeriodo, useDadosRelatorio, brl, dataBR, hojeISO } from './RelatorioShell';

type Voltar = { onVoltar: () => void };
const num = 'text-right tabular-nums whitespace-nowrap';

// ─── Pagamentos / Recebimentos ───────────────────────────────────────

export function RelatorioMovimentos({ tipo, onVoltar }: Voltar & { tipo: 'receita' | 'despesa' }) {
  const { txs, porId, empresa, carregando } = useDadosRelatorio();
  const periodo = usePeriodo('mes');
  const { linhas, total } = useMemo(
    () => relMovimentos(txs, tipo, periodo.inicio, periodo.fim, porId),
    [txs, tipo, periodo.inicio, periodo.fim, porId],
  );
  const recebe = tipo === 'receita';
  const titulo = recebe ? 'Recebimentos' : 'Pagamentos';
  const quem = recebe ? 'Cliente' : 'Fornecedor';

  return (
    <RelatorioShell
      titulo={titulo}
      descricao={recebe
        ? 'Valores recebidos no período, pela data do recebimento.'
        : 'Valores pagos no período, pela data do pagamento.'}
      filtros={<PeriodoFiltro periodo={periodo} />}
      carregando={carregando}
      vazio={linhas.length === 0}
      onVoltar={onVoltar}
      exportar={() => ({
        titulo: `Análise de ${titulo.toLowerCase()}`,
        subtitulo: periodo.rotulo,
        empresa,
        cabecalho: ['Data', quem, 'Categoria', 'Conta', 'Histórico', recebe ? 'Valor recebido' : 'Valor pago'],
        linhas: [
          ...linhas.map((l) => ({ celulas: [dataBR(l.data), l.contraparte, l.categoria, l.conta, l.historico, brl(l.valor)] })),
          { celulas: ['Total', `${linhas.length} lançamento(s)`, '', '', '', brl(total)], destaque: true },
        ],
        colunasValor: [5],
        arquivo: `${titulo.toLowerCase()}-${periodo.inicio}-a-${periodo.fim}`,
      })}
    >
      <StatCardRow items={[
        { label: recebe ? 'Total recebido' : 'Total pago', value: brl(total), hint: periodo.rotulo.replace('Período: ', '') },
        { label: 'Lançamentos', value: String(linhas.length) },
      ]} className="xl:grid-cols-2" />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead><TableHead>{quem}</TableHead><TableHead>Categoria</TableHead>
                <TableHead>Conta</TableHead><TableHead>Histórico</TableHead>
                <TableHead className="text-right">{recebe ? 'Valor recebido' : 'Valor pago'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap font-mono text-mono-sm">{dataBR(l.data)}</TableCell>
                  <TableCell className="font-medium text-ink">{l.contraparte}</TableCell>
                  <TableCell className="text-muted-ink">{l.categoria}</TableCell>
                  <TableCell className="text-muted-ink">{l.conta}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-muted-ink">{l.historico || '—'}</TableCell>
                  <TableCell className={cn(num, recebe ? 'text-ok' : 'text-danger')}>{brl(l.valor)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5} className="font-semibold">Total</TableCell>
                <TableCell className={cn(num, 'font-semibold')}>{brl(total)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </RelatorioShell>
  );
}

// ─── Inadimplentes ───────────────────────────────────────────────────

export function RelatorioInadimplentes({ onVoltar }: Voltar) {
  const { txs, porId, empresa, carregando } = useDadosRelatorio();
  const hoje = hojeISO();
  const { linhas, total, titulos } = useMemo(() => relInadimplentes(txs, hoje, porId), [txs, hoje, porId]);

  return (
    <RelatorioShell
      titulo="Inadimplentes"
      descricao="Clientes com valores vencidos e ainda não recebidos, do atraso maior para o menor."
      carregando={carregando}
      vazio={linhas.length === 0}
      mensagemVazio="Nenhum cliente com valor vencido. Tudo em dia."
      onVoltar={onVoltar}
      exportar={() => ({
        titulo: 'Análise de inadimplentes',
        subtitulo: `Posição em ${dataBR(hoje)}`,
        empresa,
        cabecalho: ['Cliente / Vencimento', 'Categoria', 'Histórico', 'Dias de atraso', 'Valor vencido'],
        linhas: linhas.flatMap((l): LinhaExport[] => [
          { celulas: [l.cliente, `${l.titulos.length} título(s)`, '', `${l.maiorAtraso}`, brl(l.total)], destaque: true },
          ...l.titulos.map((t) => ({ celulas: [`   ${dataBR(t.vencimento)}`, t.categoria, t.historico, `${t.diasAtraso}`, brl(t.valor)] })),
        ]).concat([{ celulas: ['Total', `${titulos} título(s)`, '', '', brl(total)], destaque: true }]),
        colunasValor: [3, 4],
        arquivo: `inadimplentes-${hoje}`,
      })}
    >
      <StatCardRow items={[
        { label: 'Total vencido', value: brl(total), hint: `posição em ${dataBR(hoje)}`, emphasis: 'warm' },
        { label: 'Clientes', value: String(linhas.length) },
        { label: 'Títulos vencidos', value: String(titulos) },
      ]} className="xl:grid-cols-3" />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente / Vencimento</TableHead><TableHead>Categoria</TableHead><TableHead>Histórico</TableHead>
                <TableHead className="text-right">Dias de atraso</TableHead><TableHead className="text-right">Valor vencido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <Fragment key={l.chave}>
                  <TableRow className="bg-bg-2/60">
                    <TableCell className="font-semibold text-ink">{l.cliente}</TableCell>
                    <TableCell className="text-muted-ink">{l.titulos.length} título(s) · desde {dataBR(l.maisAntigo)}</TableCell>
                    <TableCell />
                    <TableCell className={cn(num, 'font-semibold text-danger')}>{l.maiorAtraso}</TableCell>
                    <TableCell className={cn(num, 'font-semibold')}>{brl(l.total)}</TableCell>
                  </TableRow>
                  {l.titulos.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="pl-8 font-mono text-mono-sm text-muted-ink">{dataBR(t.vencimento)}</TableCell>
                      <TableCell className="text-muted-ink">{t.categoria}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-muted-ink">{t.historico || '—'}</TableCell>
                      <TableCell className={cn(num, 'text-muted-ink')}>{t.diasAtraso}</TableCell>
                      <TableCell className={num}>{brl(t.valor)}</TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4} className="font-semibold">Total</TableCell>
                <TableCell className={cn(num, 'font-semibold')}>{brl(total)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </RelatorioShell>
  );
}

// ─── Posição (a vencer / vencido / pago) — tabela comum ─────────────

function CabecalhoPosicao({ primeira, pagoRotulo, comParte }: { primeira: string; pagoRotulo: string; comParte?: boolean }) {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>{primeira}</TableHead>
        <TableHead className="text-right">A vencer</TableHead>
        <TableHead className="text-right">Vencido</TableHead>
        <TableHead className="text-right">{pagoRotulo}</TableHead>
        <TableHead className="text-right">Total</TableHead>
        {comParte && <TableHead className="w-[160px]">Participação</TableHead>}
      </TableRow>
    </TableHeader>
  );
}

function CelulasPosicao({ p, forte, sub }: { p: Posicao; forte?: boolean; sub?: boolean }) {
  return (
    <>
      <TableCell className={cn(num, forte && 'font-semibold')}>{p.aVencer ? brl(p.aVencer) : '—'}</TableCell>
      <TableCell className={cn(num, p.vencido > 0 && 'text-danger', forte && 'font-semibold')}>{p.vencido ? brl(p.vencido) : '—'}</TableCell>
      <TableCell className={cn(num, forte && 'font-semibold')}>{p.pago ? brl(p.pago) : '—'}</TableCell>
      <TableCell className={cn(num, sub ? 'text-muted-ink' : 'font-semibold')}>{brl(p.total)}</TableCell>
    </>
  );
}

/** Barra de participação no total — o "gráfico" por categoria, sem precisar de outro card. */
function Participacao({ valor, total, tom }: { valor: number; total: number; tom: 'ok' | 'danger' }) {
  const pct = total > 0 ? (valor / total) * 100 : 0;
  return (
    <TableCell>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-2">
          <div className={cn('h-full rounded-full', tom === 'ok' ? 'bg-ok' : 'bg-danger')} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <span className="w-10 text-right text-meta tabular-nums text-muted-ink">{pct.toFixed(0)}%</span>
      </div>
    </TableCell>
  );
}

const celulasExport = (p: Posicao) => [brl(p.aVencer), brl(p.vencido), brl(p.pago), brl(p.total)];

// ─── Por categoria ───────────────────────────────────────────────────

export function RelatorioCategorias({ onVoltar }: Voltar) {
  const { txs, porId, empresa, carregando } = useDadosRelatorio();
  const periodo = usePeriodo('mes');
  const hoje = hojeISO();
  const receitas = useMemo(() => relPorCategoria(txs, 'receita', periodo.inicio, periodo.fim, hoje, porId), [txs, periodo.inicio, periodo.fim, hoje, porId]);
  const despesas = useMemo(() => relPorCategoria(txs, 'despesa', periodo.inicio, periodo.fim, hoje, porId), [txs, periodo.inicio, periodo.fim, hoje, porId]);

  const exportBloco = (nome: string, b: { linhas: LinhaCategoria[]; total: Posicao }): LinhaExport[] => [
    { celulas: [nome, ...celulasExport(b.total)], destaque: true },
    ...b.linhas.flatMap((m): LinhaExport[] => [
      { celulas: [`  ${m.nome}`, ...celulasExport(m)] },
      ...m.subs.map((s) => ({ celulas: [`      ${s.nome}`, ...celulasExport(s)] })),
    ]),
  ];

  const Bloco = ({ nome, b, tom }: { nome: string; b: { linhas: LinhaCategoria[]; total: Posicao }; tom: 'ok' | 'danger' }) => (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{nome}</CardTitle></CardHeader>
      <CardContent className="p-0">
        {b.linhas.length === 0 ? (
          <p className="px-6 pb-6 text-meta text-muted-ink">Nada neste período.</p>
        ) : (
          <Table>
            <CabecalhoPosicao primeira="Categoria" pagoRotulo={tom === 'ok' ? 'Recebido' : 'Pago'} comParte />
            <TableBody>
              {b.linhas.map((m) => (
                <Fragment key={m.id}>
                  <TableRow>
                    <TableCell className="font-medium text-ink">{m.nome}</TableCell>
                    <CelulasPosicao p={m} />
                    <Participacao valor={m.total} total={b.total.total} tom={tom} />
                  </TableRow>
                  {m.subs.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="pl-8 text-muted-ink">{s.nome}</TableCell>
                      <CelulasPosicao p={s} sub />
                      <TableCell />
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow><TableCell className="font-semibold">Total</TableCell><CelulasPosicao p={b.total} forte /><TableCell /></TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );

  return (
    <RelatorioShell
      titulo="Por categoria"
      descricao="Lançamentos com vencimento no período, agrupados por categoria: a vencer, vencido e já pago."
      filtros={<PeriodoFiltro periodo={periodo} legenda="Vencimento:" />}
      carregando={carregando}
      vazio={receitas.linhas.length === 0 && despesas.linhas.length === 0}
      onVoltar={onVoltar}
      exportar={() => ({
        titulo: 'Análise por categorias',
        subtitulo: `Vencimento — ${periodo.rotulo}`,
        empresa,
        cabecalho: ['Categoria', 'A vencer', 'Vencido', 'Pago/Recebido', 'Total'],
        linhas: [...exportBloco('RECEITAS', receitas), ...exportBloco('DESPESAS', despesas)],
        colunasValor: [1, 2, 3, 4],
        arquivo: `categorias-${periodo.inicio}-a-${periodo.fim}`,
      })}
    >
      <Bloco nome="Receitas" b={receitas} tom="ok" />
      <Bloco nome="Despesas" b={despesas} tom="danger" />
    </RelatorioShell>
  );
}

// ─── Por cliente/fornecedor ──────────────────────────────────────────

export function RelatorioContrapartes({ onVoltar }: Voltar) {
  const { txs, empresa, carregando } = useDadosRelatorio();
  const periodo = usePeriodo('mes');
  const hoje = hojeISO();
  const clientes = useMemo(() => relPorContraparte(txs, 'receita', periodo.inicio, periodo.fim, hoje), [txs, periodo.inicio, periodo.fim, hoje]);
  const fornecedores = useMemo(() => relPorContraparte(txs, 'despesa', periodo.inicio, periodo.fim, hoje), [txs, periodo.inicio, periodo.fim, hoje]);

  const exportBloco = (nome: string, b: { linhas: LinhaContraparte[]; total: Posicao }): LinhaExport[] => [
    { celulas: [nome, ...celulasExport(b.total)], destaque: true },
    ...b.linhas.map((l) => ({ celulas: [`  ${l.nome}`, ...celulasExport(l)] })),
  ];

  const Bloco = ({ nome, primeira, pagoRotulo, b }: { nome: string; primeira: string; pagoRotulo: string; b: { linhas: LinhaContraparte[]; total: Posicao } }) => (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{nome}</CardTitle></CardHeader>
      <CardContent className="p-0">
        {b.linhas.length === 0 ? (
          <p className="px-6 pb-6 text-meta text-muted-ink">Nada neste período.</p>
        ) : (
          <Table>
            <CabecalhoPosicao primeira={primeira} pagoRotulo={pagoRotulo} />
            <TableBody>
              {b.linhas.map((l) => (
                <TableRow key={l.chave}>
                  <TableCell className="font-medium text-ink">{l.nome}</TableCell>
                  <CelulasPosicao p={l} />
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow><TableCell className="font-semibold">Total</TableCell><CelulasPosicao p={b.total} forte /></TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );

  return (
    <RelatorioShell
      titulo="Por cliente e fornecedor"
      descricao="Posição de cada cliente e fornecedor nos lançamentos com vencimento no período."
      filtros={<PeriodoFiltro periodo={periodo} legenda="Vencimento:" />}
      carregando={carregando}
      vazio={clientes.linhas.length === 0 && fornecedores.linhas.length === 0}
      onVoltar={onVoltar}
      exportar={() => ({
        titulo: 'Posição por cliente/fornecedor',
        subtitulo: `Vencimento — ${periodo.rotulo}`,
        empresa,
        cabecalho: ['Cliente / Fornecedor', 'A vencer', 'Vencido', 'Pago/Recebido', 'Total'],
        linhas: [...exportBloco('CLIENTES (A RECEBER)', clientes), ...exportBloco('FORNECEDORES (A PAGAR)', fornecedores)],
        colunasValor: [1, 2, 3, 4],
        arquivo: `clientes-fornecedores-${periodo.inicio}-a-${periodo.fim}`,
      })}
    >
      <Bloco nome="Clientes (a receber)" primeira="Cliente" pagoRotulo="Recebido" b={clientes} />
      <Bloco nome="Fornecedores (a pagar)" primeira="Fornecedor" pagoRotulo="Pago" b={fornecedores} />
    </RelatorioShell>
  );
}
