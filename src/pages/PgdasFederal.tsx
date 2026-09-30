import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { FileText, Loader2, Receipt, RefreshCw } from 'lucide-react';

import { DsBadge, PageHeader, SearchField, StatCardRow } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CompetenciaNav } from '@/components/serpro/CompetenciaNav';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { useAbrirArquivo, useConsultaPgdasd } from '@/components/serpro/pgdasdUi';
import { competenciaPadrao, mesDeData, rotuloCompetencia, siglaCompetencia } from '@/hooks/useSerproPagamentos';
import {
  anoDe, declaracaoVigente, statusPgdas, useMatrizPgdasd, type LinhaPgdasd, type StatusPgdas,
} from '@/hooks/useSerproPgdasd';
import type { TabelaExport } from '@/lib/exportarTabela';

const formatarCnpj = (d: string) => {
  const n = d.replace(/\D/g, '');
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};

/** Vencimento do PGDAS-D: dia 20 do mês seguinte ao período (não ajusta fim de semana/feriado). */
function prazo(pa: string): Date {
  const [a, m] = pa.split('-').map(Number);
  return new Date(a, m, 20, 23, 59, 59);
}

type Situacao = 'todos' | 'nao_consultados' | 'transmitidas' | 'nao_transmitidas' | 'malha';
const SITUACOES: { value: Situacao; label: string }[] = [
  { value: 'todos', label: 'Todos os clientes' },
  { value: 'nao_consultados', label: 'Não consultados no ano' },
  { value: 'transmitidas', label: 'Transmitidas' },
  { value: 'nao_transmitidas', label: 'Sem declaração' },
  { value: 'malha', label: 'Em malha' },
];

const emMalha = (l: LinhaPgdasd, pa: string) => {
  const m = declaracaoVigente(l, pa)?.malha;
  return !!m && !/liberad/i.test(m);
};

function rotuloStatus(s: StatusPgdas, vencido: boolean): { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' } {
  switch (s) {
    case 'transmitida': return { label: 'Transmitida', tone: 'ok' };
    case 'retificada': return { label: 'Retificada', tone: 'ok' };
    case 'sem_declaracao': return vencido ? { label: 'Não transmitida', tone: 'danger' } : { label: 'A transmitir', tone: 'info' };
    case 'filial': return { label: 'Filial (matriz)', tone: 'neutral' };
    default: return { label: 'Não consultado', tone: 'neutral' };
  }
}

