import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ChevronRight, ClipboardCheck } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip } from 'recharts';

import { DsAlert, PageHeader } from '@/components/ds';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatarCnpj } from '@/components/gestao360/ClienteFiltro';
import { SeloMonitor } from '@/components/monitor/MonitorUi';
import { NotificacoesFiscais } from '@/components/monitor/NotificacoesFiscais';
import { AusenciasBox, Caixa, DeclaracoesBox, LimiteSimplesBox, MensagensEcacBox, RelatoriosFiscaisBox } from '@/components/monitor/PainelBoxes';
import { useSituacaoCarteira, useCadastroMonitor } from '@/hooks/useSituacaoCarteira';
import { certificadoPorCliente, useCertificates } from '@/hooks/useCertificates';
import { anoDe, useMatrizPgdasd } from '@/hooks/useSerproPgdasd';
import { useConferenciaCadastro } from '@/hooks/useSerproConferenciaCadastro';
import { useUltimasMensagensCaixa } from '@/hooks/useSerproCaixaPostal';
import { rotuloCompetencia, siglaCompetencia, useMatrizPagamentos } from '@/hooks/useSerproPagamentos';
import { montarLinhasSimples } from '@/lib/simplesNacionalLinhas';
import {
  COR_ESTADO, DICA_ESTADO, ESTADOS, FORA_DA_SITUACAO_DO_CLIENTE, ROTULO_ESTADO,
  contarEstados, outrosMotivos, seloDoCliente, selosDaCarteira,
  type EstadoMonitor, type ProcessoPainel, type Selo,
} from '@/lib/monitorEstados';
import {
  ausenciasDctfwebMit, ausenciasSimples, barrasDeclaracoes, resumoMensagens,
} from '@/lib/painelFiscal';
import type { LinhaCarteira } from '@/lib/situacaoCarteira';

const SIMPLES = '/dashboard-federal/simples-nacional';
const PROCURACOES = '/dashboard-federal/procuracoes';

/** Uma barra por processo. `filtra`: a tela de destino já abre filtrada no estado clicado (`?estado=`). O Limite do Simples tem box próprio. */
const PROCESSOS: { chave: ProcessoPainel; titulo: string; to: string; filtra: boolean }[] = [
  { chave: 'pgdas', titulo: 'PGDAS-D', to: `${SIMPLES}?fonte=declaracao`, filtra: true },
  { chave: 'das', titulo: 'DAS do Simples', to: `${SIMPLES}?fonte=das`, filtra: true },
  { chave: 'defis', titulo: 'DEFIS', to: `${SIMPLES}?aba=defis`, filtra: true },
  { chave: 'dctfweb_mit', titulo: 'DCTFWeb e MIT', to: '/dashboard-federal/dctfweb-mit', filtra: true },
  { chave: 'sitfis', titulo: 'Situação fiscal', to: '/dashboard-federal/situacao-fiscal', filtra: true },
  { chave: 'caixa', titulo: 'Caixa Postal e-CAC', to: '/mensagens', filtra: true },
  // A aba Intimações agrupa por mensagem (nova, em tratamento...), não pelos 5 estados: abre sem filtro.
  { chave: 'intimacoes', titulo: 'Intimações', to: '/mensagens?aba=intimacoes', filtra: false },
  { chave: 'procuracao', titulo: 'Procurações', to: `${PROCURACOES}?fonte=procuracao`, filtra: true },
  { chave: 'certificado', titulo: 'Certificados', to: `${PROCURACOES}?fonte=certificado`, filtra: true },
];

const comEstado = (to: string, e: EstadoMonitor) => `${to}${to.includes('?') ? '&' : '?'}estado=${e}`;

interface LinhaPainel { l: LinhaCarteira; selos: Record<ProcessoPainel, Selo | null>; cliente: Selo }

