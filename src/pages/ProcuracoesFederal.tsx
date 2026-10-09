import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';

import { useBuscaInicial } from '@/hooks/useBuscaInicial';
import { DsBadge, DsTab, PageHeader, SearchField } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DICA_RODAPE, DicaBotao } from '@/components/serpro/DicaBotao';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { CertificadosAba } from '@/components/certificates/CertificadosAba';
import { FaixaEstados, RodapeLista, SeloMini, SeloMonitor, UltimaBusca, useEstadoUrl } from '@/components/monitor/MonitorUi';
import { HORAS_MAPA_RECENTE, useMapearProcuracao, useProcuracoes, vencendo, type LinhaProcuracao } from '@/hooks/useSerproProcuracoes';
import { certificadoPorCliente, useCertificates, type CertificadoDoCliente } from '@/hooks/useCertificates';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { ROTULO_ESTADO, contarEstados, outrosMotivos, piorSelo, seloCertificado, seloProcuracao, type Selo } from '@/lib/monitorEstados';
import type { TabelaExport } from '@/lib/exportarTabela';

const REGIMES: Record<string, string> = {
  simples_nacional: 'Simples Nacional', lucro_presumido: 'Lucro Presumido', lucro_real: 'Lucro Real', mei: 'MEI', isento: 'Isento',
};
const formatarCnpj = (d: string) => {
  const n = d.replace(/\D/g, '');
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};
const dataBR = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

type Aba = 'procuracoes' | 'certificados';
/** Qual coluna a faixa conta: a situação da linha (pior entre as duas) ou só uma delas (link de uma barra do painel). */
type Fonte = 'situacao' | 'procuracao' | 'certificado';
const ROTULO_FONTE: Record<Exclude<Fonte, 'situacao'>, string> = { procuracao: 'Procuração', certificado: 'Certificado' };

/** Mesmo cálculo do Dashboard Fiscal (`selosDaCarteira`): o número da barra é o número da lista. */
const seloProcuracaoDa = (l: LinhaProcuracao) =>
  seloProcuracao({ situacao: l.situacao, diasParaVencer: l.diasParaVencer, vencendo: l.situacao !== 'vencida' && vencendo(l) });

/**
 * Procurações e Certificados (Rodada 3, 09/10/2026: as duas telas viraram uma). Aba Procurações: uma linha por cliente, no molde do
 * Monitoramento, com a procuração e-CAC e o certificado digital lado a lado. Aba Certificados: o cadastro dos certificados (antiga tela).
 */
