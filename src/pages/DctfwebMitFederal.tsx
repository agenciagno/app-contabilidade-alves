import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { FileText, Loader2, RefreshCw } from 'lucide-react';

import { DsBadge, PageHeader, SearchField, StatCardRow } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CompetenciaNav } from '@/components/serpro/CompetenciaNav';
import { Preco, brl } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { useAbrirRecibo, useConsultaDctfwebMit } from '@/components/serpro/dctfwebUi';
import { competenciaPadrao, mesDeData, siglaCompetencia } from '@/hooks/useSerproPagamentos';
import {
  apuracaoVigente, estadoDctfweb, estadoMit, useMatrizDctfwebMit, type EstadoDctfweb, type EstadoMit, type LinhaDctfwebMit,
} from '@/hooks/useSerproDctfweb';
import type { TabelaExport } from '@/lib/exportarTabela';

const REGIMES: Record<string, string> = { lucro_presumido: 'Lucro Presumido', lucro_real: 'Lucro Real' };
const formatarCnpj = (d: string) => {
  const n = d.replace(/\D/g, '');
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};
const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');

type Situacao = 'todos' | 'novo' | 'nao_consultados' | 'sem_dctfweb' | 'sem_mit' | 'completos';
const SITUACOES: { value: Situacao; label: string }[] = [
  { value: 'todos', label: 'Todos os clientes' },
  { value: 'novo', label: 'Movimento novo na Receita' },
  { value: 'nao_consultados', label: 'Não consultados' },
  { value: 'sem_dctfweb', label: 'Sem DCTFWeb no mês' },
  { value: 'sem_mit', label: 'Sem MIT encerrada' },
  { value: 'completos', label: 'Com DCTFWeb e MIT' },
];

function rotuloDctfweb(e: EstadoDctfweb): { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' } {
  switch (e) {
    case 'transmitida': return { label: 'Com recibo', tone: 'ok' };
    case 'sem_declaracao': return { label: 'Sem declaração', tone: 'warn' };
    case 'filial': return { label: 'Filial (matriz)', tone: 'neutral' };
    default: return { label: 'Não consultada', tone: 'neutral' };
  }
}
function rotuloMit(e: EstadoMit): { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' } {
  switch (e) {
    case 'encerrada': return { label: 'Encerrada', tone: 'ok' };
    case 'outra_situacao': return { label: 'Situação a conferir', tone: 'warn' };
    case 'sem_apuracao': return { label: 'Sem apuração', tone: 'warn' };
    case 'filial': return { label: 'Filial (matriz)', tone: 'neutral' };
    default: return { label: 'Não consultada', tone: 'neutral' };
  }
}

