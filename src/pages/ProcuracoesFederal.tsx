import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, RefreshCw, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';

import { useBuscaInicial } from '@/hooks/useBuscaInicial';
import { DsBadge, DsTab, PageHeader, SearchField } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AcaoLoteDialog, BarraSelecao, useSelecao } from '@/components/monitor/GuiasLote';
import { AcoesEmLoteDialog, BotaoAcoesEmLote } from '@/components/monitor/AcoesEmLote';
import { hojeBR } from '@/lib/prazosFederais';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DICA_RODAPE, DicaBotao } from '@/components/serpro/DicaBotao';
import { usePagamentosClienteJanela } from '@/components/serpro/PagamentosDoCliente';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { CertificadosAba } from '@/components/certificates/CertificadosAba';
import { FaixaEstados, PaginacaoLista, RodapeLista, SeloMini, SeloMonitor, UltimaBusca, useEstadoUrl, usePaginacao } from '@/components/monitor/MonitorUi';
import { HORAS_MAPA_RECENTE, useMapearProcuracao, useProcuracoes, vencendo, type LinhaProcuracao } from '@/hooks/useSerproProcuracoes';
import { certificadoPorCliente, useCertificates, type CertificadoDoCliente } from '@/hooks/useCertificates';
import { useAtualizarVinculos, useVinculosRedesim } from '@/hooks/useSerproExtras';
import { useCustoSerpro } from '@/hooks/useSerproConsumo';
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

type Aba = 'procuracoes' | 'certificados' | 'redesim';
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
  const abaParam = params.get('aba');
  const aba: Aba = abaParam === 'certificados' && veCertificados ? 'certificados' : abaParam === 'redesim' ? 'redesim' : 'procuracoes';
  const irPara = (a: Aba) => {
    const n = new URLSearchParams(params);
    n.delete('estado'); n.delete('fonte');
    if (a === 'procuracoes') n.delete('aba'); else n.set('aba', a);
    setParams(n, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="~/dashboard fiscal · procurações e certificados" title="Procurações | Certificados." />

      <div className="flex gap-1 border-b border-line">
        <DsTab active={aba === 'procuracoes'} onClick={() => irPara('procuracoes')}>Procurações</DsTab>
        {veCertificados && <DsTab active={aba === 'certificados'} onClick={() => irPara('certificados')}>Certificados</DsTab>}
        <DsTab active={aba === 'redesim'} onClick={() => irPara('redesim')}>Vínculos Redesim</DsTab>
      </div>

      {aba === 'procuracoes' ? <AbaProcuracoes veCertificados={veCertificados} /> : aba === 'certificados' ? <CertificadosAba /> : <AbaRedesim />}
    </div>
  );
}

// ---------------------------------------------------------------- aba Procurações

