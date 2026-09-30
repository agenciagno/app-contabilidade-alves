import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Eye, Loader2, RefreshCw } from 'lucide-react';

import { useBuscaInicial } from '@/hooks/useBuscaInicial';
import { DsBadge, PageHeader, SearchField, StatCardRow } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { ParcelamentosClienteSheet } from '@/components/serpro/ParcelamentosClienteSheet';
import { useConsultaParcelamentos } from '@/components/serpro/parcelamentosUi';
import {
  ROTULO_MOD, chamadasDaConsulta, competenciaAtual, consultadoEm, estadoParcelamento, modalidadesAtivas, parcelasAtrasadas, parcelasDoMes,
  somaValor, useMatrizParcelamentos, type EstadoParcelamento, type LinhaParcelamentos,
} from '@/hooks/useSerproParcelamentos';
import type { TabelaExport } from '@/lib/exportarTabela';

const formatarCnpj = (d: string) => {
  const n = d.replace(/\D/g, '');
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

type Situacao = 'todos' | 'ativos' | 'atrasados' | 'sem_parcelamento' | 'nao_consultados';
const SITUACOES: { value: Situacao; label: string }[] = [
  { value: 'todos', label: 'Todos os clientes' },
  { value: 'ativos', label: 'Com parcelamento ativo' },
  { value: 'atrasados', label: 'Com parcela em atraso' },
  { value: 'sem_parcelamento', label: 'Sem parcelamento' },
  { value: 'nao_consultados', label: 'Não consultados' },
];

function rotulo(e: EstadoParcelamento): { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' } {
  switch (e) {
    case 'atrasado': return { label: 'Parcela em atraso', tone: 'danger' };
    case 'em_dia': return { label: 'Em dia', tone: 'ok' };
    case 'sem_parcelamento': return { label: 'Sem parcelamento', tone: 'neutral' };
    case 'filial': return { label: 'Filial (matriz)', tone: 'neutral' };
    default: return { label: 'Não consultado', tone: 'neutral' };
  }
}

export default function ParcelamentosFederal() {
  const { data: linhas = [], isLoading } = useMatrizParcelamentos();
  const { executar, emAndamento, dialog } = useConsultaParcelamentos();
  const buscaInicial = useBuscaInicial();
  const [busca, setBusca] = useState(buscaInicial);
  const [situacao, setSituacao] = useState<Situacao>('todos');
  const [aberto, setAberto] = useState<string | null>(null);
  const atual = competenciaAtual();

  const stats = useMemo(() => {
    const ativos = linhas.filter((l) => !l.filial);
    const est = ativos.map((l) => estadoParcelamento(l, atual));
    const consultados = ativos.filter((l) => l.consultas.length);
    return {
      total: ativos.length,
      consultados: consultados.length,
      comParcelamento: est.filter((e) => e === 'em_dia' || e === 'atrasado').length,
      atrasados: est.filter((e) => e === 'atrasado').length,
      doMes: consultados.reduce((s, l) => s + somaValor(parcelasDoMes(l, atual)), 0),
    };
  }, [linhas, atual]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, '');
    return linhas
      .filter((l) => {
        const e = estadoParcelamento(l, atual);
        switch (situacao) {
          case 'ativos': return e === 'em_dia' || e === 'atrasado';
          case 'atrasados': return e === 'atrasado';
          case 'sem_parcelamento': return e === 'sem_parcelamento';
          case 'nao_consultados': return e === 'nao_consultado';
          default: return true;
        }
      })
      .filter((l) => !q || l.nome.toLowerCase().includes(q) || (qDigitos && l.documento.replace(/\D/g, '').includes(qDigitos)));
  }, [linhas, busca, situacao, atual]);

  const tabelaExport = (): TabelaExport => ({
    arquivo: 'parcelamentos',
    titulo: 'Parcelamentos do Simples Nacional dos clientes ativos',
    colunas: ['Razão social', 'CNPJ', 'Situação', 'Modalidades ativas', 'Parcelas em aberto', 'Valor em aberto', 'Parcelas atrasadas', 'Valor atrasado', 'Parcela do mês', 'Consultado em'],
    linhas: filtradas.map((l) => {
      const atr = parcelasAtrasadas(l, atual);
      return [
        l.nome, formatarCnpj(l.documento), rotulo(estadoParcelamento(l, atual)).label, modalidadesAtivas(l).map((m) => ROTULO_MOD[m]).join(', '),
        String(l.parcelas.length), l.parcelas.length ? moeda(somaValor(l.parcelas)) : '', String(atr.length), atr.length ? moeda(somaValor(atr)) : '',
        parcelasDoMes(l, atual).length ? moeda(somaValor(parcelasDoMes(l, atual))) : '', consultadoEm(l) ? format(new Date(consultadoEm(l)!), 'dd/MM/yyyy HH:mm') : '',
      ];
    }),
  });

  const linhaAberta: LinhaParcelamentos | null = linhas.find((l) => l.contact_id === aberto) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/dashboard federal · parcelamentos"
        title="Parcelamentos."
        subtitle={`Parcelamentos do Simples Nacional (ordinário, especial, PERT-SN e RELP-SN) dos clientes ativos: parcelas em aberto, atrasadas, a do mês e a guia de cada uma. A primeira consulta de um cliente olha as quatro modalidades; as seguintes só o ordinário e as que o cliente já teve. "Em dia" quer dizer que a Receita não mostra parcela atrasada, não que o mês esteja pago. Filiais seguem a matriz.`}
        actions={<ExportarMenu montar={tabelaExport} disabled={filtradas.length === 0} escolherColunas />}
      />

      <StatCardRow
        items={[
          { label: 'Consultados', value: `${stats.consultados} de ${stats.total}`, hint: 'clientes do Simples, um por vez' },
          { label: 'Com parcelamento ativo', value: stats.comParcelamento, hint: 'entre os consultados' },
          { label: 'Com parcela em atraso', value: stats.atrasados, hint: 'confira e avise o cliente', emphasis: stats.atrasados > 0 ? 'warm' : 'none' },
          { label: 'Parcelas do mês', value: moeda(stats.doMes), hint: 'soma entre os consultados' },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchField placeholder="Buscar por razão social ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px] flex-1" />
        <Select value={situacao} onValueChange={(v) => setSituacao(v as Situacao)}>
          <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
          <SelectContent>{SITUACOES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-paper">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtradas.length === 0 ? (
          <div className="p-10 text-center text-ui text-muted-ink">Nenhum cliente encontrado.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Razão social</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Parcelamentos ativos</TableHead>
                <TableHead className="text-right">Em aberto</TableHead>
                <TableHead className="text-right">Atrasadas</TableHead>
                <TableHead className="text-right">Do mês</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Ver</TableHead>
                <TableHead className="text-right">Atualizar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((l) => {
                const e = estadoParcelamento(l, atual);
                const r = rotulo(e);
                const atr = parcelasAtrasadas(l, atual);
                const mes = parcelasDoMes(l, atual);
                const consultando = emAndamento === l.contact_id;
                const chamadas = chamadasDaConsulta(l);
                const ativas = modalidadesAtivas(l);
                const temDados = l.consultas.length > 0;
                return (
                  <TableRow key={l.contact_id} className={temDados ? 'cursor-pointer' : undefined} onClick={() => temDados && setAberto(l.contact_id)}>
                    <TableCell>
                      <p className="text-ui text-ink">{l.nome}</p>
                      <p className="text-meta text-muted-ink-2">Simples Nacional</p>
                    </TableCell>
                    <TableCell className="font-mono text-ui">{formatarCnpj(l.documento)}</TableCell>
                    <TableCell className="text-meta text-muted-ink">{ativas.length ? ativas.map((m) => ROTULO_MOD[m]).join(', ') : '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-ui">{l.parcelas.length ? `${l.parcelas.length} · ${moeda(somaValor(l.parcelas))}` : '—'}</TableCell>
                    <TableCell className={`whitespace-nowrap text-right text-ui ${atr.length ? 'text-danger' : ''}`}>{atr.length ? `${atr.length} · ${moeda(somaValor(atr))}` : '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-ui">{mes.length ? moeda(somaValor(mes)) : '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <DsBadge tone={r.tone}>{r.label}</DsBadge>
                        {l.consultas.some((c) => c.sem_procuracao) && <DsBadge tone="warn" dot={false}>Sem procuração em alguma modalidade</DsBadge>}
                        {l.consultas.some((c) => c.erro) && <DsBadge tone="warn" dot={false}>Falha em alguma modalidade</DsBadge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <DicaBotao texto={temDados ? 'Abre o painel do cliente com os parcelamentos, as parcelas em aberto e a guia de cada uma. Não consulta a Receita.' : 'Consulte o cliente primeiro para ter o que ver.'}>
                        <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!temDados} onClick={(ev) => { ev.stopPropagation(); setAberto(l.contact_id); }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </DicaBotao>
                    </TableCell>
                    <TableCell className="text-right">
                      <DicaBotao custo={l.filial ? undefined : 'Consultar'} vezes={chamadas}
                        texto={l.filial ? 'Filial: o parcelamento é do CNPJ da matriz. Consulte a matriz.'
                          : temDados ? 'Consulta na Receita os pedidos de parcelamento do ordinário e das modalidades que o cliente já teve, e as parcelas em aberto dos ativos.'
                            : 'Primeira consulta: olha as quatro modalidades (ordinário, especial, PERT-SN e RELP-SN) e, onde houver parcelamento ativo, as parcelas em aberto.'}>
                        <Button size="sm" variant="outline" disabled={consultando || l.filial} onClick={(ev) => { ev.stopPropagation(); executar(l.contact_id, chamadas); }}>
                          {consultando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                          Consultar{!l.filial && <Preco tipo="Consultar" vezes={chamadas} />}
                        </Button>
                      </DicaBotao>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <p className="text-meta text-muted-ink-2">Mostrando {filtradas.length} de {linhas.length} clientes do Simples Nacional.</p>

      <ParcelamentosClienteSheet linha={linhaAberta} onClose={() => setAberto(null)} />
      {dialog}
    </div>
  );
}
