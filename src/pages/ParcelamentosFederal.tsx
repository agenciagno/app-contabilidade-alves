import { useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Mail, RefreshCw, Wallet } from 'lucide-react';

import { useBuscaInicial } from '@/hooks/useBuscaInicial';
import { PageHeader, SearchField } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { usePagamentosClienteJanela } from '@/components/serpro/PagamentosDoCliente';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { ParcelamentosClienteSheet } from '@/components/serpro/ParcelamentosClienteSheet';
import { useConsultaParcelamentos } from '@/components/serpro/parcelamentosUi';
import { FaixaEstados, PaginacaoLista, RodapeLista, SeloMonitor, UltimaBusca, useEstadoUrl, usePaginacao } from '@/components/monitor/MonitorUi';
import {
  AcaoLoteDialog, BaixarLoteDialog, BarraSelecao, EnviarGuiasDialog, GerarLoteDialog, useSelecao, type ItemEnvio, type ItemLote,
} from '@/components/monitor/GuiasLote';
import { AcoesEmLoteDialog, BotaoAcoesEmLote } from '@/components/monitor/AcoesEmLote';
import {
  ROTULO_MOD, chamadasDaConsulta, competenciaAtual, consultadoEm, estadoParcelamento, modalidadesAtivas, parcelasAtrasadas, parcelasDoMes,
  rotuloParcela, somaValor, useConsultarParcelamentos, useGerarGuiaParcela, useMatrizParcelamentos, type LinhaParcelamentos, type Modalidade,
} from '@/hooks/useSerproParcelamentos';
import { useGuiasEnviadas, useMarcacoesGuia } from '@/hooks/useGuiasCliente';
import { ROTULO_ESTADO, contarEstados, seloParcelamento, type Selo } from '@/lib/monitorEstados';
import { hojeBR } from '@/lib/prazosFederais';
import type { TabelaExport } from '@/lib/exportarTabela';

