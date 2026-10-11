import { Fragment, useMemo, useState, useRef } from 'react';
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react';

import { useBuscaInicial } from '@/hooks/useBuscaInicial';
import { useFichaFiscal } from '@/components/monitor/FichaFiscal';
import { PageHeader, SearchField } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { FaixaEstados, PaginacaoLista, RodapeLista, SeloMonitor, UltimaBusca, useEstadoUrl, usePaginacao } from '@/components/monitor/MonitorUi';
import { AcaoLoteDialog, BarraSelecao, useSelecao } from '@/components/monitor/GuiasLote';
import { AcoesEmLoteDialog, BotaoAcoesEmLote } from '@/components/monitor/AcoesEmLote';
import { useConsultarEProcesso, useMatrizEProcesso, type LinhaEProcesso } from '@/hooks/useSerproExtras';
import { ROTULO_ESTADO, contarEstados, type Selo } from '@/lib/monitorEstados';
import { hojeBR } from '@/lib/prazosFederais';
import type { TabelaExport } from '@/lib/exportarTabela';

const formatarCnpj = (d: string) => {
  const n = d.replace(/\D/g, '');
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};
const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');

/** Processo em que o cliente é interessado pede acompanhamento (pendência); sem processo é em dia. */
function seloDe(l: LinhaEProcesso): Selo | null {
  if (!l.consulta) return { estado: 'nao_verificado', motivo: 'Não consultado' };
  if (!l.processos.length) return { estado: 'em_dia', motivo: 'Sem processo' };
  return { estado: 'pendencia', motivo: `${l.processos.length} ${l.processos.length === 1 ? 'processo' : 'processos'}` };
}

/**
 * e-Processo (Rodada 5 do Monitoramento, 09/10/2026; decisão de Gabriel: item próprio, separado de "Processos").
 * Processos digitais da Receita em que o cliente é interessado (EPROCESSO.CONSPROCPORINTER271), no molde do Monitoramento.
 */
