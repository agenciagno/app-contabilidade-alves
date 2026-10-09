import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { FileText, Loader2, RefreshCw } from 'lucide-react';

import { PageHeader, SearchField } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CompetenciaNav } from '@/components/serpro/CompetenciaNav';
import { Preco, brl } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { useAbrirRecibo, useConsultaDctfwebMit } from '@/components/serpro/dctfwebUi';
import { FaixaEstados, RodapeLista, SeloMini, SeloMonitor, UltimaBusca, useEstadoUrl } from '@/components/monitor/MonitorUi';
import { useBuscaInicial } from '@/hooks/useBuscaInicial';
import { competenciaPadrao, mesDeData, siglaCompetencia } from '@/hooks/useSerproPagamentos';
import { apuracaoVigente, estadoDctfweb, estadoMit, useMatrizDctfwebMit, type LinhaDctfwebMit } from '@/hooks/useSerproDctfweb';
import { ROTULO_ESTADO, contarEstados, seloDctfwebColuna, seloDctfwebMit, seloMitColuna, type Selo } from '@/lib/monitorEstados';
import type { TabelaExport } from '@/lib/exportarTabela';

const REGIMES: Record<string, string> = { lucro_presumido: 'Lucro Presumido', lucro_real: 'Lucro Real' };
const formatarCnpj = (d: string) => {
  const n = d.replace(/\D/g, '');
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};
const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const ultimaConsulta = (l: LinhaDctfwebMit) => [l.dctfweb?.consultado_em, l.mitConsultado?.consultado_em].filter(Boolean).sort().pop() ?? null;

/**
 * DCTFWeb e MIT (Rodada 3, 09/10/2026: molde único do Monitoramento). Uma linha por cliente do Presumido e do Real com o selo
 * de `seloDctfwebMit`, o mesmo que o Dashboard Fiscal conta: a barra do painel abre esta lista já filtrada (`?estado=`).
 * Filiais seguem a matriz e ficam de fora, como no painel.
 */