const formatarCnpj = (d: string) => {
  const n = d.replace(/\D/g, '');
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Selo da linha, o mesmo que o box Parcelamentos do Dashboard Fiscal conta. */
export function seloDaLinha(l: LinhaParcelamentos, atual = competenciaAtual()): Selo | null {
  return seloParcelamento(estadoParcelamento(l, atual), parcelasAtrasadas(l, atual).length, parcelasDoMes(l, atual).length);
}

/**
 * Parcelamentos do Simples Nacional (ordinário, especial, PERT-SN e RELP-SN) e do MEI (PARCMEI, especial, PERT-MEI e RELP-MEI). Ativado em 09/10/2026 (estava pronto desde 30/09, sem rota),
 * no molde do Monitoramento: faixa de estados, selo, lote de consulta e de guias da parcela, envio com conferência e ZIP das guias.
 */
export default function ParcelamentosFederal() {
  const { abrir: abrirPagamentos, janela: janelaPagamentos } = usePagamentosClienteJanela();
  const { data: linhas = [], isLoading } = useMatrizParcelamentos();
  const { executar, emAndamento, dialog } = useConsultaParcelamentos();
  const consultar = useConsultarParcelamentos();
  const gerarGuia = useGerarGuiaParcela();
  const { data: marcacoes } = useMarcacoesGuia();
  const atual = competenciaAtual();
  const compAtual = `${String(atual).slice(0, 4)}-${String(atual).slice(4)}`;
  const { data: enviadas } = useGuiasEnviadas('parcela', compAtual);
  const [estado, setEstado] = useEstadoUrl();
  const buscaInicial = useBuscaInicial();
  const [busca, setBusca] = useState(buscaInicial);
  const [aberto, setAberto] = useState<string | null>(null);
  const sel = useSelecao();
  const [lote, setLote] = useState<'consultar' | 'guias' | null>(null);
  const [envioAberto, setEnvioAberto] = useState(false);
  const [baixarAberto, setBaixarAberto] = useState(false);
  const [acoesLote, setAcoesLote] = useState(false);
  const hoje = hojeBR();

  const seloDe = (l: LinhaParcelamentos): Selo | null => (emAndamento === l.contact_id
    ? { estado: 'processando', motivo: 'Consultando…' }
    : seloDaLinha(l, atual));

  const matrizes = useMemo(() => linhas.filter((l) => !l.filial), [linhas]);
  const base = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, '');
    return matrizes.filter((l) => !q || l.nome.toLowerCase().includes(q) || (!!qDigitos && l.documento.replace(/\D/g, '').includes(qDigitos)));
  }, [matrizes, busca]);
  const contagem = contarEstados(base.map(seloDe));
  const filtradas = base.filter((l) => !estado || seloDe(l)?.estado === estado).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const pag = usePaginacao(filtradas, `${busca}|${estado ?? ''}`);
  const topoTabela = useRef<HTMLDivElement>(null);
  const irParaPagina = (n: number) => {
    pag.setPagina(n);
    requestAnimationFrame(() => topoTabela.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const idsDaPagina = pag.recorte.map((l) => l.contact_id);

  const marcadas = matrizes.filter((l) => sel.marcados.has(l.contact_id));
  const comAtivos = matrizes.filter((l) => modalidadesAtivas(l).length > 0);
  // Guias: uma por parcela em aberto (atrasadas e a do mês). Guia da mesma parcela nas últimas 24 h é reaproveitada pelo servidor.
  const parcelasLote = marcadas.flatMap((l) => [...parcelasAtrasadas(l, atual), ...parcelasDoMes(l, atual)].map((p) => ({ l, p })));
  const itensGuias: ItemLote[] = parcelasLote.map(({ l, p }) => {
    const g = l.guias.find((x) => x.modalidade === p.modalidade && x.parcela === p.parcela);
    return {
      contactId: `${l.contact_id}|${p.modalidade}|${p.parcela}`,
      nome: `${l.nome} · ${ROTULO_MOD[p.modalidade]} ${rotuloParcela(p.parcela)}${p.valor != null ? ` · ${moeda(p.valor)}` : ''}`,
      guardada: !!g && Date.now() - Date.parse(g.gerado_em) < 24 * 3600_000,
    };
  });
  const itensEnvio: ItemEnvio[] = matrizes.filter((l) => marcacoes?.get(l.contact_id)?.das).flatMap((l) => l.guias
    .filter((g) => g.gerado_em.slice(0, 7) === hoje.slice(0, 7))
    .map((g) => ({
      contactId: l.contact_id, chave: `${l.contact_id}|${g.id}`, nome: l.nome, email: marcacoes?.get(l.contact_id)?.email ?? null,
      documento: { tipo: 'parcela_guia', id: g.id },
      rotulo: `Guia da parcela ${rotuloParcela(g.parcela)} · ${ROTULO_MOD[g.modalidade]} · gerada em ${format(new Date(g.gerado_em), 'dd/MM')}`,
      enviadoEm: enviadas?.get(g.id) ?? null,
    })));
  const aEnviar = itensEnvio.filter((i) => i.email && !i.enviadoEm).length;

  const tabelaExport = (): TabelaExport => ({
    arquivo: 'parcelamentos',
    titulo: 'Parcelamentos do Simples Nacional dos clientes ativos',
    colunas: ['Razão social', 'CNPJ', 'Situação', 'Estado', 'Modalidades ativas', 'Parcelas em aberto', 'Valor em aberto', 'Parcelas atrasadas', 'Valor atrasado', 'Parcela do mês', 'Consultado em'],
    linhas: filtradas.map((l) => {
      const atr = parcelasAtrasadas(l, atual);
      const s = seloDe(l);
      const em = consultadoEm(l);
      return [
        l.nome, formatarCnpj(l.documento), s?.motivo ?? '', s ? ROTULO_ESTADO[s.estado] : '', modalidadesAtivas(l).map((m) => ROTULO_MOD[m]).join(', '),
        String(l.parcelas.length), l.parcelas.length ? moeda(somaValor(l.parcelas)) : '', String(atr.length), atr.length ? moeda(somaValor(atr)) : '',
        parcelasDoMes(l, atual).length ? moeda(somaValor(parcelasDoMes(l, atual))) : '', em ? format(new Date(em), 'dd/MM/yyyy HH:mm') : '',
      ];
    }),
  });

  const linhaAberta: LinhaParcelamentos | null = linhas.find((l) => l.contact_id === aberto) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader kicker="~/dashboard fiscal · parcelamentos" title="Parcelamentos." />

      <div className="space-y-5">
        {isLoading ? <Skeleton className="h-[88px] w-full" /> : <FaixaEstados contagem={contagem} ativo={estado} onChange={setEstado} />}

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchField placeholder="Buscar por razão social ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px] flex-1" />
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <BotaoAcoesEmLote onClick={() => setAcoesLote(true)} disabled={matrizes.length === 0} />
            <DicaBotao texto="Lista as guias de parcela geradas neste mês dos clientes que recebem DAS pela CA, para conferir e mandar por e-mail.">
              <Button variant="outline" size="sm" className="h-10" onClick={() => setEnvioAberto(true)}>
                <Mail className="mr-1.5 h-4 w-4" />Conferir e enviar{aEnviar ? ` (${aEnviar})` : ''}
              </Button>
            </DicaBotao>
            <ExportarMenu montar={tabelaExport} disabled={filtradas.length === 0} escolherColunas />
          </div>
        </div>

        <BarraSelecao quantos={sel.marcados.size} onLimpar={sel.limpar}>
          {filtradas.some((l) => !sel.marcados.has(l.contact_id)) && filtradas.length > pag.recorte.length && (
            <DicaBotao texto="Marca todos os clientes da lista com os filtros atuais, inclusive os das outras páginas.">
              <Button size="sm" variant="outline" onClick={() => sel.somar(filtradas.map((l) => l.contact_id))}>Marcar os {filtradas.length} da lista</Button>
            </DicaBotao>
          )}
          <DicaBotao custo="Consultar" texto="Consulta na Receita os parcelamentos de cada cliente marcado (pedidos e parcelas em aberto). Quem já foi consultado hoje fica de fora.">
            <Button size="sm" onClick={() => setLote('consultar')}>Consultar ({sel.marcados.size})</Button>
          </DicaBotao>
          <DicaBotao custo="Emitir" texto="Gera a guia de cada parcela em aberto (atrasadas e a do mês) dos clientes marcados.">
            <Button size="sm" variant="outline" disabled={!itensGuias.length} onClick={() => setLote('guias')}>Gerar guias ({itensGuias.length})</Button>
          </DicaBotao>
          <DicaBotao texto="Baixa num ZIP as guias de parcela já guardadas. Não consulta a Receita.">
            <Button size="sm" variant="outline" onClick={() => setBaixarAberto(true)}>Baixar</Button>
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
                  <TableHead>Parcelamentos ativos</TableHead>
                  <TableHead>Atrasadas</TableHead>
                  <TableHead>Do mês</TableHead>
                  <TableHead>Última busca</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pag.recorte.map((l) => {
                  const atr = parcelasAtrasadas(l, atual);
                  const mes = parcelasDoMes(l, atual);
                  const consultando = emAndamento === l.contact_id;
                  const chamadas = chamadasDaConsulta(l);
                  const ativas = modalidadesAtivas(l);
                  const temDados = l.consultas.length > 0;
                  const guiaMes = mes.some((p) => l.guias.some((g) => g.modalidade === p.modalidade && g.parcela === p.parcela));
                  const outros = [
                    l.consultas.some((c) => c.sem_procuracao) ? 'Sem procuração em alguma modalidade' : null,
                    l.consultas.some((c) => c.erro) ? 'Falha em alguma modalidade' : null,
                  ].filter((x): x is string => !!x);
                  return (
                    <TableRow key={l.contact_id} className={temDados ? 'cursor-pointer' : undefined} onClick={() => temDados && setAberto(l.contact_id)}>
                      <TableCell className="min-w-[240px] max-w-[360px]">
                        <div className="flex items-start gap-3">
                          <span className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                            <Checkbox aria-label={`Marcar ${l.nome}`} checked={sel.marcados.has(l.contact_id)} onCheckedChange={() => sel.alternar(l.contact_id)} />
                          </span>
                          <div className="min-w-0">
                            <p className="text-ui text-ink">{l.nome}</p>
                            <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(l.documento)}</p>
                            <p className="text-meta text-muted-ink-2">{l.regime === 'mei' ? 'MEI' : 'Simples Nacional'}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[170px]"><SeloMonitor selo={seloDe(l)} outros={outros} /></TableCell>
                      <TableCell className="text-meta text-muted-ink">
                        {ativas.length ? ativas.map((m) => ROTULO_MOD[m]).join(', ') : '—'}
                        {l.parcelas.length > 0 && <p className="text-meta text-muted-ink-2">{l.parcelas.length} em aberto · {moeda(somaValor(l.parcelas))}</p>}
                      </TableCell>
                      <TableCell className={`whitespace-nowrap text-ui ${atr.length ? 'text-danger' : 'text-muted-ink-2'}`}>{atr.length ? `${atr.length} · ${moeda(somaValor(atr))}` : '—'}</TableCell>
                      <TableCell className="whitespace-nowrap text-ui">
                        {mes.length ? moeda(somaValor(mes)) : <span className="text-muted-ink-2">—</span>}
                        {guiaMes && <p className="text-meta text-muted-ink-2">Guia gerada</p>}
                      </TableCell>
                      <TableCell><UltimaBusca iso={consultadoEm(l)} /></TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <DicaBotao texto="Abre os pagamentos deste cliente na Receita (DARF, DAS, DAE e DJE) com a composição de cada guia e o comprovante. Abrir é grátis: só lê o que já está salvo.">
                            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Pagamentos do cliente" onClick={() => abrirPagamentos(l.contact_id, l.nome, formatarCnpj(l.documento))}>
                              <Wallet className="h-4 w-4" />
                            </Button>
                          </DicaBotao>
                          <DicaBotao custo="Consultar" vezes={chamadas}
                            texto={temDados ? 'Consulta na Receita os pedidos de parcelamento do ordinário e das modalidades que o cliente já teve, e as parcelas em aberto dos ativos.'
                              : 'Primeira consulta: olha as quatro modalidades (ordinário, especial, PERT-SN e RELP-SN) e, onde houver parcelamento ativo, as parcelas em aberto.'}>
                            <Button size="sm" variant="outline" disabled={consultando} onClick={() => executar(l.contact_id, chamadas)}>
                              {consultando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                              Consultar<Preco tipo="Consultar" vezes={chamadas} />
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
          <RodapeLista mostrando={filtradas.length} total={matrizes.length} unidade="clientes do Simples Nacional e MEI" filiais={linhas.length - matrizes.length} faixa={pag.faixa} />
          <PaginacaoLista pagina={pag.pagina} totalPaginas={pag.totalPaginas} porPagina={pag.porPagina} total={filtradas.length}
            onPagina={irParaPagina} onPorPagina={pag.setPorPagina} />
        </div>
      </div>

      <ParcelamentosClienteSheet linha={linhaAberta} onClose={() => setAberto(null)} />
      {dialog}

      <AcoesEmLoteDialog
        aberto={acoesLote}
        onClose={() => setAcoesLote(false)}
        clientes={matrizes.map((l) => ({ id: l.contact_id, nome: l.nome, documento: l.documento, selo: seloDe(l) }))}
        extras={[{ chave: 'ativos', rotulo: 'Com parcelamento ativo', dica: 'Clientes com ao menos um parcelamento em andamento.', ids: comAtivos.map((l) => l.contact_id) }]}
        acoes={[
          { chave: 'consultar', rotulo: 'Consultar parcelamentos', custo: 'Consultar', padrao: ['pendencia', 'atencao', 'nao_verificado'],
            dica: 'Traz os pedidos e as parcelas em aberto de cada cliente. Quem já foi consultado hoje fica de fora.' },
          { chave: 'guias', rotulo: 'Gerar guias das parcelas', custo: 'Emitir', padrao: ['ativos'],
            fora: (id) => { const l = matrizes.find((x) => x.contact_id === id); return l && parcelasAtrasadas(l, atual).length + parcelasDoMes(l, atual).length > 0 ? null : 'Sem parcela em aberto'; },
            dica: 'Uma guia por parcela em aberto (atrasadas e a do mês).' },
          { chave: 'baixar', rotulo: 'Baixar guias', padrao: ['ativos'],
            dica: 'Baixa num ZIP as guias de parcela já guardadas. Não consulta a Receita.' },
        ]}
        onContinuar={(acao, ids) => { sel.definir(ids); if (acao === 'baixar') setBaixarAberto(true); else setLote(acao as 'consultar' | 'guias'); }}
      />
      <AcaoLoteDialog
        aberto={lote === 'consultar'}
        onClose={() => setLote(null)}
        titulo="Consultar parcelamentos"
        descricao="Por cliente marcado: os pedidos de parcelamento e as parcelas em aberto dos ativos, um de cada vez. A primeira consulta de um cliente olha as quatro modalidades do regime dele (Simples ou MEI)."
        itens={marcadas.map((l) => ({
          contactId: l.contact_id, nome: l.nome, vezes: chamadasDaConsulta(l),
          pular: (consultadoEm(l) ?? '').slice(0, 10) === hoje ? 'Consultado hoje' : null,
        }))}
        tipo="Consultar"
        rotuloAcao="Consultar"
        rotuloFeito="Consultado"
        executar={async (item) => {
          const r = await consultar.mutateAsync({ contactId: item.contactId });
          return {
            ok: r.ok && !r.foraDoMonitoramento, recente: r.recente, error: r.semProcuracao ? 'Sem procuração para parcelamentos' : r.error,
            resumo: r.ativos ? `${r.ativos} ${r.ativos === 1 ? 'parcelamento ativo' : 'parcelamentos ativos'}` : 'Sem parcelamento ativo',
          };
        }}
      />
      <GerarLoteDialog
        aberto={lote === 'guias'}
        onClose={() => setLote(null)}
        titulo="Gerar guias de parcela"
        descricao="Uma guia por parcela em aberto (atrasadas e a do mês) dos clientes marcados, uma de cada vez. Guia da mesma parcela gerada nas últimas 24 horas não é emitida de novo."
        itens={itensGuias}
        comData={false}
        executar={async (item) => {
          const [contactId, modalidade, parcela] = item.contactId.split('|');
          const r = await gerarGuia.mutateAsync({ contactId, modalidade: modalidade as Modalidade, parcela: Number(parcela) });
          return { ok: r.ok, jaGerado: r.jaGerado, error: r.semProcuracao ? 'Sem procuração para parcelamentos' : r.error };
        }}
      />
      <EnviarGuiasDialog
        aberto={envioAberto}
        onClose={() => setEnvioAberto(false)}
        titulo="Conferir e enviar guias de parcela"
        processo="parcela"
        competencia={compAtual}
        itens={itensEnvio}
        assuntoPadrao="Guia da parcela do parcelamento · {cliente}"
        mensagemPadrao={'Olá! Segue a guia da parcela do parcelamento do Simples Nacional da {cliente}. Qualquer dúvida, é só responder este e-mail.\n\nContabilidade Alves'}
      />
      <BaixarLoteDialog
        aberto={baixarAberto}
        onClose={() => setBaixarAberto(false)}
        contactIds={[...sel.marcados]}
        referencia="todas as guias de parcela guardadas"
        opcoes={[{ tipo: 'parcela_guia', rotulo: 'Guias de parcela' }]}
      />
      {janelaPagamentos}
    </div>
  );
}
