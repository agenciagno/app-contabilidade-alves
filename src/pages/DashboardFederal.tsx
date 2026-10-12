import { useEffect, useMemo, useState } from 'react';
import { AjudaDaTela } from '@/components/monitor/AjudaDaTela';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ChevronRight, ClipboardCheck } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip } from 'recharts';

import { DsAlert, PageHeader, SearchField } from '@/components/ds';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatarCnpj } from '@/components/gestao360/ClienteFiltro';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { SeloMonitor, TABELA_ROLAVEL } from '@/components/monitor/MonitorUi';
import { NotificacoesFiscais } from '@/components/monitor/NotificacoesFiscais';
import { ForaDeAtendimentoBox } from '@/components/contacts/ForaDeAtendimentoBox';
import { useFichaFiscal } from '@/components/monitor/FichaFiscal';
import { Caixa, DeclaracoesBox, LimiteSimplesBox, MensagensEcacBox, ParcelamentosBox, type LinhaDeclaracao } from '@/components/monitor/PainelBoxes';
import { consultadoEm as consultaParcelamento, useMatrizParcelamentos } from '@/hooks/useSerproParcelamentos';
import { useMatrizMei, seloMei } from '@/hooks/useSerproMei';
import { useMatrizEProcesso } from '@/hooks/useSerproExtras';
import { useMatrizDctfwebMit } from '@/hooks/useSerproDctfweb';
import { useSituacaoCarteira, useCadastroMonitor } from '@/hooks/useSituacaoCarteira';
import { certificadoPorCliente, useCertificates } from '@/hooks/useCertificates';
import { anoDe, useMatrizPgdasd } from '@/hooks/useSerproPgdasd';
import { useConferenciaCadastro } from '@/hooks/useSerproConferenciaCadastro';
import { useUltimasMensagensCaixa } from '@/hooks/useSerproCaixaPostal';
import { siglaCompetencia, useMatrizPagamentos } from '@/hooks/useSerproPagamentos';
import { montarLinhasSimples } from '@/lib/simplesNacionalLinhas';
import {
  COR_ESTADO, DICA_ESTADO, ESTADOS, FORA_DA_SITUACAO_DO_CLIENTE, ROTULO_ESTADO,
  contarEstados, outrosMotivos, seloDoCliente, seloEProcesso, selosDaCarteira,
  type EstadoMonitor, type ProcessoPainel, type Selo,
} from '@/lib/monitorEstados';
import { resumoMensagens, resumoParcelamentos } from '@/lib/painelFiscal';
import { vencimentoDoPeriodo } from '@/lib/prazosFederais';
import type { TabelaExport } from '@/lib/exportarTabela';
import type { LinhaCarteira } from '@/lib/situacaoCarteira';

const SIMPLES = '/dashboard-federal/simples-nacional';
const PROCURACOES = '/dashboard-federal/procuracoes';

/** Uma barra por processo. `filtra`: a tela de destino já abre filtrada no estado clicado (`?estado=`). O Limite do Simples tem box próprio. */
const PROCESSOS: { chave: ProcessoPainel; titulo: string; to: string; filtra: boolean }[] = [
  { chave: 'pgdas', titulo: 'PGDAS-D', to: `${SIMPLES}?fonte=declaracao`, filtra: true },
  { chave: 'das', titulo: 'DAS do Simples', to: `${SIMPLES}?fonte=das`, filtra: true },
  { chave: 'defis', titulo: 'DEFIS', to: `${SIMPLES}?aba=defis`, filtra: true },
  { chave: 'mei', titulo: 'MEI', to: `${SIMPLES}?aba=mei`, filtra: true },
  { chave: 'dctfweb_mit', titulo: 'DCTFWeb | MIT', to: '/dashboard-federal/dctfweb-mit', filtra: true },
  { chave: 'sitfis', titulo: 'Situação fiscal', to: '/dashboard-federal/situacao-fiscal', filtra: true },
  { chave: 'caixa', titulo: 'Caixa Postal e-CAC', to: '/mensagens', filtra: true },
  // A aba Intimações agrupa por mensagem (nova, em tratamento...), não pelos 5 estados: abre sem filtro.
  { chave: 'intimacoes', titulo: 'Intimações', to: '/mensagens?aba=intimacoes', filtra: false },
  { chave: 'eprocesso', titulo: 'e-Processo', to: '/dashboard-federal/eprocesso', filtra: true },
  { chave: 'procuracao', titulo: 'Procurações', to: `${PROCURACOES}?fonte=procuracao`, filtra: true },
  { chave: 'certificado', titulo: 'Certificados', to: `${PROCURACOES}?fonte=certificado`, filtra: true },
];

