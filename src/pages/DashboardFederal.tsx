import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowRight, ClipboardCheck } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip } from 'recharts';

import { DsAlert, PageHeader } from '@/components/ds';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ResponsavelFiltro } from '@/components/gestao360/ResponsavelFiltro';
import { formatarCnpj } from '@/components/gestao360/ClienteFiltro';
import { SeloMonitor } from '@/components/monitor/MonitorUi';
import { useSituacaoCarteira, useCadastroMonitor } from '@/hooks/useSituacaoCarteira';
import { useFiltroCarteira } from '@/hooks/useFiltroCarteira';
import { diasParaVencer, useCertificates } from '@/hooks/useCertificates';
import { anoDe, useMatrizPgdasd } from '@/hooks/useSerproPgdasd';
import { useConferenciaCadastro } from '@/hooks/useSerproConferenciaCadastro';
import { siglaCompetencia, useMatrizPagamentos } from '@/hooks/useSerproPagamentos';
import { montarLinhasSimples } from '@/lib/simplesNacionalLinhas';
import {
  COR_ESTADO, DICA_ESTADO, ESTADOS, FORA_DA_SITUACAO_DO_CLIENTE, ROTULO_ESTADO,
  contarEstados, outrosMotivos, seloDoCliente, selosDaCarteira,
  type EstadoMonitor, type ProcessoPainel, type Selo,
} from '@/lib/monitorEstados';
import type { LinhaCarteira } from '@/lib/situacaoCarteira';

const SIMPLES = '/dashboard-federal/simples-nacional';

/** Uma barra por fonte. `filtra`: a tela de destino já abre filtrada no estado clicado (`?estado=`). */
const PROCESSOS: { chave: ProcessoPainel; titulo: string; to: string; filtra: boolean; nota?: string }[] = [
  { chave: 'caixa', titulo: 'Mensagens e-CAC', to: '/mensagens', filtra: false },
  { chave: 'intimacoes', titulo: 'Termos de intimação', to: '/dashboard-federal/intimacoes', filtra: false },
  { chave: 'pgdas', titulo: 'PGDAS-D', to: `${SIMPLES}?fonte=declaracao`, filtra: true },
  { chave: 'das', titulo: 'DAS do Simples', to: `${SIMPLES}?fonte=das`, filtra: true },
  { chave: 'defis', titulo: 'DEFIS', to: `${SIMPLES}?aba=defis`, filtra: true },
  { chave: 'limite', titulo: 'Limite do Simples', to: `${SIMPLES}?fonte=limite`, filtra: true, nota: 'Não entra na situação do cliente: sem leitura do faturamento é falta de leitura nossa, não obrigação dele.' },
  { chave: 'dctfweb_mit', titulo: 'DCTFWeb e MIT', to: '/dashboard-federal/dctfweb-mit', filtra: false },
  { chave: 'sitfis', titulo: 'Situação fiscal', to: '/dashboard-federal/situacao-fiscal', filtra: false },
  { chave: 'procuracao', titulo: 'Procurações', to: '/dashboard-federal/procuracoes', filtra: false },
  { chave: 'certificado', titulo: 'Certificados', to: '/cadastros/certificados', filtra: false },
];

const comEstado = (to: string, e: EstadoMonitor) => `${to}${to.includes('?') ? '&' : '?'}estado=${e}`;

interface LinhaPainel { l: LinhaCarteira; selos: Record<ProcessoPainel, Selo | null>; cliente: Selo }