export default function ProcuracoesFederal() {
  const [params, setParams] = useSearchParams();
  const { isModuleVisible, isSubItemVisible } = useModuleAccess();
  const veCertificados = isModuleVisible('cadastro') && isSubItemVisible('cadastro', 'cadastros_certificados');
  const aba: Aba = params.get('aba') === 'certificados' && veCertificados ? 'certificados' : 'procuracoes';
  const irPara = (a: Aba) => {
    const n = new URLSearchParams(params);
    n.delete('estado'); n.delete('fonte');
    if (a === 'procuracoes') n.delete('aba'); else n.set('aba', a);
    setParams(n, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="~/dashboard fiscal · procurações e certificados" title="Procurações e Certificados." />

      {veCertificados && (
        <div className="flex gap-1 border-b border-line">
          <DsTab active={aba === 'procuracoes'} onClick={() => irPara('procuracoes')}>Procurações</DsTab>
          <DsTab active={aba === 'certificados'} onClick={() => irPara('certificados')}>Certificados</DsTab>
        </div>
      )}

      {aba === 'procuracoes' ? <AbaProcuracoes veCertificados={veCertificados} /> : <CertificadosAba />}
    </div>
  );
}

// ---------------------------------------------------------------- aba Procurações

function AbaProcuracoes({ veCertificados }: { veCertificados: boolean }) {
  const [params, setParams] = useSearchParams();
  const fonteParam = params.get('fonte');
  const fonte: Fonte = fonteParam === 'procuracao' || (fonteParam === 'certificado' && veCertificados) ? fonteParam : 'situacao';
  const limparFonte = () => { const n = new URLSearchParams(params); n.delete('fonte'); n.delete('estado'); setParams(n, { replace: true }); };

  const { data: linhas = [], isLoading } = useProcuracoes();
  const { data: certificados = [], isLoading: carregandoCert } = useCertificates();
  const certPor = useMemo(() => certificadoPorCliente(certificados), [certificados]);
  const mapear = useMapearProcuracao();
  const [emAndamento, setEmAndamento] = useState<string | null>(null);
  const [aConfirmar, setAConfirmar] = useState<LinhaProcuracao | null>(null);
  const [estado, setEstado] = useEstadoUrl();
  const buscaInicial = useBuscaInicial();
  const [busca, setBusca] = useState(buscaInicial);

  const certDe = (l: LinhaProcuracao): CertificadoDoCliente | null => certPor.get(l.contact_id) ?? null;
  const seloCertDe = (l: LinhaProcuracao): Selo | null => (veCertificados ? seloCertificado(certDe(l)?.dias ?? null) : null);
  const seloDe = (l: LinhaProcuracao): Selo | null => {
    if (emAndamento === l.contact_id) return { estado: 'processando', motivo: 'Mapeando…' };
    if (fonte === 'procuracao') return seloProcuracaoDa(l);
    if (fonte === 'certificado') return seloCertDe(l);
    return piorSelo([seloProcuracaoDa(l), seloCertDe(l)]);
  };

  const matrizes = useMemo(() => linhas.filter((l) => !l.filial), [linhas]);
  const base = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, '');
    return matrizes
      .filter((l) => fonte !== 'certificado' || seloCertDe(l) !== null)
      .filter((l) => !q || l.nome.toLowerCase().includes(q) || (!!qDigitos && l.documento.replace(/\D/g, '').includes(qDigitos)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrizes, busca, fonte, certPor, veCertificados]);
  const contagem = contarEstados(base.map(seloDe));
  const filtradas = base.filter((l) => !estado || seloDe(l)?.estado === estado).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const executar = async (l: LinhaProcuracao) => {
    setEmAndamento(l.contact_id);
    try {
      const r = await mapear.mutateAsync({ contactId: l.contact_id });
      if (r.foraDoMonitoramento || !r.ok) { toast.error(r.error ?? 'Falha na consulta ao Serpro.'); return; }
      toast.success('Procurações deste cliente atualizadas.');
    } catch (e) {
      toast.error((e as Error)?.message || 'Falha na consulta. Tente novamente em instantes.');
    } finally {
      setEmAndamento(null);
    }
  };
  const pedir = (l: LinhaProcuracao) => {
    const recente = l.mapeadoEm && Date.now() - Date.parse(l.mapeadoEm) < HORAS_MAPA_RECENTE * 3600_000;
    if (recente) setAConfirmar(l); else executar(l);
  };

  const tabelaExport = (): TabelaExport => ({
    arquivo: 'procuracoes-e-certificados',
    titulo: 'Procurações eletrônicas (e-CAC) e certificados digitais dos clientes ativos',
    colunas: ['Razão social', 'CNPJ', 'Regime', 'Situação', 'Estado', 'Procuração', 'Procuração vence em', 'Serviços sem procuração', 'Certificado', 'Certificado vence em', 'Mapeado em'],
    linhas: filtradas.map((l) => {
      const s = seloDe(l);
      const c = certDe(l);
      return [
        l.nome, formatarCnpj(l.documento), REGIMES[l.regime ?? ''] ?? l.regime ?? '', s?.motivo ?? '', s ? ROTULO_ESTADO[s.estado] : '',
        seloProcuracaoDa(l)?.motivo ?? '', l.venceEm ? dataBR(l.venceEm) : '', l.situacao === 'sem' ? 'Todos' : l.faltam.join(', '),
        seloCertDe(l)?.motivo ?? (veCertificados ? 'Sem certificado cadastrado' : ''), c ? dataBR(c.validade) : '',
        l.mapeadoEm ? dataBR(l.mapeadoEm) : '',
      ];
    }),
  });

  const carregando = isLoading || (veCertificados && carregandoCert);

  return (
    <div className="space-y-5">
      {fonte !== 'situacao' && (
        <div className="flex items-center gap-2 text-meta text-muted-ink">
          Contando só a coluna <span className="text-ui-strong text-ink">{ROTULO_FONTE[fonte]}</span>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={limparFonte}><X className="mr-1 h-3.5 w-3.5" />Voltar à situação da linha</Button>
        </div>
      )}

      {carregando ? <Skeleton className="h-[88px] w-full" /> : <FaixaEstados contagem={contagem} ativo={estado} onChange={setEstado} />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchField placeholder="Buscar por razão social ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px] flex-1" />
        <ExportarMenu montar={tabelaExport} disabled={filtradas.length === 0} escolherColunas />
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-paper">
        {carregando ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtradas.length === 0 ? (
          <div className="p-10 text-center text-ui text-muted-ink">Nenhum cliente nesta situação.</div>
        ) : (
          <Table className="[&_td]:px-3 [&_th]:px-3">
            <TableHeader>
              <TableRow>
                <TableHead>Situação</TableHead>
                <TableHead>Procuração e-CAC</TableHead>
                {veCertificados && <TableHead>Certificado digital</TableHead>}
                <TableHead>Cliente</TableHead>
                <TableHead>Última busca</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((l) => {
                const consultando = emAndamento === l.contact_id;
                const c = certDe(l);
                const faltam = l.situacao === 'parcial' ? l.faltam : [];
                // O selo principal sai da mesma lista que os "outros", para não repetir o motivo embaixo dele.
                const selos = [seloProcuracaoDa(l), seloCertDe(l)];
                const principal = fonte === 'situacao' && !consultando ? piorSelo(selos) : seloDe(l);
                return (
                  <TableRow key={l.contact_id}>
                    <TableCell className="min-w-[170px]">
                      <SeloMonitor selo={principal} outros={fonte === 'situacao' ? outrosMotivos(selos, principal) : []} />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1">
                          <SeloMini selo={seloProcuracaoDa(l)} />
                          {l.perdidaEm && (
                            <DicaBotao texto="O sensor diário da Receita não reconhece mais a procuração deste cliente, mesmo o mapa dando como ativa. Peça para outorgar de novo e use Mapear para confirmar.">
                              <DsBadge tone="danger" dot={false}>Perdida (sensor)</DsBadge>
                            </DicaBotao>
                          )}
                        </div>
                        {l.venceEm && <p className="whitespace-nowrap text-meta text-muted-ink-2">até {dataBR(l.venceEm)}</p>}
                        {faltam.length > 0 && <p className="line-clamp-2 max-w-[240px] text-meta text-muted-ink-2" title={`Faltam: ${faltam.join(', ')}`}>Faltam: {faltam.join(', ')}</p>}
                      </div>
                    </TableCell>
                    {veCertificados && (
                      <TableCell>
                        {c ? (
                          <div className="space-y-0.5">
                            <SeloMini selo={seloCertDe(l)} />
                            <p className="whitespace-nowrap text-meta text-muted-ink-2">{c.modelo} · até {dataBR(c.validade)}</p>
                          </div>
                        ) : <span className="text-meta text-muted-ink-2">Não cadastrado</span>}
                      </TableCell>
                    )}
                    <TableCell className="min-w-[200px] max-w-[280px]">
                      <p className="text-ui text-ink">{l.nome}</p>
                      <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(l.documento)}</p>
                      <p className="text-meta text-muted-ink-2">{REGIMES[l.regime ?? ''] ?? l.regime ?? 'Sem regime'}</p>
                    </TableCell>
                    <TableCell><UltimaBusca iso={l.mapeadoEm} contactId={l.contact_id} /></TableCell>
                    <TableCell className="text-right">
                      <DicaBotao custo="Consultar" texto="Consulta na Receita quais procurações este cliente deu à Contabilidade Alves e até quando valem. Use depois que o cliente outorgar ou renovar no e-CAC. Um aviso semanal chega quando alguma vence em breve.">
                        <Button size="sm" variant="outline" disabled={consultando} onClick={() => pedir(l)}>
                          {consultando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                          Mapear<Preco tipo="Consultar" />
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

      <RodapeLista mostrando={filtradas.length} total={matrizes.length} unidade="clientes ativos" filiais={linhas.length - matrizes.length} />

      <AlertDialog open={!!aConfirmar} onOpenChange={(o) => !o && setAConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Este cliente foi mapeado há pouco</AlertDialogTitle>
            <AlertDialogDescription>
              Só vale a pena mapear de novo se o cliente acabou de outorgar ou renovar a procuração no e-CAC e a mudança ainda não apareceu aqui.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <DicaBotao className={DICA_RODAPE} texto="Fecha sem consultar.">
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
            </DicaBotao>
            <DicaBotao className={DICA_RODAPE} custo="Consultar" texto="Consulta a Receita de novo, mesmo já tendo mapeado há pouco.">
              <AlertDialogAction onClick={() => { const l = aConfirmar!; setAConfirmar(null); executar(l); }}>
                Mapear de novo<Preco tipo="Consultar" />
              </AlertDialogAction>
            </DicaBotao>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