export default function PgdasFederal() {
  const [pa, setPa] = useState(competenciaPadrao());
  const ano = anoDe(pa);
  const { data: linhas = [], isLoading } = useMatrizPgdasd(ano);
  const { executar, emAndamento, dialog } = useConsultaPgdasd(ano);
  const { ocupado, abrirDeclaracao } = useAbrirArquivo();
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState<Situacao>('todos');

  const vencido = new Date() > prazo(pa);
  const limite = mesDeData(new Date());

  const stats = useMemo(() => {
    const ativos = linhas.filter((l) => !l.filial);
    const consultados = ativos.filter((l) => l.consultadoEm);
    const transmitidas = consultados.filter((l) => declaracaoVigente(l, pa)).length;
    return {
      total: ativos.length,
      consultados: consultados.length,
      transmitidas,
      semDeclaracao: consultados.length - transmitidas,
      malha: consultados.filter((l) => emMalha(l, pa)).length,
    };
  }, [linhas, pa]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, '');
    return linhas
      .filter((l) => {
        const s = statusPgdas(l, pa);
        switch (situacao) {
          case 'nao_consultados': return s === 'nao_consultado';
          case 'transmitidas': return s === 'transmitida' || s === 'retificada';
          case 'nao_transmitidas': return s === 'sem_declaracao';
          case 'malha': return emMalha(l, pa);
          default: return true;
        }
      })
      .filter((l) => !q || l.nome.toLowerCase().includes(q) || (qDigitos && l.documento.replace(/\D/g, '').includes(qDigitos)));
  }, [linhas, busca, situacao, pa]);

  const tabelaExport = (): TabelaExport => ({
    arquivo: `pgdas-${pa}`,
    titulo: `PGDAS-D — declarações do período ${siglaCompetencia(pa)}`,
    colunas: ['Razão social', 'CNPJ', 'Competência', 'Nº da declaração', 'Tipo', 'Transmissão', 'Malha', 'Situação', 'Consultado em'],
    linhas: filtradas.map((l) => {
      const d = declaracaoVigente(l, pa);
      const st = statusPgdas(l, pa);
      return [
        l.nome, formatarCnpj(l.documento), siglaCompetencia(pa), d?.numero_declaracao ?? '', d ? (d.tipo === 'retificadora' ? 'Retificadora' : 'Original') : '',
        d?.transmitida_em ? format(new Date(d.transmitida_em), 'dd/MM/yyyy HH:mm') : '', d?.malha ?? '', rotuloStatus(st, vencido).label,
        l.consultadoEm ? format(new Date(l.consultadoEm), 'dd/MM/yyyy HH:mm') : '',
      ];
    }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/dashboard federal · pgdas"
        title="PGDAS."
        subtitle={`Declarações do PGDAS-D dos clientes do Simples Nacional, por período de apuração. Uma consulta por cliente traz o ano inteiro (${ano}). "Não transmitida" só vale depois do dia 20 do mês seguinte e para clientes já consultados. Filiais seguem a matriz.`}
        actions={<ExportarMenu montar={tabelaExport} disabled={filtradas.length === 0} escolherColunas />}
      />

      <CompetenciaNav competencia={pa} onChange={setPa} limite={limite} />

      <StatCardRow
        items={[
          { label: 'Consultados no ano', value: `${stats.consultados} de ${stats.total}`, hint: `clientes do Simples, ${ano}` },
          { label: `Transmitidas em ${siglaCompetencia(pa)}`, value: stats.transmitidas, hint: 'entre os consultados' },
          {
            label: vencido ? 'Não transmitidas' : 'A transmitir', value: stats.semDeclaracao,
            hint: vencido ? 'prazo do período já passou' : `vence em ${format(prazo(pa), 'dd/MM')}`,
            emphasis: vencido && stats.semDeclaracao > 0 ? 'warm' : 'none',
          },
          { label: 'Em malha', value: stats.malha, hint: 'retida, intimada ou rejeitada', emphasis: stats.malha > 0 ? 'warm' : 'none' },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchField placeholder="Buscar por razão social ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px] flex-1" />
        <Select value={situacao} onValueChange={(v) => setSituacao(v as Situacao)}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
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
                <TableHead>Nº PGDAS</TableHead>
                <TableHead>Transmissão</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Documentos</TableHead>
                <TableHead className="text-right">Atualizar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((l) => {
                const d = declaracaoVigente(l, pa);
                const st = statusPgdas(l, pa);
                const r = rotuloStatus(st, vencido);
                const consultando = emAndamento === l.contact_id;
                const maed = !!(d?.maed_notificacao_path || d?.maed_darf_path);
                return (
                  <TableRow key={l.contact_id}>
                    <TableCell>
                      <p className="text-ui text-ink">{l.nome}</p>
                      <p className="text-meta text-muted-ink-2">Simples Nacional</p>
                    </TableCell>
                    <TableCell className="font-mono text-ui">{formatarCnpj(l.documento)}</TableCell>
                    <TableCell className="font-mono text-ui">{d?.numero_declaracao ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-ui text-muted-ink">{d?.transmitida_em ? format(new Date(d.transmitida_em), 'dd/MM/yyyy HH:mm') : '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <DsBadge tone={r.tone}>{r.label}</DsBadge>
                        {d?.malha && <DsBadge tone={emMalha(l, pa) ? 'danger' : 'neutral'} dot={false}>{d.malha}</DsBadge>}
                        {maed && <DsBadge tone="danger" dot={false}>MAED</DsBadge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {d ? (
                        <div className="flex items-center justify-center gap-1">
                          <DicaBotao custo={d.declaracao_path ? undefined : 'Consultar'}
                            texto={d.declaracao_path ? 'Abre o PDF da declaração transmitida, que já está guardado.' : 'Baixa da Receita o PDF da declaração transmitida, guarda e lê o faturamento dela.'}>
                            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={ocupado === `${d.id}:declaracao`} onClick={() => abrirDeclaracao(d, 'declaracao')}>
                              {ocupado === `${d.id}:declaracao` ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                            </Button>
                          </DicaBotao>
                          <DicaBotao custo={d.recibo_path ? undefined : 'Consultar'}
                            texto={d.recibo_path ? 'Abre o recibo de entrega da declaração, que já está guardado.' : 'Baixa da Receita o recibo de entrega da declaração e guarda.'}>
                            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={ocupado === `${d.id}:recibo`} onClick={() => abrirDeclaracao(d, 'recibo')}>
                              {ocupado === `${d.id}:recibo` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                            </Button>
                          </DicaBotao>
                          {maed && (
                            <DropdownMenu>
                              <DicaBotao texto="Multa por atraso na entrega (MAED): abre a notificação da multa ou o DARF para pagá-la. Os arquivos já estão guardados.">
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="outline" className="h-8 px-2 text-meta">MAED</Button>
                                </DropdownMenuTrigger>
                              </DicaBotao>
                              <DropdownMenuContent align="end">
                                {d.maed_notificacao_path && <DropdownMenuItem onSelect={() => abrirDeclaracao(d, 'maed_notificacao')}>Notificação da multa</DropdownMenuItem>}
                                {d.maed_darf_path && <DropdownMenuItem onSelect={() => abrirDeclaracao(d, 'maed_darf')}>DARF da multa</DropdownMenuItem>}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      ) : <span className="text-muted-ink-2">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <DicaBotao custo={l.filial ? undefined : 'Consultar'}
                        texto={l.filial ? 'Filial: o PGDAS-D é da matriz. Consulte o CNPJ da matriz.' : `Consulta na Receita as declarações e os DAS do ano ${ano} inteiro deste cliente, numa só chamada.`}>
                        <Button size="sm" variant="outline" disabled={consultando || l.filial} onClick={() => executar(l.contact_id)}>
                          {consultando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                          Consultar{!l.filial && <Preco tipo="Consultar" />}
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

      <p className="text-meta text-muted-ink-2">Mostrando {filtradas.length} de {linhas.length} clientes do Simples Nacional · {rotuloCompetencia(pa)}.</p>
      {dialog}
    </div>
  );
}