export default function DctfwebMitFederal() {
  const [competencia, setCompetencia] = useState(competenciaPadrao());
  const { data: linhas = [], isLoading } = useMatrizDctfwebMit(competencia);
  const { executar, emAndamento, dialog } = useConsultaDctfwebMit(competencia);
  const { ocupado, abrir } = useAbrirRecibo();
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState<Situacao>('todos');
  const limite = mesDeData(new Date());

  const stats = useMemo(() => {
    const ativos = linhas.filter((l) => !l.filial);
    const consultados = ativos.filter((l) => l.dctfweb || l.mitConsultado);
    return {
      total: ativos.length,
      consultados: consultados.length,
      comDctf: ativos.filter((l) => estadoDctfweb(l) === 'transmitida').length,
      comMit: ativos.filter((l) => estadoMit(l) === 'encerrada').length,
      semUma: ativos.filter((l) => estadoDctfweb(l) === 'sem_declaracao' || estadoMit(l) === 'sem_apuracao').length,
      novos: ativos.filter((l) => l.novo).length,
    };
  }, [linhas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, '');
    return linhas
      .filter((l) => {
        const d = estadoDctfweb(l), m = estadoMit(l);
        switch (situacao) {
          case 'novo': return l.novo;
          case 'nao_consultados': return d === 'nao_consultado' && m === 'nao_consultado';
          case 'sem_dctfweb': return d === 'sem_declaracao';
          case 'sem_mit': return m === 'sem_apuracao';
          case 'completos': return d === 'transmitida' && m === 'encerrada';
          default: return true;
        }
      })
      .filter((l) => !q || l.nome.toLowerCase().includes(q) || (qDigitos && l.documento.replace(/\D/g, '').includes(qDigitos)));
  }, [linhas, busca, situacao]);

  const tabelaExport = (): TabelaExport => ({
    arquivo: `dctfweb-mit-${competencia}`,
    titulo: `DCTFWeb e MIT — competência ${siglaCompetencia(competencia)}`,
    colunas: ['Razão social', 'CNPJ', 'Regime', 'Competência', 'DCTFWeb', 'Movimento novo', 'MIT', 'MIT encerrada em', 'MIT valor apurado', 'Consultado em'],
    linhas: filtradas.map((l) => {
      const a = apuracaoVigente(l);
      return [
        l.nome, formatarCnpj(l.documento), REGIMES[l.regime ?? ''] ?? l.regime ?? '', siglaCompetencia(competencia), rotuloDctfweb(estadoDctfweb(l)).label, l.novo ? 'Sim' : '', rotuloMit(estadoMit(l)).label,
        a?.data_encerramento ? dataBR(a.data_encerramento) : '', a?.valor_total != null ? brl(a.valor_total) : '',
        l.dctfweb?.consultado_em ? format(new Date(l.dctfweb.consultado_em), 'dd/MM/yyyy HH:mm') : '',
      ];
    }),
  });

  const chip = (l: LinhaDctfwebMit) => {
    const d = rotuloDctfweb(estadoDctfweb(l));
    const m = rotuloMit(estadoMit(l));
    const a = apuracaoVigente(l);
    return { d, m, a };
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/dashboard federal · dctfweb e mit"
        title="DCTFWeb e MIT."
        subtitle={`Quem entregou a DCTFWeb e a MIT de cada mês, para os clientes ativos do Lucro Presumido e do Lucro Real. Cada consulta traz o recibo da DCTFWeb do mês e as apurações da MIT do ano. "Sem declaração" na DCTFWeb não quer dizer atraso: ela só existe para quem teve movimento no eSocial ou na EFD-Reinf. Confirme o prazo e o movimento do cliente antes de cobrar. Filiais seguem a matriz. Todo dia às 07:40 a Receita informa, de graça, quais clientes tiveram movimento na DCTFWeb (chegada de eSocial ou Reinf, ou transmissão): eles aparecem marcados como "Movimento novo" até você consultar.`}
        actions={<ExportarMenu montar={tabelaExport} disabled={filtradas.length === 0} escolherColunas />}
      />

      <CompetenciaNav competencia={competencia} onChange={setCompetencia} limite={limite} />

      <StatCardRow
        items={[
          { label: 'Consultados no mês', value: `${stats.consultados} de ${stats.total}`, hint: 'clientes do Presumido e do Real' },
          { label: 'Entregas em ' + siglaCompetencia(competencia), value: `${stats.comDctf} DCTFWeb · ${stats.comMit} MIT`, hint: 'com recibo e encerradas' },
          { label: 'Sem DCTFWeb ou sem MIT', value: stats.semUma, hint: 'confirme o movimento antes de cobrar', emphasis: stats.semUma > 0 ? 'warm' : 'none' },
          { label: 'Movimento novo', value: stats.novos, hint: 'a Receita mexeu na DCTFWeb; consulte', emphasis: stats.novos > 0 ? 'warm' : 'none' },
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
                <TableHead>DCTFWeb</TableHead>
                <TableHead>MIT</TableHead>
                <TableHead>Consultado em</TableHead>
                <TableHead className="text-center">Recibo</TableHead>
                <TableHead className="text-right">Atualizar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((l) => {
                const { d, m, a } = chip(l);
                const consultando = emAndamento === l.contact_id;
                const consultadoEm = [l.dctfweb?.consultado_em, l.mitConsultado?.consultado_em].filter(Boolean).sort().pop() ?? null;
                return (
                  <TableRow key={l.contact_id}>
                    <TableCell>
                      <p className="text-ui text-ink">{l.nome}</p>
                      <p className="text-meta text-muted-ink-2">{REGIMES[l.regime ?? ''] ?? l.regime ?? 'Sem regime'}</p>
                    </TableCell>
                    <TableCell className="font-mono text-ui">{formatarCnpj(l.documento)}</TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap gap-1">
                          <DsBadge tone={d.tone}>{d.label}</DsBadge>
                          {l.novo && (
                            <DicaBotao texto="Desde a sua última consulta, a Receita atualizou a DCTFWeb deste cliente: chegou eSocial, EFD-Reinf ou SERO, ou a declaração foi transmitida. O aviso não diz qual dos dois. Consulte para ver.">
                              <DsBadge tone="warn">Movimento novo</DsBadge>
                            </DicaBotao>
                          )}
                          {l.semProcuracao && <DsBadge tone="neutral">Sem procuração</DsBadge>}
                        </div>
                        {l.novo && l.movimentoEm && <p className="text-meta text-muted-ink-2">na Receita em {dataBR(l.movimentoEm)}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <DsBadge tone={m.tone}>{m.label}</DsBadge>
                        {a?.data_encerramento && (
                          <p className="text-meta text-muted-ink-2">
                            em {dataBR(a.data_encerramento)}{a.valor_total != null ? ` · ${brl(a.valor_total)}` : ''}{l.mit.length > 1 ? ` · ${l.mit.length} apurações` : ''}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-ui text-muted-ink">{consultadoEm ? format(new Date(consultadoEm), 'dd/MM/yyyy HH:mm') : '—'}</TableCell>
                    <TableCell className="text-center">
                      {l.dctfweb?.status === 'transmitida' ? (
                        <DicaBotao texto="Abre o PDF do recibo da DCTFWeb deste mês, que já está guardado. Não consulta a Receita.">
                          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={ocupado === l.dctfweb.id} onClick={() => abrir(l.dctfweb!.id)}>
                            {ocupado === l.dctfweb.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                          </Button>
                        </DicaBotao>
                      ) : <span className="text-muted-ink-2">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <DicaBotao custo={l.filial ? undefined : 'Consultar'} vezes={2}
                        texto={l.filial ? 'Filial: a DCTFWeb e a MIT são da matriz. Consulte a matriz.' : `Consulta na Receita o recibo da DCTFWeb de ${siglaCompetencia(competencia)} e as apurações da MIT do ano, guardando o recibo.`}>
                        <Button size="sm" variant="outline" disabled={consultando || l.filial} onClick={() => executar(l.contact_id)}>
                          {consultando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                          Consultar{!l.filial && <Preco tipo="Consultar" vezes={2} />}
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

      <p className="text-meta text-muted-ink-2">Mostrando {filtradas.length} de {linhas.length} clientes do Lucro Presumido e do Lucro Real.</p>
      {dialog}
    </div>
  );
}