export default function DctfwebMitFederal() {
  const [competencia, setCompetencia] = useState(competenciaPadrao());
  const { data: linhas = [], isLoading } = useMatrizDctfwebMit(competencia);
  const { executar, emAndamento, dialog } = useConsultaDctfwebMit(competencia);
  const { ocupado, abrir } = useAbrirRecibo();
  const [estado, setEstado] = useEstadoUrl();
  const buscaInicial = useBuscaInicial();
  const [busca, setBusca] = useState(buscaInicial);
  const [soNovos, setSoNovos] = useState(false);

  const seloDe = (l: LinhaDctfwebMit): Selo | null => (emAndamento === l.contact_id
    ? { estado: 'processando', motivo: 'Consultando…' }
    : seloDctfwebMit(estadoDctfweb(l), estadoMit(l)));

  const matrizes = useMemo(() => linhas.filter((l) => !l.filial), [linhas]);
  const novos = matrizes.filter((l) => l.novo).length;
  const base = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, '');
    return matrizes
      .filter((l) => !soNovos || l.novo)
      .filter((l) => !q || l.nome.toLowerCase().includes(q) || (!!qDigitos && l.documento.replace(/\D/g, '').includes(qDigitos)));
  }, [matrizes, soNovos, busca]);
  const contagem = contarEstados(base.map(seloDe));
  const filtradas = base.filter((l) => !estado || seloDe(l)?.estado === estado).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const tabelaExport = (): TabelaExport => ({
    arquivo: `dctfweb-mit-${competencia}`,
    titulo: `DCTFWeb e MIT — competência ${siglaCompetencia(competencia)}`,
    colunas: ['Razão social', 'CNPJ', 'Regime', 'Competência', 'Situação', 'Estado', 'DCTFWeb', 'Movimento novo', 'MIT', 'MIT encerrada em', 'MIT valor apurado', 'Consultado em'],
    linhas: filtradas.map((l) => {
      const a = apuracaoVigente(l);
      const s = seloDe(l);
      const em = ultimaConsulta(l);
      return [
        l.nome, formatarCnpj(l.documento), REGIMES[l.regime ?? ''] ?? l.regime ?? '', siglaCompetencia(competencia), s?.motivo ?? '', s ? ROTULO_ESTADO[s.estado] : '',
        seloDctfwebColuna(estadoDctfweb(l))?.motivo ?? '', l.novo ? 'Sim' : '', seloMitColuna(estadoMit(l))?.motivo ?? '',
        a?.data_encerramento ? dataBR(a.data_encerramento) : '', a?.valor_total != null ? brl(a.valor_total) : '',
        em ? format(new Date(em), 'dd/MM/yyyy HH:mm') : '',
      ];
    }),
  });

  return (
    <div className="space-y-6">
      <PageHeader kicker="~/dashboard fiscal · dctfweb e mit" title="DCTFWeb e MIT." />

      <div className="space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <CompetenciaNav competencia={competencia} onChange={setCompetencia} limite={mesDeData(new Date())} />
          <ExportarMenu montar={tabelaExport} disabled={filtradas.length === 0} escolherColunas />
        </div>

        {isLoading ? <Skeleton className="h-[88px] w-full" /> : <FaixaEstados contagem={contagem} ativo={estado} onChange={setEstado} />}

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchField placeholder="Buscar por razão social ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px] flex-1" />
          <DicaBotao texto="Todo dia às 07:40 a Receita informa, de graça, quem teve movimento na DCTFWeb (chegada de eSocial ou Reinf, ou transmissão). Eles ficam marcados até você consultar. No dia 30, a partir das 20:00, o sistema consulta sozinho só os marcados.">
            <Button variant={soNovos ? 'default' : 'outline'} size="sm" className="h-10" aria-pressed={soNovos} onClick={() => setSoNovos((v) => !v)}>
              Só movimento novo ({novos})
            </Button>
          </DicaBotao>
        </div>

        <div className="overflow-x-auto rounded-lg border border-line bg-paper">
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtradas.length === 0 ? (
            <div className="p-10 text-center text-ui text-muted-ink">Nenhum cliente nesta situação.</div>
          ) : (
            <Table className="[&_td]:px-3 [&_th]:px-3">
              <TableHeader>
                <TableRow>
                  <TableHead>Situação</TableHead>
                  <TableHead>DCTFWeb</TableHead>
                  <TableHead>MIT</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Última busca</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((l) => {
                  const a = apuracaoVigente(l);
                  const consultando = emAndamento === l.contact_id;
                  const outros = [l.novo ? 'Movimento novo' : null, l.semProcuracao ? 'Sem procuração' : null].filter((x): x is string => !!x);
                  return (
                    <TableRow key={l.contact_id}>
                      <TableCell className="min-w-[170px]"><SeloMonitor selo={seloDe(l)} outros={outros} /></TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          {estadoDctfweb(l) === 'sem_declaracao' ? (
                            <DicaBotao texto="Sem DCTFWeb no mês não quer dizer atraso: ela só existe para quem teve movimento no eSocial ou na EFD-Reinf. Confirme o movimento antes de cobrar.">
                              <SeloMini selo={seloDctfwebColuna('sem_declaracao')} />
                            </DicaBotao>
                          ) : <SeloMini selo={seloDctfwebColuna(estadoDctfweb(l))} />}
                          {l.novo && l.movimentoEm && <p className="text-meta text-muted-ink-2">Movimento em {dataBR(l.movimentoEm)}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <SeloMini selo={seloMitColuna(estadoMit(l))} />
                          {a?.data_encerramento && (
                            <p className="whitespace-nowrap text-meta text-muted-ink-2">
                              em {dataBR(a.data_encerramento)}{a.valor_total != null ? ` · ${brl(a.valor_total)}` : ''}{l.mit.length > 1 ? ` · ${l.mit.length} apurações` : ''}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[200px] max-w-[280px]">
                        <p className="text-ui text-ink">{l.nome}</p>
                        <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(l.documento)}</p>
                        <p className="text-meta text-muted-ink-2">{REGIMES[l.regime ?? ''] ?? l.regime ?? 'Sem regime'}</p>
                      </TableCell>
                      <TableCell><UltimaBusca iso={ultimaConsulta(l)} contactId={l.contact_id} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {l.dctfweb?.status === 'transmitida' && (
                            <DicaBotao texto="Abre o PDF do recibo da DCTFWeb deste mês, que já está guardado. Não consulta a Receita.">
                              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Recibo da DCTFWeb" disabled={ocupado === l.dctfweb.id} onClick={() => abrir(l.dctfweb!.id)}>
                                {ocupado === l.dctfweb.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                              </Button>
                            </DicaBotao>
                          )}
                          <DicaBotao custo="Consultar" vezes={2}
                            texto={`Consulta na Receita o recibo da DCTFWeb de ${siglaCompetencia(competencia)} e as apurações da MIT do ano, guardando o recibo.`}>
                            <Button size="sm" variant="outline" disabled={consultando} onClick={() => executar(l.contact_id)}>
                              {consultando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                              Consultar<Preco tipo="Consultar" vezes={2} />
                            </Button>
                          </DicaBotao>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <RodapeLista mostrando={filtradas.length} total={matrizes.length} unidade="clientes do Lucro Presumido e do Lucro Real" filiais={linhas.length - matrizes.length} />
      </div>
      {dialog}
    </div>
  );
}