const comEstado = (to: string, e: EstadoMonitor) => `${to}${to.includes('?') ? '&' : '?'}estado=${e}`;

interface LinhaPainel { l: LinhaCarteira; selos: Record<ProcessoPainel, Selo | null>; cliente: Selo }

/**
 * Dashboard Fiscal (ex-Dashboard Federal). Duas colunas, 70% e 30%, como no print de referência:
 * à esquerda Pendências fiscais (clientes + por processo), Limite do Simples, Parcelamentos e Caixa Postal;
 * à direita Notificações e Declarações. Em 11/10/2026: saíram Ausências e Relatórios Fiscais, entraram MEI e e-Processo no
 * "Por Processo" (e-Processo fica fora da situação do cliente) e a lista da rosca ganhou busca, exportar e clique na linha.
 */
export default function DashboardFederal() {
  const navigate = useNavigate();
  const { linhas, carregando, competencia, hoje, fontesAtualizadas, faturamento } = useSituacaoCarteira();
  const { aberturas, responsaveis, carregando: carregandoCadastro } = useCadastroMonitor();
  const { data: pgdas = [], isLoading: carregandoPgdas } = useMatrizPgdasd(anoDe(competencia));
  const { data: pagamentos = [], isLoading: carregandoPag } = useMatrizPagamentos(competencia);
  const { data: certificados = [], isLoading: carregandoCert } = useCertificates();
  const { data: ultimas = [], isLoading: carregandoUltimas } = useUltimasMensagensCaixa(3);
  const { data: parcelamentos = [], isLoading: carregandoParc } = useMatrizParcelamentos();
  const ano = anoDe(competencia);
  const { data: mei = [], isLoading: carregandoMei } = useMatrizMei(ano);
  const { data: eprocessos = [], isLoading: carregandoEproc } = useMatrizEProcesso();
  const { data: dctfMit = [] } = useMatrizDctfwebMit(competencia);
  const resumoParc = useMemo(() => resumoParcelamentos(parcelamentos), [parcelamentos]);
  const conferencia = useConferenciaCadastro();
  const [lista, setLista] = useState<EstadoMonitor | null>(null);
  const [busca, setBusca] = useState('');
  useEffect(() => { setBusca(''); }, [lista]);
  const ficha = useFichaFiscal();

  const diasCert = useMemo(() => certificadoPorCliente(certificados), [certificados]);

  // PGDAS-D, DAS e limite saem da mesma linha da tela Simples Nacional: o número da barra é o número da lista.
  const simples = useMemo(
    () => montarLinhasSimples({ pgdas, pagamentos, faturamento, responsaveis, aberturas, pa: competencia, hoje }),
    [pgdas, pagamentos, faturamento, responsaveis, aberturas, competencia, hoje],
  );

  const painel = useMemo<LinhaPainel[]>(() => {
    const porId = new Map(simples.map((x) => [x.contact_id, x]));
    const meiPor = new Map(mei.map((m) => [m.contact_id, seloMei(m, ano)]));
    const eprocPor = new Map(eprocessos.filter((e) => !e.filial).map((e) => [e.contact_id, seloEProcesso(!!e.consulta, e.processos.length)]));
    return linhas.map((l) => {
      const ls = porId.get(l.contact_id);
      const selos = selosDaCarteira(l, {
        // Fora da lista do Simples no mês (outro regime, filial, aberta depois): PGDAS-D, DAS e limite não se aplicam.
        ...(ls ? { pgdas: ls.declaracao, das: ls.dasSelo, limite: ls.limite } : { pgdas: null, das: null, limite: null }),
        mei: meiPor.get(l.contact_id) ?? null,
        eprocesso: eprocPor.get(l.contact_id) ?? null,
        diasCertificado: diasCert.get(l.contact_id)?.dias ?? null,
      });
      return { l, selos, cliente: seloDoCliente(selos) };
    });
  }, [linhas, simples, diasCert, mei, eprocessos, ano]);

  const porCliente = useMemo(() => contarEstados(painel.map((p) => p.cliente)), [painel]);
  const porProcesso = useMemo(
    () => PROCESSOS.map((p) => ({ ...p, contagem: contarEstados(painel.map((x) => x.selos[p.chave])) })),
    [painel],
  );
  // Declarações: as mesmas contagens das barras do "Por Processo" (e das listas que abrem ao clicar), só que em palavras.
  const declaracoes = useMemo<LinhaDeclaracao[]>(() => {
    const por = (chave: ProcessoPainel) => porProcesso.find((p) => p.chave === chave)!;
    const venc = vencimentoDoPeriodo(competencia);
    return [
      { chave: 'pgdas', titulo: 'PGDAS-D', nota: `Prazo ${venc.slice(8, 10)}/${venc.slice(5, 7)}`, to: por('pgdas').to, contagem: por('pgdas').contagem },
      { chave: 'defis', titulo: 'DEFIS', to: por('defis').to, contagem: por('defis').contagem },
      { chave: 'dctfweb_mit', titulo: 'DCTFWeb | MIT', to: por('dctfweb_mit').to, contagem: por('dctfweb_mit').contagem, aConfirmar: true },
    ];
  }, [porProcesso, competencia]);

  // Última leitura de cada fonte: as da carteira (PGDAS-D, DEFIS, situação fiscal, Caixa Postal, procurações) e as do painel.
  const leituras = useMemo(() => {
    const maior = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).sort().pop() ?? null;
    const base = new Map(fontesAtualizadas.map((f) => [f.rotulo, f.em]));
    const ordem: { rotulo: string; em: string | null }[] = [
      { rotulo: 'PGDAS-D', em: base.get('PGDAS-D') ?? null },
      { rotulo: 'DEFIS', em: base.get('DEFIS') ?? null },
      { rotulo: 'DCTFWeb | MIT', em: maior(dctfMit.flatMap((l) => [l.dctfweb?.consultado_em, l.mitConsultado?.consultado_em])) },
      { rotulo: 'Situação fiscal', em: base.get('Situação fiscal') ?? null },
      { rotulo: 'Caixa Postal', em: base.get('Caixa Postal') ?? null },
      { rotulo: 'Pagamentos', em: maior(pagamentos.map((l) => l.consultadoEm)) },
      { rotulo: 'Parcelamentos', em: maior(parcelamentos.map(consultaParcelamento)) },
      { rotulo: 'e-Processo', em: maior(eprocessos.map((l) => l.consulta?.consultado_em)) },
      { rotulo: 'Procurações', em: base.get('Procurações') ?? null },
    ];
    return ordem;
  }, [fontesAtualizadas, dctfMit, pagamentos, parcelamentos, eprocessos]);
  const mensagens = useMemo(() => resumoMensagens(linhas), [linhas]);

  const ocupado = carregando || carregandoCadastro || carregandoPgdas || carregandoPag || carregandoCert || carregandoMei || carregandoEproc;
  const fatias = ESTADOS.map((e) => ({ chave: e, nome: ROTULO_ESTADO[e], valor: porCliente[e] })).filter((f) => f.valor > 0);
  const listaAberta = lista ? painel.filter((p) => p.cliente.estado === lista) : [];
  const listaFiltrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qd = q.replace(/\D/g, '');
    return listaAberta
      .filter(({ l }) => !q || l.nome.toLowerCase().includes(q) || (!!qd && l.documento.replace(/\D/g, '').includes(qd)))
      .sort((a, b) => a.l.nome.localeCompare(b.l.nome, 'pt-BR'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painel, lista, busca]);
  const tabelaExport = (): TabelaExport => ({
    arquivo: `dashboard-fiscal-${lista ?? 'clientes'}`,
    titulo: `Dashboard Fiscal: ${lista ? ROTULO_ESTADO[lista] : 'clientes'} (competência ${siglaCompetencia(competencia)})`,
    colunas: ['Razão social', 'CNPJ', 'Regime', 'Situação', 'Outros motivos', 'Responsável'],
    linhas: listaFiltrada.map(({ l, selos, cliente }) => {
      const conta = (Object.keys(selos) as ProcessoPainel[]).filter((k) => !FORA_DA_SITUACAO_DO_CLIENTE.includes(k)).map((k) => selos[k]);
      return [l.nome, formatarCnpj(l.documento), l.regimeRotulo, cliente.motivo, outrosMotivos(conta, cliente).join('; '), l.responsavel?.nome ?? 'Sem responsável'];
    }),
  });
  const estadosVisiveis = ESTADOS.filter((e) => e !== 'processando' || porCliente.processando > 0);

  return (
    <div className="space-y-6">
      <PageHeader kicker="~/dashboard fiscal" title="Dashboard Fiscal" ajuda={<AjudaDaTela tela="dashboard" />} />

      {!conferencia.carregando && conferencia.linhas.length > 0 && (
        <DsAlert
          tone="warn"
          icon={<ClipboardCheck />}
          title={`${conferencia.linhas.length} ${conferencia.linhas.length === 1 ? 'cliente com cadastro divergente' : 'clientes com cadastro divergente'}`}
          description="Regime, CNPJ ou situação diferentes da Receita."
          action={<Link to="/dashboard-federal/conferencia-cadastro" className="shrink-0 text-ui-strong text-action hover:underline">Conferir</Link>}
        />
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-line bg-paper px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <span className="text-kicker uppercase text-muted-ink-2">Última leitura</span>
          {fontesAtualizadas.length === 0 && <span className="text-meta text-muted-ink-2">carregando…</span>}
          {fontesAtualizadas.length > 0 && leituras.map((f) => (
            <span key={f.rotulo} className="text-meta text-muted-ink">{f.rotulo}: <span className="text-ink">{f.em ? format(new Date(f.em), 'dd/MM HH:mm') : 'nunca'}</span></span>
          ))}
        </div>
        <Link to="/dashboard-federal/pagamentos" className="shrink-0 text-ui-strong text-action hover:underline">Pagamentos e DAS</Link>
      </div>

      {ocupado ? (
        <div className="grid gap-4 xl:grid-cols-[7fr_3fr]">
          <div className="space-y-4"><Skeleton className="h-[420px] w-full" /><Skeleton className="h-[300px] w-full" /></div>
          <div className="space-y-4"><Skeleton className="h-[320px] w-full" /><Skeleton className="h-[200px] w-full" /></div>
        </div>
      ) : (
        <div className="grid items-stretch gap-4 xl:grid-cols-[7fr_3fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <Caixa titulo="Pendências fiscais" subtitulo={`Competência ${siglaCompetencia(competencia)}`}>
              <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                <div className="space-y-3">
                  <div>
                    <h3 className="text-ui-strong text-ink">Clientes</h3>
                    <p className="text-meta text-muted-ink">Cada cliente conta uma vez, pelo pior estado. Clique para ver quem é.</p>
                  </div>
                  <div className="relative mx-auto h-[190px] w-[190px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={fatias} dataKey="valor" nameKey="nome" innerRadius={60} outerRadius={88} paddingAngle={2} stroke="none"
                          onClick={(f: { chave?: EstadoMonitor }) => f.chave && setLista(f.chave)} className="cursor-pointer">
                          {fatias.map((f) => <Cell key={f.chave} fill={COR_ESTADO[f.chave]} />)}
                        </Pie>
                        <RTooltip formatter={(v: number, n: string) => [`${v} ${v === 1 ? 'cliente' : 'clientes'}`, n]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-metric-xl text-ink">{porCliente.total}</span>
                      <span className="text-meta text-muted-ink">clientes</span>
                    </div>
                  </div>
                  <ul className="divide-y divide-line-2">
                    {estadosVisiveis.map((e) => (
                      <li key={e}>
                        <button type="button" onClick={() => setLista(e)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-bg-2">
                          <span className="h-7 w-1 shrink-0 rounded-pill" style={{ background: COR_ESTADO[e] }} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block text-ui-strong text-ink">{ROTULO_ESTADO[e]}</span>
                            <span className="block text-meta text-muted-ink">{DICA_ESTADO[e]}</span>
                          </span>
                          <span className="text-ui-strong text-ink">{porCliente[e]}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-3 border-line lg:border-l lg:pl-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-ui-strong text-ink">Por Processo</h3>
                    <div className="flex flex-wrap gap-3">
                      {estadosVisiveis.map((e) => (
                        <span key={e} className="flex items-center gap-1.5 text-meta text-muted-ink">
                          <span className="h-2 w-2 rounded-pill" style={{ background: COR_ESTADO[e] }} aria-hidden />{ROTULO_ESTADO[e]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {porProcesso.map((p) => (
                      <div key={p.chave} className="grid grid-cols-[185px_1fr_36px] items-center gap-3">
                        <Link to={p.to} className="flex h-9 items-center justify-between gap-1 rounded-sm border border-line bg-bg-2 px-3 text-ui text-ink transition-colors hover:border-ink/40">
                          <span className="truncate">{p.titulo}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-ink-2" />
                        </Link>
                        {p.contagem.total === 0 ? (
                          <div className="h-6 rounded-sm bg-bg-2" />
                        ) : (
                          <div className="flex h-6 overflow-hidden rounded-sm bg-bg-2">
                            {ESTADOS.map((e) => p.contagem[e] > 0 && (
                              <Tooltip key={e}>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    aria-label={`${p.titulo}: ${p.contagem[e]} ${ROTULO_ESTADO[e]}`}
                                    onClick={() => navigate(p.filtra ? comEstado(p.to, e) : p.to)}
                                    className="h-full border-r border-paper transition-opacity last:border-r-0 hover:opacity-80"
                                    style={{ width: `${(p.contagem[e] / p.contagem.total) * 100}%`, background: COR_ESTADO[e] }}
                                  />
                                </TooltipTrigger>
                                <TooltipContent>{ROTULO_ESTADO[e]}: {p.contagem[e]} {p.contagem[e] === 1 ? 'cliente' : 'clientes'}</TooltipContent>
                              </Tooltip>
                            ))}
                          </div>
                        )}
                        <span className="text-right text-ui-strong text-ink">{p.contagem.total}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Caixa>

            <LimiteSimplesBox simples={simples} />
            <ParcelamentosBox r={resumoParc} carregando={carregandoParc} />
            <MensagensEcacBox r={mensagens} ultimas={ultimas} carregandoUltimas={carregandoUltimas} className="flex-1" />
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <NotificacoesFiscais />
            <DeclaracoesBox linhas={declaracoes} subtitulo={`Competência ${siglaCompetencia(competencia)}`} />
            <ForaDeAtendimentoBox />
          </div>
        </div>
      )}

      <Sheet open={!!lista} onOpenChange={(o) => !o && setLista(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-[820px]">
          {lista && (
            <>
              <SheetHeader className="space-y-1 text-left">
                <SheetTitle className="text-[20px]">{ROTULO_ESTADO[lista]}</SheetTitle>
                <SheetDescription>{listaAberta.length} {listaAberta.length === 1 ? 'cliente' : 'clientes'} · {DICA_ESTADO[lista]}</SheetDescription>
              </SheetHeader>
              {listaAberta.length === 0 ? (
                <p className="mt-8 text-center text-ui text-muted-ink">Nenhum cliente nesta situação.</p>
              ) : (
                <>
                  <div className="mt-5 flex items-center gap-2">
                    <SearchField placeholder="Buscar por razão social ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="flex-1" />
                    <ExportarMenu montar={tabelaExport} disabled={listaFiltrada.length === 0} escolherColunas />
                  </div>
                  {listaFiltrada.length === 0 ? (
                    <p className="mt-8 text-center text-ui text-muted-ink">Nenhum cliente com esse texto.</p>
                  ) : (
                    <div className={cn(TABELA_ROLAVEL, 'mt-4 max-h-[calc(100vh-17rem)]')}>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Cliente / Razão Social</TableHead>
                            <TableHead>Regime</TableHead>
                            <TableHead>Situação</TableHead>
                            <TableHead>Responsável</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {listaFiltrada.map(({ l, selos, cliente }) => {
                            const conta = (Object.keys(selos) as ProcessoPainel[]).filter((k) => !FORA_DA_SITUACAO_DO_CLIENTE.includes(k)).map((k) => selos[k]);
                            return (
                              <TableRow key={l.contact_id} className="cursor-pointer" tabIndex={0} aria-label={`Abrir a ficha fiscal de ${l.nome}`}
                                onClick={() => ficha.abrir(l.contact_id)}
                                onKeyDown={(ev) => { if (ev.key === 'Enter' && ev.target === ev.currentTarget) ficha.abrir(l.contact_id); }}>
                                <TableCell>
                                  <p className="text-ui text-ink">{l.nome}</p>
                                  <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(l.documento)}</p>
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-ui text-muted-ink">{l.regimeRotulo}</TableCell>
                                <TableCell><SeloMonitor selo={cliente} outros={outrosMotivos(conta, cliente)} /></TableCell>
                                <TableCell className="text-ui text-muted-ink">{l.responsavel?.nome ?? 'Sem responsável'}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