export default function DashboardFederal() {
  const navigate = useNavigate();
  const { linhas, carregando, competencia, hoje, fontesAtualizadas, faturamento } = useSituacaoCarteira();
  const { aberturas, responsaveis, carregando: carregandoCadastro } = useCadastroMonitor();
  const { data: pgdas = [], isLoading: carregandoPgdas } = useMatrizPgdasd(anoDe(competencia));
  const { data: pagamentos = [], isLoading: carregandoPag } = useMatrizPagamentos(competencia);
  const { data: certificados = [], isLoading: carregandoCert } = useCertificates();
  const conferencia = useConferenciaCadastro();
  const { resp, doResponsavel, escolherResponsavel } = useFiltroCarteira(linhas);
  const [lista, setLista] = useState<EstadoMonitor | null>(null);

  // Certificado do próprio cliente (não do sócio): o mais novo entre os ativos ou vencidos.
  const diasCert = useMemo(() => {
    const m = new Map<string, { validade: string; dias: number }>();
    for (const c of certificados) {
      if (c.partner_id || (c.status !== 'ativo' && c.status !== 'vencido')) continue;
      const atual = m.get(c.contact_id);
      if (!atual || c.data_validade > atual.validade) m.set(c.contact_id, { validade: c.data_validade, dias: diasParaVencer(c.data_validade) });
    }
    return m;
  }, [certificados]);

  const painel = useMemo<LinhaPainel[]>(() => {
    // PGDAS-D, DAS e limite saem da mesma linha da tela Simples Nacional: o número da barra é o número da lista.
    const simples = new Map(montarLinhasSimples({ pgdas, pagamentos, faturamento, responsaveis, aberturas, pa: competencia, hoje }).map((x) => [x.contact_id, x]));
    return doResponsavel.map((l) => {
      const ls = simples.get(l.contact_id);
      const selos = selosDaCarteira(l, {
        // Fora da lista do Simples no mês (outro regime, filial, aberta depois): PGDAS-D, DAS e limite não se aplicam.
        ...(ls ? { pgdas: ls.declaracao, das: ls.dasSelo, limite: ls.limite } : { pgdas: null, das: null, limite: null }),
        diasCertificado: diasCert.get(l.contact_id)?.dias ?? null,
      });
      return { l, selos, cliente: seloDoCliente(selos) };
    });
  }, [doResponsavel, pgdas, pagamentos, faturamento, responsaveis, competencia, hoje, aberturas, diasCert]);

  const porCliente = useMemo(() => contarEstados(painel.map((p) => p.cliente)), [painel]);
  const porProcesso = useMemo(
    () => PROCESSOS.map((p) => ({ ...p, contagem: contarEstados(painel.map((x) => x.selos[p.chave])) })),
    [painel],
  );

  const ocupado = carregando || carregandoCadastro || carregandoPgdas || carregandoPag || carregandoCert;
  const fatias = ESTADOS.map((e) => ({ chave: e, nome: ROTULO_ESTADO[e], valor: porCliente[e] })).filter((f) => f.valor > 0);
  const listaAberta = lista ? painel.filter((p) => p.cliente.estado === lista) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/dashboard federal"
        title="Dashboard Federal."
        subtitle={`Situação dos clientes monitorados na Receita Federal, competência ${siglaCompetencia(competencia)}. Mesmas cores em todas as telas: verde em dia, amarelo pendência, vermelho atenção, cinza não verificado. Clique numa barra para abrir a lista já filtrada.`}
        actions={<ResponsavelFiltro linhas={linhas} valor={resp} onChange={escolherResponsavel} />}
      />

      {!conferencia.carregando && conferencia.linhas.length > 0 && (
        <DsAlert
          tone="warn"
          icon={<ClipboardCheck />}
          title={`${conferencia.linhas.length} ${conferencia.linhas.length === 1 ? 'cliente com algo' : 'clientes com algo'} que não bate no cadastro`}
          description="Regime, CNPJ ou situação diferentes da Receita deixam o cliente fora das consultas certas."
          action={<Link to="/dashboard-federal/conferencia-cadastro" className="shrink-0 text-ui-strong text-action hover:underline">Conferir</Link>}
        />
      )}

      {ocupado ? (
        <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
          <Skeleton className="h-[380px] w-full" />
          <Skeleton className="h-[380px] w-full" />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
          <section className="space-y-4 rounded-lg border border-line bg-paper p-5">
            <div>
              <h2 className="text-h4-card text-ink">Clientes</h2>
              <p className="text-meta text-muted-ink">Cada cliente fica com o pior estado entre as fontes que valem para ele.</p>
            </div>
            <div className="relative mx-auto h-[200px] w-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={fatias} dataKey="valor" nameKey="nome" innerRadius={64} outerRadius={92} paddingAngle={2} stroke="none"
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
              {ESTADOS.filter((e) => e !== 'processando').map((e) => (
                <li key={e}>
                  <button type="button" onClick={() => setLista(e)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-bg-2">
                    <span className="h-6 w-1 shrink-0 rounded-pill" style={{ background: COR_ESTADO[e] }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-ui-strong text-ink">{ROTULO_ESTADO[e]}</span>
                      <span className="block text-meta text-muted-ink">{DICA_ESTADO[e]}</span>
                    </span>
                    <span className="text-ui-strong text-ink">{porCliente[e]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-4 rounded-lg border border-line bg-paper p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-h4-card text-ink">Por assunto</h2>
                <p className="text-meta text-muted-ink">Quantos clientes em cada estado. Cada pedaço da barra leva à lista.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                {ESTADOS.filter((e) => e !== 'processando').map((e) => (
                  <span key={e} className="flex items-center gap-1.5 text-meta text-muted-ink">
                    <span className="h-2 w-2 rounded-pill" style={{ background: COR_ESTADO[e] }} aria-hidden />{ROTULO_ESTADO[e]}
                  </span>
                ))}
              </div>
            </div>
            <div className="space-y-2.5">
              {porProcesso.map((p) => (
                <div key={p.chave} className="grid grid-cols-[150px_1fr_48px] items-center gap-3">
                  <Link to={p.to} className="group flex items-center gap-1 truncate text-ui text-ink hover:text-action">
                    <span className="truncate">{p.titulo}</span>
                    {FORA_DA_SITUACAO_DO_CLIENTE.includes(p.chave) && <span className="text-meta text-muted-ink-2">*</span>}
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
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
            <p className="text-meta text-muted-ink-2">* {PROCESSOS.find((p) => p.nota)?.nota}</p>
          </section>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-line bg-paper p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <span className="text-kicker uppercase text-muted-ink-2">Última leitura</span>
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