function AbaProcuracoes({ veCertificados }: { veCertificados: boolean }) {
  const { abrir: abrirPagamentos, janela: janelaPagamentos } = usePagamentosClienteJanela();
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
  const sel = useSelecao();
  const [loteAberto, setLoteAberto] = useState(false);
  const [acoesLote, setAcoesLote] = useState(false);
  const hoje = hojeBR();

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

  const pag = usePaginacao(filtradas, `${busca}|${estado ?? ''}|${fonte}`);
  const topoTabela = useRef<HTMLDivElement>(null);
  const irParaPagina = (n: number) => {
    pag.setPagina(n);
    requestAnimationFrame(() => topoTabela.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const idsDaPagina = pag.recorte.map((l) => l.contact_id);

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
        <div className="flex items-center gap-2">
          <BotaoAcoesEmLote onClick={() => setAcoesLote(true)} disabled={matrizes.length === 0} />
          <ExportarMenu montar={tabelaExport} disabled={filtradas.length === 0} escolherColunas />
        </div>
      </div>

      <BarraSelecao quantos={sel.marcados.size} onLimpar={sel.limpar}>
        {filtradas.some((l) => !sel.marcados.has(l.contact_id)) && filtradas.length > pag.recorte.length && (
          <DicaBotao texto="Marca todos os clientes da lista com os filtros atuais, inclusive os das outras páginas.">
            <Button size="sm" variant="outline" onClick={() => sel.somar(filtradas.map((l) => l.contact_id))}>Marcar os {filtradas.length} da lista</Button>
          </DicaBotao>
        )}
        <DicaBotao custo="Consultar" texto="Consulta na Receita as procurações de cada cliente marcado, um de cada vez. Quem já foi mapeado hoje fica de fora.">
          <Button size="sm" onClick={() => setLoteAberto(true)}>Mapear ({sel.marcados.size})</Button>
        </DicaBotao>
      </BarraSelecao>

      <div ref={topoTabela} className="scroll-mt-16 overflow-x-auto rounded-lg border border-line bg-paper">
        {carregando ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtradas.length === 0 ? (
          <div className="p-10 text-center text-ui text-muted-ink">Nenhum cliente nesta situação.</div>
        ) : (
          <Table className="[&_td]:px-3 [&_th]:px-3">
            <TableHeader>
              <TableRow>
                <TableHead>
                  <div className="flex items-center gap-3">
                    <Checkbox aria-label="Marcar todos desta página" checked={sel.todos(idsDaPagina)}
                      onCheckedChange={(v) => (v ? sel.somar(idsDaPagina) : sel.quitar(idsDaPagina))} />
                    Cliente / Razão Social
                  </div>
                </TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Procuração e-CAC</TableHead>
                {veCertificados && <TableHead>Certificado digital</TableHead>}
                <TableHead>Última busca</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pag.recorte.map((l) => {
                const consultando = emAndamento === l.contact_id;
                const c = certDe(l);
                const faltam = l.situacao === 'parcial' ? l.faltam : [];
                // O selo principal sai da mesma lista que os "outros", para não repetir o motivo embaixo dele.
                const selos = [seloProcuracaoDa(l), seloCertDe(l)];
                const principal = fonte === 'situacao' && !consultando ? piorSelo(selos) : seloDe(l);
                return (
                  <TableRow key={l.contact_id}>
                    <TableCell className="min-w-[240px] max-w-[360px]">
                      <div className="flex items-start gap-3">
                        <span className="pt-0.5"><Checkbox aria-label={`Marcar ${l.nome}`} checked={sel.marcados.has(l.contact_id)} onCheckedChange={() => sel.alternar(l.contact_id)} /></span>
                        <div className="min-w-0">
                          <p className="text-ui text-ink">{l.nome}</p>
                          <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(l.documento)}</p>
                          <p className="text-meta text-muted-ink-2">{REGIMES[l.regime ?? ''] ?? l.regime ?? 'Sem regime'}</p>
                        </div>
                      </div>
                    </TableCell>
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
                    <TableCell><UltimaBusca iso={l.mapeadoEm} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                      <DicaBotao texto="Abre os pagamentos deste cliente na Receita (DARF, DAS, DAE e DJE) com a composição de cada guia e o comprovante. Abrir é grátis: só lê o que já está salvo.">
                            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Pagamentos do cliente" onClick={() => abrirPagamentos(l.contact_id, l.nome, formatarCnpj(l.documento))}>
                              <Wallet className="h-4 w-4" />
                            </Button>
                          </DicaBotao>
                      <DicaBotao custo="Consultar" texto="Consulta na Receita quais procurações este cliente deu à Contabilidade Alves e até quando valem. Use depois que o cliente outorgar ou renovar no e-CAC. Um aviso semanal chega quando alguma vence em breve.">
                        <Button size="sm" variant="outline" disabled={consultando} onClick={() => pedir(l)}>
                          {consultando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                          Mapear<Preco tipo="Consultar" />
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

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <RodapeLista mostrando={filtradas.length} total={matrizes.length} unidade="clientes ativos" filiais={linhas.length - matrizes.length} faixa={pag.faixa} />
        <PaginacaoLista pagina={pag.pagina} totalPaginas={pag.totalPaginas} porPagina={pag.porPagina} total={filtradas.length}
          onPagina={irParaPagina} onPorPagina={pag.setPorPagina} />
      </div>

      <AcoesEmLoteDialog
        aberto={acoesLote}
        onClose={() => setAcoesLote(false)}
        clientes={matrizes.map((l) => ({ id: l.contact_id, nome: l.nome, documento: l.documento, selo: seloProcuracaoDa(l) }))}
        acoes={[{ chave: 'mapear', rotulo: 'Mapear procurações', custo: 'Consultar', padrao: ['pendencia', 'atencao', 'nao_verificado'],
          dica: 'Consulta quais procurações cada cliente deu à Contabilidade Alves e até quando valem. Quem já foi mapeado hoje fica de fora.' }]}
        onContinuar={(_acao, ids) => { sel.definir(ids); setLoteAberto(true); }}
      />
      <AcaoLoteDialog
        aberto={loteAberto}
        onClose={() => setLoteAberto(false)}
        titulo="Mapear procurações"
        descricao="Consulta na Receita quais procurações cada cliente marcado deu à Contabilidade Alves e até quando valem, um de cada vez."
        itens={matrizes.filter((l) => sel.marcados.has(l.contact_id)).map((l) => ({
          contactId: l.contact_id, nome: l.nome, pular: l.mapeadoEm?.slice(0, 10) === hoje ? 'Mapeado hoje' : null,
        }))}
        tipo="Consultar"
        rotuloAcao="Mapear"
        rotuloFeito="Mapeado"
        executar={async (item) => {
          const r = await mapear.mutateAsync({ contactId: item.contactId });
          return { ok: !!r.ok && !r.foraDoMonitoramento, error: r.error };
        }}
      />
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
      {janelaPagamentos}
    </div>
  );
}

// ---------------------------------------------------------------- aba Vínculos Redesim (09/10/2026)

/**
 * Vínculos da CA como contador na Redesim (PNRCONTADOR.CONSVINCULOS261), cruzados com a carteira:
 * cliente ativo sem vínculo (a CA não aparece como contador dele) e CNPJ vinculado que não é cliente ativo (pedir a renúncia).
 */
function AbaRedesim() {
  const { data: vinculos = [], isLoading } = useVinculosRedesim();
  const { data: linhas = [], isLoading: carregandoClientes } = useProcuracoes();
  const atualizar = useAtualizarVinculos();
  const { admin } = useCustoSerpro();
  const [res, setRes] = useState<string | null>(null);

  const matrizes = linhas.filter((l) => !l.filial);
  const cnpjDe = (d: string) => d.replace(/\D/g, '');
  const vinculados = new Set(vinculos.map((v) => v.cnpj));
  const ativos = new Set(matrizes.map((l) => cnpjDe(l.documento)));
  const semVinculo = matrizes.filter((l) => !vinculados.has(cnpjDe(l.documento))).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const naoClientes = vinculos.filter((v) => !ativos.has(v.cnpj));
  const ultima = vinculos.map((v) => v.consultado_em).sort().pop() ?? null;

  const rodar = async () => {
    setRes(null);
    try {
      const r = await atualizar.mutateAsync({});
      setRes(r.ok ? `${r.vinculos} CNPJs vinculados à CA na Redesim.` : (r.error ?? 'Falha na consulta.'));
    } catch (e) {
      setRes((e as Error)?.message || 'Falha na consulta.');
    }
  };

  if (isLoading || carregandoClientes) return <Skeleton className="h-[200px] w-full" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-paper p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-ui-strong text-ink">{vinculos.length ? `${vinculos.length} CNPJs com a CA como contador na Redesim` : 'Vínculos ainda não consultados'}</p>
          <p className="text-meta text-muted-ink-2">{ultima ? `Atualizado em ${dataBR(ultima)}` : 'Uma consulta por página de 100 CNPJs.'}{res ? ` · ${res}` : ''}</p>
        </div>
        <DicaBotao custo="Consultar" texto={admin ? 'Consulta na Receita todos os CNPJs vinculados à CA como contador (uma chamada por página de 100).' : 'Só administradores atualizam os vínculos.'}>
          <Button size="sm" variant="outline" disabled={!admin || atualizar.isPending} onClick={rodar}>
            {atualizar.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}Atualizar vínculos
          </Button>
        </DicaBotao>
      </div>

      {vinculos.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="space-y-2 rounded-lg border border-line bg-paper p-4">
            <h3 className="text-ui-strong text-ink">Clientes ativos sem vínculo ({semVinculo.length})</h3>
            <p className="text-meta text-muted-ink-2">A CA não aparece como contadora deles na Redesim. Confira o cadastro na Junta ou na Receita.</p>
            <ul className="max-h-[360px] divide-y divide-line-2 overflow-y-auto">
              {semVinculo.map((l) => (
                <li key={l.contact_id} className="py-2">
                  <p className="text-ui text-ink">{l.nome}</p>
                  <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(l.documento)}</p>
                </li>
              ))}
            </ul>
          </section>
          <section className="space-y-2 rounded-lg border border-line bg-paper p-4">
            <h3 className="text-ui-strong text-ink">Vinculados que não são clientes ativos ({naoClientes.length})</h3>
            <p className="text-meta text-muted-ink-2">A CA ainda aparece como contadora. Se a empresa saiu, avalie pedir a renúncia do vínculo.</p>
            <ul className="max-h-[360px] divide-y divide-line-2 overflow-y-auto">
              {naoClientes.map((v) => (
                <li key={v.cnpj} className="py-2">
                  <p className="font-mono text-ui text-ink">{formatarCnpj(v.cnpj)}</p>
                  <p className="text-meta text-muted-ink-2">{[v.tipo_estabelecimento, v.situacao, v.uf].filter(Boolean).join(' · ')}{v.contact_id ? ' · no cadastro, mas fora dos ativos' : ' · fora do cadastro'}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