export default function EProcessoFederal() {
  const { data: linhas = [], isLoading } = useMatrizEProcesso();
  const consultar = useConsultarEProcesso();
  const [estado, setEstado] = useEstadoUrl();
  const buscaInicial = useBuscaInicial();
  const [busca, setBusca] = useState(buscaInicial);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [consultando, setConsultando] = useState<string | null>(null);
  const sel = useSelecao();
  const [loteAberto, setLoteAberto] = useState(false);
  const [acoesLote, setAcoesLote] = useState(false);
  const ficha = useFichaFiscal();
  const hoje = hojeBR();

  const matrizes = useMemo(() => linhas.filter((l) => !l.filial), [linhas]);
  const base = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qd = q.replace(/\D/g, '');
    return matrizes.filter((l) => !q || l.nome.toLowerCase().includes(q) || (!!qd && l.documento.replace(/\D/g, '').includes(qd))
      || l.processos.some((p) => p.numero.includes(qd || '§') || (p.tipo ?? '').toLowerCase().includes(q)));
  }, [matrizes, busca]);
  const seloLinha = (l: LinhaEProcesso): Selo | null => (consultando === l.contact_id ? { estado: 'processando', motivo: 'Consultando…' } : seloDe(l));
  const contagem = contarEstados(base.map(seloLinha));
  const filtradas = base.filter((l) => !estado || seloLinha(l)?.estado === estado).sort((a, b) => b.processos.length - a.processos.length || a.nome.localeCompare(b.nome, 'pt-BR'));

  const pag = usePaginacao(filtradas, `${busca}|${estado ?? ''}`);
  const topoTabela = useRef<HTMLDivElement>(null);
  const irParaPagina = (n: number) => {
    pag.setPagina(n);
    requestAnimationFrame(() => topoTabela.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const idsDaPagina = pag.recorte.map((l) => l.contact_id);

  const executar = async (contactId: string) => {
    setConsultando(contactId);
    try { await consultar.mutateAsync({ contactId }); } finally { setConsultando(null); }
  };

  const tabelaExport = (): TabelaExport => ({
    arquivo: 'e-processo',
    titulo: 'e-Processo — processos em que os clientes são interessados',
    colunas: ['Razão social', 'CNPJ', 'Situação', 'Estado', 'Processo', 'Tipo', 'Subtipo', 'Protocolo', 'Situação do processo', 'Localização', 'Relação do cliente'],
    linhas: filtradas.flatMap((l) => {
      const s = seloDe(l);
      const comum = [l.nome, formatarCnpj(l.documento), s?.motivo ?? '', s ? ROTULO_ESTADO[s.estado] : ''];
      return l.processos.length
        ? l.processos.map((p) => [...comum, p.numero, p.tipo ?? '', p.subtipo ?? '', dataBR(p.data_protocolo), p.situacao ?? '', p.localizacao ?? '', p.relacao ?? ''])
        : [[...comum, '', '', '', '', '', '', '']];
    }),
  });

  return (
    <div className="space-y-6">
      <PageHeader kicker="~/dashboard fiscal · e-processo" title="e-Processo." />

      <div className="space-y-5">
        {isLoading ? <Skeleton className="h-[88px] w-full" /> : <FaixaEstados contagem={contagem} ativo={estado} onChange={setEstado} />}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchField placeholder="Buscar por cliente, CNPJ, número ou tipo do processo..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px] flex-1" />
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
          <DicaBotao custo="Consultar" texto="Consulta na Receita os processos digitais em que cada cliente marcado é interessado. Quem já foi consultado hoje fica de fora.">
            <Button size="sm" onClick={() => setLoteAberto(true)}>Consultar ({sel.marcados.size})</Button>
          </DicaBotao>
        </BarraSelecao>

        <div ref={topoTabela} className="scroll-mt-16 overflow-x-auto rounded-lg border border-line bg-paper">
          {isLoading ? (
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
                  <TableHead>Mais recente</TableHead>
                  <TableHead>Última busca</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pag.recorte.map((l) => {
                  const aberto = !!abertos[l.contact_id];
                  const recente = l.processos[0];
                  return (
                    <Fragment key={l.contact_id}>
                      <TableRow className="cursor-pointer" tabIndex={0} aria-label={`Abrir a ficha fiscal de ${l.nome}`}
                        onClick={() => ficha.abrir(l.contact_id, 'eprocesso')}
                        onKeyDown={(ev) => { if (ev.key === 'Enter' && ev.target === ev.currentTarget) ficha.abrir(l.contact_id, 'eprocesso'); }}>
                        <TableCell className="min-w-[260px] max-w-[380px]">
                          <div className="flex items-start gap-3">
                            <span className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                              <Checkbox aria-label={`Marcar ${l.nome}`} checked={sel.marcados.has(l.contact_id)} onCheckedChange={() => sel.alternar(l.contact_id)} />
                            </span>
                            <span className="w-4 shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
                              {l.processos.length > 0 && (
                                <button type="button" aria-label={aberto ? 'Esconder os processos' : 'Mostrar os processos'} aria-expanded={aberto}
                                  onClick={() => setAbertos((a) => ({ ...a, [l.contact_id]: !aberto }))}>
                                  {aberto ? <ChevronDown className="h-4 w-4 text-muted-ink" /> : <ChevronRight className="h-4 w-4 text-muted-ink" />}
                                </button>
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="text-ui text-ink">{l.nome}</p>
                              <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(l.documento)}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[160px]"><SeloMonitor selo={seloLinha(l)} /></TableCell>
                        <TableCell className="max-w-[300px] text-meta text-muted-ink">
                          {recente ? <>{recente.tipo ?? 'Processo'} · {dataBR(recente.data_protocolo)}{recente.situacao ? ` · ${recente.situacao}` : ''}</> : '—'}
                        </TableCell>
                        <TableCell><UltimaBusca iso={l.consulta?.consultado_em ?? null} /></TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                          <DicaBotao custo="Consultar" texto="Consulta na Receita os processos digitais em que este cliente é interessado.">
                            <Button size="sm" variant="outline" disabled={consultando === l.contact_id} onClick={() => executar(l.contact_id)}>
                              {consultando === l.contact_id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                              Consultar<Preco tipo="Consultar" />
                            </Button>
                          </DicaBotao>
                          </div>
                        </TableCell>
                      </TableRow>
                      {aberto && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={5} className="bg-bg-2 p-4">
                            <div className="overflow-hidden rounded-lg border border-line bg-paper">
                              <Table className="[&_td]:px-3 [&_th]:px-3">
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Processo</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Protocolo</TableHead>
                                    <TableHead>Situação</TableHead>
                                    <TableHead>Localização</TableHead>
                                    <TableHead>Relação do cliente</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {l.processos.map((p) => (
                                    <TableRow key={p.id}>
                                      <TableCell className="whitespace-nowrap font-mono text-ui">{p.numero}</TableCell>
                                      <TableCell className="text-ui">{p.tipo ?? '—'}{p.subtipo && <p className="text-meta text-muted-ink-2">{p.subtipo}</p>}</TableCell>
                                      <TableCell className="whitespace-nowrap text-ui text-muted-ink">{dataBR(p.data_protocolo)}</TableCell>
                                      <TableCell className="text-ui">{p.situacao ?? '—'}</TableCell>
                                      <TableCell className="text-meta text-muted-ink">{p.localizacao ?? '—'}{p.ultimo_encaminhamento && <p className="text-muted-ink-2">Último encaminhamento: {p.ultimo_encaminhamento}</p>}</TableCell>
                                      <TableCell className="text-meta text-muted-ink">{p.relacao ?? '—'}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
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
      </div>

      <AcoesEmLoteDialog
        aberto={acoesLote}
        onClose={() => setAcoesLote(false)}
        clientes={matrizes.map((l) => ({ id: l.contact_id, nome: l.nome, documento: l.documento, selo: seloLinha(l) }))}
        acoes={[{ chave: 'consultar', rotulo: 'Consultar e-Processo', custo: 'Consultar', padrao: ['pendencia', 'atencao', 'nao_verificado'],
          dica: 'Consulta os processos digitais em que cada cliente é interessado. Quem já foi consultado hoje fica de fora.' }]}
        onContinuar={(_acao, ids) => { sel.definir(ids); setLoteAberto(true); }}
      />
      <AcaoLoteDialog
        aberto={loteAberto}
        onClose={() => setLoteAberto(false)}
        titulo="Consultar e-Processo"
        descricao="Uma consulta por cliente marcado: os processos digitais da Receita em que ele é interessado."
        itens={matrizes.filter((l) => sel.marcados.has(l.contact_id)).map((l) => ({
          contactId: l.contact_id, nome: l.nome, pular: l.consulta?.consultado_em?.slice(0, 10) === hoje ? 'Consultado hoje' : null,
        }))}
        tipo="Consultar"
        rotuloAcao="Consultar"
        rotuloFeito="Consultado"
        executar={async (item) => {
          const r = await consultar.mutateAsync({ contactId: item.contactId });
          return { ok: r.ok && !r.foraDoMonitoramento, error: r.semProcuracao ? 'Sem procuração para o e-Processo' : r.error, resumo: r.processos ? `${r.processos} ${r.processos === 1 ? 'processo' : 'processos'}` : 'Sem processo' };
        }}
      />
    </div>
  );
}