/**
 * Dashboard Fiscal (ex-Dashboard Federal). Duas colunas, 70% e 30%, como no print de referência:
 * à esquerda Pendências fiscais (clientes + por processo), Limite do Simples e Mensagens e-CAC;
 * à direita Notificações, Ausências de Declarações, Relatórios Fiscais e Declarações.
 */
export default function DashboardFederal() {
  const navigate = useNavigate();
  const { linhas, carregando, competencia, hoje, fontesAtualizadas, faturamento } = useSituacaoCarteira();
  const { aberturas, responsaveis, carregando: carregandoCadastro } = useCadastroMonitor();
  const { data: pgdas = [], isLoading: carregandoPgdas } = useMatrizPgdasd(anoDe(competencia));
  const { data: pagamentos = [], isLoading: carregandoPag } = useMatrizPagamentos(competencia);
  const { data: certificados = [], isLoading: carregandoCert } = useCertificates();
  const { data: ultimas = [], isLoading: carregandoUltimas } = useUltimasMensagensCaixa(3);
  const conferencia = useConferenciaCadastro();
  const [lista, setLista] = useState<EstadoMonitor | null>(null);

  const diasCert = useMemo(() => certificadoPorCliente(certificados), [certificados]);

  // PGDAS-D, DAS e limite saem da mesma linha da tela Simples Nacional: o número da barra é o número da lista.
  const simples = useMemo(
    () => montarLinhasSimples({ pgdas, pagamentos, faturamento, responsaveis, aberturas, pa: competencia, hoje }),
    [pgdas, pagamentos, faturamento, responsaveis, aberturas, competencia, hoje],
  );

  const painel = useMemo<LinhaPainel[]>(() => {
    const porId = new Map(simples.map((x) => [x.contact_id, x]));
    return linhas.map((l) => {
      const ls = porId.get(l.contact_id);
      const selos = selosDaCarteira(l, {
        // Fora da lista do Simples no mês (outro regime, filial, aberta depois): PGDAS-D, DAS e limite não se aplicam.
        ...(ls ? { pgdas: ls.declaracao, das: ls.dasSelo, limite: ls.limite } : { pgdas: null, das: null, limite: null }),
        diasCertificado: diasCert.get(l.contact_id)?.dias ?? null,
      });
      return { l, selos, cliente: seloDoCliente(selos) };
    });
  }, [linhas, simples, diasCert]);

  const porCliente = useMemo(() => contarEstados(painel.map((p) => p.cliente)), [painel]);
  const porProcesso = useMemo(
    () => PROCESSOS.map((p) => ({ ...p, contagem: contarEstados(painel.map((x) => x.selos[p.chave])) })),
    [painel],
  );
  const sitfis = useMemo(() => contarEstados(painel.map((x) => x.selos.sitfis)), [painel]);
  const declaracoes = useMemo(() => barrasDeclaracoes(linhas, simples, competencia), [linhas, simples, competencia]);
  const ausSimples = useMemo(() => ausenciasSimples(linhas), [linhas]);
  const ausDctf = useMemo(() => ausenciasDctfwebMit(linhas), [linhas]);
  const mensagens = useMemo(() => resumoMensagens(linhas), [linhas]);

  const ocupado = carregando || carregandoCadastro || carregandoPgdas || carregandoPag || carregandoCert;
  const fatias = ESTADOS.map((e) => ({ chave: e, nome: ROTULO_ESTADO[e], valor: porCliente[e] })).filter((f) => f.valor > 0);
  const listaAberta = lista ? painel.filter((p) => p.cliente.estado === lista) : [];
  const estadosVisiveis = ESTADOS.filter((e) => e !== 'processando' || porCliente.processando > 0);

  return (
    <div className="space-y-6">
      <PageHeader kicker="~/dashboard fiscal" title="Dashboard Fiscal." />

      {!conferencia.carregando && conferencia.linhas.length > 0 && (
        <DsAlert
          tone="warn"
          icon={<ClipboardCheck />}
          title={`${conferencia.linhas.length} ${conferencia.linhas.length === 1 ? 'cliente com algo' : 'clientes com algo'} que não bate no cadastro`}
          description="Regime, CNPJ ou situação diferentes da Receita deixam o cliente fora das consultas certas."
          action={<Link to="/dashboard-federal/conferencia-cadastro" className="shrink-0 text-ui-strong text-action hover:underline">Conferir</Link>}
        />
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-line bg-paper px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <span className="text-kicker uppercase text-muted-ink-2">Última leitura</span>
          {fontesAtualizadas.length === 0 && <span className="text-meta text-muted-ink-2">carregando…</span>}
          {fontesAtualizadas.map((f) => (
            <span key={f.rotulo} className="text-meta text-muted-ink">{f.rotulo}: <span className="text-ink">{f.em ? format(new Date(f.em), 'dd/MM HH:mm') : 'nunca'}</span></span>
          ))}
        </div>
        <div className="flex flex-wrap gap-4">
          <Link to="/dashboard-federal/pagamentos" className="text-ui-strong text-action hover:underline">Pagamentos (DARF e DAE)</Link>
          <Link to="/gestao-360/ausencias" className="text-ui-strong text-action hover:underline">Ausências</Link>
          <Link to="/gestao-360/diagnosticos?aba=oportunidades" className="text-ui-strong text-action hover:underline">Oportunidades</Link>
        </div>
      </div>

      {ocupado ? (
        <div className="grid gap-4 xl:grid-cols-[7fr_3fr]">
          <div className="space-y-4"><Skeleton className="h-[420px] w-full" /><Skeleton className="h-[300px] w-full" /></div>
          <div className="space-y-4"><Skeleton className="h-[320px] w-full" /><Skeleton className="h-[200px] w-full" /></div>
        </div>
      ) : (
        <div className="grid items-stretch gap-4 xl:grid-cols-[7fr_3fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <Caixa titulo="Pendências fiscais" subtitulo={`Situação dos clientes por processo, competência ${siglaCompetencia(competencia)}.`}>
              <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                <div className="space-y-3">
                  <div>
                    <h3 className="text-ui-strong text-ink">Clientes</h3>
                    <p className="text-meta text-muted-ink">Cada cliente conta uma vez, pelo pior estado entre os processos ao lado. Clique numa cor para ver quem está nela.</p>
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
            <MensagensEcacBox r={mensagens} ultimas={ultimas} carregandoUltimas={carregandoUltimas} className="flex-1" />
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <NotificacoesFiscais />
            <AusenciasBox simples={ausSimples} dctfwebMit={ausDctf} />
            <RelatoriosFiscaisBox contagem={sitfis} />
            <DeclaracoesBox barras={declaracoes} competencia={rotuloCompetencia(competencia)} className="flex-1" />
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
                <Table className="mt-6">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Regime</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...listaAberta].sort((a, b) => a.l.nome.localeCompare(b.l.nome, 'pt-BR')).map(({ l, selos, cliente }) => {
                      const conta = (Object.keys(selos) as ProcessoPainel[]).filter((k) => !FORA_DA_SITUACAO_DO_CLIENTE.includes(k)).map((k) => selos[k]);
                      return (
                        <TableRow key={l.contact_id}>
                          <TableCell>
                            <p className="text-ui-strong text-ink">{l.nome}</p>
                            <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(l.documento)}</p>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-ui text-muted-ink">{l.regimeRotulo}</TableCell>
                          <TableCell><SeloMonitor selo={cliente} outros={outrosMotivos(conta, cliente)} /></TableCell>
                          <TableCell className="text-ui text-muted-ink">{l.responsavel?.nome ?? 'Sem responsável'}</TableCell>
                          <TableCell className="text-right">
                            <Link to={`/crm/cliente/${l.contact_id}`} className="text-ui-strong text-action hover:underline">Ver</Link>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
