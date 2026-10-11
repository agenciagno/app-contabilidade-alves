import { useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { CalendarPlus, Loader2, Mail, RefreshCw } from 'lucide-react';

import { PageHeader, SearchField } from '@/components/ds';
import { AcoesEmLoteDialog, BotaoAcoesEmLote } from '@/components/monitor/AcoesEmLote';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CompetenciaNav } from '@/components/serpro/CompetenciaNav';
import { Preco, brl } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { useConsultaDctfwebMit } from '@/components/serpro/dctfwebUi';
import { FichaPresumidoRealSheet } from '@/components/serpro/FichaPresumidoRealSheet';
import { mesesFaltantes, useDctfwebAno } from '@/hooks/useSerproFichaPresumido';
import { useCadastroMonitor } from '@/hooks/useSituacaoCarteira';
import { FaixaEstados, PaginacaoLista, RodapeLista, SeloMini, SeloMonitor, UltimaBusca, useEstadoUrl, usePaginacao } from '@/components/monitor/MonitorUi';
import { AcaoLoteDialog, BaixarLoteDialog, BarraSelecao, EnviarGuiasDialog, GerarLoteDialog, type ItemEnvio, type ItemLote } from '@/components/monitor/GuiasLote';
import { useGerarGuiaDctfweb, useGuiasDctfweb, useGuiasEnviadas, useMarcacoesGuia, useMarcarGuia } from '@/hooks/useGuiasCliente';
import { hojeBR } from '@/lib/prazosFederais';
import { useBuscaInicial } from '@/hooks/useBuscaInicial';
import { competenciaPadrao, mesDeData, siglaCompetencia } from '@/hooks/useSerproPagamentos';
import { apuracaoVigente, estadoDctfweb, estadoMit, useConsultarDctfwebMit, useMatrizDctfwebMit, type LinhaDctfwebMit } from '@/hooks/useSerproDctfweb';
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
  const [estado, setEstado] = useEstadoUrl();
  const buscaInicial = useBuscaInicial();
  const [busca, setBusca] = useState(buscaInicial);
  const [soNovos, setSoNovos] = useState(false);
  // Rodada 5: guia da DCTFWeb em lote pela tela e envio com conferência.
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [loteAberto, setLoteAberto] = useState(false);
  const [envioAberto, setEnvioAberto] = useState(false);
  const { data: guias } = useGuiasDctfweb(competencia);
  const { data: marcacoes } = useMarcacoesGuia();
  const { data: enviadas } = useGuiasEnviadas('dctfweb', competencia);
  const marcar = useMarcarGuia();
  const gerarGuia = useGerarGuiaDctfweb();
  const hoje = hojeBR();
  const consultarDm = useConsultarDctfwebMit();
  const [andamentoLote, setAndamentoLote] = useState(false);
  const [consultaLote, setConsultaLote] = useState(false);
  const [baixarAberto, setBaixarAberto] = useState(false);
  // Ficha mês a mês (10/10/2026) e "Completar o ano" em lote.
  const [aberto, setAberto] = useState<string | null>(null);
  const [completarLote, setCompletarLote] = useState(false);
  const [acoesLote, setAcoesLote] = useState(false);
  const { responsaveis, aberturas } = useCadastroMonitor();
  const { data: consultadosAno } = useDctfwebAno(Number(competencia.slice(0, 4)));
  const mesAtual = mesDeData(new Date());
  const faltantesDe = (id: string) => mesesFaltantes(consultadosAno?.get(id), Number(competencia.slice(0, 4)), competencia, mesAtual, aberturas.get(id) ?? null);

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

  const pag = usePaginacao(filtradas, `${busca}|${estado ?? ''}|${soNovos}|${competencia}`);
  const topoTabela = useRef<HTMLDivElement>(null);
  const irParaPagina = (n: number) => {
    pag.setPagina(n);
    requestAnimationFrame(() => topoTabela.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const idsDaPagina = pag.recorte.map((l) => l.contact_id);

  const recebeGuia = (id: string) => !!marcacoes?.get(id)?.dctfweb;
  const quemRecebe = matrizes.filter((l) => recebeGuia(l.contact_id));
  // O servidor só reaproveita guia emitida HOJE, sem data de pagamento: é o que não cobra de novo.
  const guiaDeHoje = (id: string) => { const g = guias?.get(id); return !!g && !g.data_pagamento && g.emitido_em.slice(0, 10) >= hoje; };
  const itensLote: ItemLote[] = matrizes.filter((l) => marcados.has(l.contact_id)).map((l) => ({
    contactId: l.contact_id, nome: l.nome, guardada: guiaDeHoje(l.contact_id),
    aviso: estadoDctfweb(l) === 'sem_declaracao' ? 'Sem DCTFWeb transmitida no mês: não há guia a gerar.'
      : estadoDctfweb(l) === 'nao_consultado' ? 'DCTFWeb do mês não consultada: a Receita usa a declaração mais recente, se houver.' : null,
  }));
  const itensEnvio: ItemEnvio[] = quemRecebe.flatMap((l) => {
    const g = guias?.get(l.contact_id);
    if (!g) return [];
    return [{
      contactId: l.contact_id, nome: l.nome, email: marcacoes?.get(l.contact_id)?.email ?? null,
      documento: { tipo: 'dctfweb_guia', id: g.id },
      rotulo: `Guia da DCTFWeb ${siglaCompetencia(competencia)} · gerada em ${format(new Date(g.emitido_em), 'dd/MM')}${g.data_pagamento ? ` · para pagar em ${dataBR(g.data_pagamento)}` : ''}`,
      enviadoEm: enviadas?.get(g.id) ?? null,
    }];
  });
  const aEnviar = itensEnvio.filter((i) => i.email && !i.enviadoEm).length;
  const alternarMarcado = (id: string) => setMarcados((st) => { const n = new Set(st); if (n.has(id)) n.delete(id); else n.add(id); return n; });
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
      <PageHeader kicker="~/dashboard fiscal · dctfweb e mit" title="DCTFWeb | MIT." />

      <div className="space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <CompetenciaNav competencia={competencia} onChange={(v) => { setCompetencia(v); setMarcados(new Set()); }} limite={mesDeData(new Date())} />
          <div className="flex flex-wrap items-center gap-2">
            <BotaoAcoesEmLote onClick={() => setAcoesLote(true)} disabled={matrizes.length === 0} />
            <DicaBotao texto="Lista as guias já geradas dos clientes que recebem guia pela CA, para conferir e mandar por e-mail. Nada sai sem você confirmar.">
              <Button variant="outline" size="sm" className="h-10" onClick={() => setEnvioAberto(true)}>
                <Mail className="mr-1.5 h-4 w-4" />Conferir e enviar{aEnviar ? ` (${aEnviar})` : ''}
              </Button>
            </DicaBotao>
            <ExportarMenu montar={tabelaExport} disabled={filtradas.length === 0} escolherColunas />
          </div>
        </div>

        <BarraSelecao quantos={marcados.size} onLimpar={() => setMarcados(new Set())}>
          {filtradas.some((l) => !marcados.has(l.contact_id)) && filtradas.length > pag.recorte.length && (
            <DicaBotao texto="Marca todos os clientes da lista com os filtros atuais, inclusive os das outras páginas.">
              <Button size="sm" variant="outline" onClick={() => setMarcados(new Set([...marcados, ...filtradas.map((l) => l.contact_id)]))}>Marcar os {filtradas.length} da lista</Button>
            </DicaBotao>
          )}
          <DicaBotao custo="Emitir" texto="Gera a guia (DARF) da DCTFWeb de cada cliente marcado. Pede confirmação antes.">
            <Button size="sm" onClick={() => setLoteAberto(true)}>Gerar guia ({marcados.size})</Button>
          </DicaBotao>
          <DicaBotao custo="Consultar" vezes={2} texto={`Consulta na Receita o recibo da DCTFWeb de ${siglaCompetencia(competencia)} e a MIT do ano de cada cliente marcado. Quem já foi consultado hoje fica de fora.`}>
            <Button size="sm" variant="outline" onClick={() => setConsultaLote(true)}>Consultar ({marcados.size})</Button>
          </DicaBotao>
          <DicaBotao custo="Emitir" texto="Gera a guia da declaração da DCTFWeb ainda EM ANDAMENTO (antes de transmitir) de cada cliente marcado.">
            <Button size="sm" variant="outline" onClick={() => setAndamentoLote(true)}>Guia em andamento</Button>
          </DicaBotao>
          <DicaBotao custo="Consultar" texto={`Consulta o recibo da DCTFWeb dos meses de ${competencia.slice(0, 4)} que ainda não foram consultados de cada cliente marcado (uma consulta por mês). Mostra o total antes de começar.`}>
            <Button size="sm" variant="outline" onClick={() => setCompletarLote(true)}><CalendarPlus className="mr-1.5 h-4 w-4" />Completar o ano</Button>
          </DicaBotao>
          <DicaBotao texto="Baixa num ZIP os recibos e as guias da DCTFWeb já guardados. Não consulta a Receita.">
            <Button size="sm" variant="outline" onClick={() => setBaixarAberto(true)}>Baixar</Button>
          </DicaBotao>
          <Button size="sm" variant="outline" disabled={marcar.isPending}
            onClick={() => marcar.mutate({ contactIds: [...marcados], processo: 'dctfweb', valor: true })}>Marcar "recebe guia da CA"</Button>
          <Button size="sm" variant="ghost" disabled={marcar.isPending}
            onClick={() => marcar.mutate({ contactIds: [...marcados], processo: 'dctfweb', valor: false })}>Desmarcar</Button>
        </BarraSelecao>

        {isLoading ? <Skeleton className="h-[88px] w-full" /> : <FaixaEstados contagem={contagem} ativo={estado} onChange={setEstado} />}

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchField placeholder="Buscar por razão social ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px] flex-1" />
          <DicaBotao texto="Todo dia às 07:40 a Receita informa, de graça, quem teve movimento na DCTFWeb (chegada de eSocial ou Reinf, ou transmissão). Eles ficam marcados até você consultar. No dia 30, a partir das 20:00, o sistema consulta sozinho só os marcados.">
            <Button variant={soNovos ? 'default' : 'outline'} size="sm" className="h-10" aria-pressed={soNovos} onClick={() => setSoNovos((v) => !v)}>
              Só movimento novo ({novos})
            </Button>
          </DicaBotao>
        </div>

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
                      <Checkbox aria-label="Marcar todos desta página" checked={idsDaPagina.length > 0 && idsDaPagina.every((id) => marcados.has(id))}
                        onCheckedChange={(v) => setMarcados((m) => { const n = new Set(m); idsDaPagina.forEach((id) => (v ? n.add(id) : n.delete(id))); return n; })} />
                      Cliente / Razão Social
                    </div>
                  </TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>DCTFWeb</TableHead>
                  <TableHead>MIT</TableHead>
                  <TableHead>Última busca</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pag.recorte.map((l) => {
                  const a = apuracaoVigente(l);
                  const consultando = emAndamento === l.contact_id;
                  const outros = [l.novo ? 'Movimento novo' : null, l.semProcuracao ? 'Sem procuração' : null].filter((x): x is string => !!x);
                  return (
                    <TableRow key={l.contact_id} className="cursor-pointer" onClick={() => setAberto(l.contact_id)}>
                      <TableCell className="min-w-[240px] max-w-[360px]">
                        <div className="flex items-start gap-3">
                          <span className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                            <Checkbox aria-label={`Marcar ${l.nome}`} checked={marcados.has(l.contact_id)} onCheckedChange={() => alternarMarcado(l.contact_id)} />
                          </span>
                          <div className="min-w-0">
                            <p className="text-ui text-ink">{l.nome}</p>
                            <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(l.documento)}</p>
                            <p className="text-meta text-muted-ink-2">{REGIMES[l.regime ?? ''] ?? l.regime ?? 'Sem regime'}{recebeGuia(l.contact_id) ? ' · recebe guia da CA' : ''}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[170px]"><SeloMonitor selo={seloDe(l)} outros={outros} /></TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          {estadoDctfweb(l) === 'sem_declaracao' ? (
                            <DicaBotao texto="Sem DCTFWeb no mês não quer dizer atraso: ela só existe para quem teve movimento no eSocial ou na EFD-Reinf. Confirme o movimento antes de cobrar.">
                              <SeloMini selo={seloDctfwebColuna('sem_declaracao')} />
                            </DicaBotao>
                          ) : <SeloMini selo={seloDctfwebColuna(estadoDctfweb(l))} />}
                          {l.novo && l.movimentoEm && <p className="text-meta text-muted-ink-2">Movimento em {dataBR(l.movimentoEm)}</p>}
                          {guias?.get(l.contact_id) && <p className="text-meta text-muted-ink-2">Guia gerada em {format(new Date(guias.get(l.contact_id)!.emitido_em), 'dd/MM')}</p>}
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
                      <TableCell><UltimaBusca iso={ultimaConsulta(l)} /></TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <DicaBotao custo="Consultar" vezes={2}
                            texto={`Consulta na Receita o recibo da DCTFWeb de ${siglaCompetencia(competencia)} e as apurações da MIT do ano, guardando o recibo. Recibo, guia, declaração e pagamentos ficam na ficha do cliente (clique na linha).`}>
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

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <RodapeLista mostrando={filtradas.length} total={matrizes.length} unidade="clientes do Lucro Presumido e do Lucro Real" filiais={linhas.length - matrizes.length} faixa={pag.faixa} />
          <PaginacaoLista pagina={pag.pagina} totalPaginas={pag.totalPaginas} porPagina={pag.porPagina} total={filtradas.length}
            onPagina={irParaPagina} onPorPagina={pag.setPorPagina} />
        </div>
      </div>
      {dialog}

      <GerarLoteDialog
        aberto={loteAberto}
        onClose={() => setLoteAberto(false)}
        titulo={`Gerar guia da DCTFWeb de ${siglaCompetencia(competencia)}`}
        descricao="Uma guia (DARF) por cliente marcado, da declaração mais recente da competência, um de cada vez. Cada emissão fica registrada na Receita."
        itens={itensLote}
        executar={async (item, dataPagamento) => {
          const r = await gerarGuia.mutateAsync({ contactId: item.contactId, competencia, dataPagamento });
          return { ok: r.ok, jaGerado: r.jaGerado, error: r.error };
        }}
      />
      <AcaoLoteDialog
        aberto={consultaLote}
        onClose={() => setConsultaLote(false)}
        titulo={`Consultar DCTFWeb e MIT de ${siglaCompetencia(competencia)}`}
        descricao="Duas consultas por cliente marcado (recibo da DCTFWeb do mês e MIT do ano), um de cada vez."
        itens={matrizes.filter((l) => marcados.has(l.contact_id)).map((l) => ({
          contactId: l.contact_id, nome: l.nome, pular: (ultimaConsulta(l) ?? '').slice(0, 10) === hoje ? 'Consultado hoje' : null,
        }))}
        tipo="Consultar"
        vezes={2}
        rotuloAcao="Consultar"
        rotuloFeito="Consultado"
        executar={async (item) => {
          const r = await consultarDm.mutateAsync({ contactId: item.contactId, competencia });
          return { ok: r.ok, recente: r.recente, error: r.semProcuracao ? 'Sem procuração para a DCTFWeb' : r.error };
        }}
      />
      <BaixarLoteDialog
        aberto={baixarAberto}
        onClose={() => setBaixarAberto(false)}
        contactIds={[...marcados]}
        competencia={competencia}
        referencia={`competência ${siglaCompetencia(competencia)}`}
        opcoes={[{ tipo: 'dctfweb_recibo', rotulo: 'Recibos da DCTFWeb' }, { tipo: 'dctfweb_declaracao', rotulo: 'Declarações completas da DCTFWeb' }, { tipo: 'dctfweb_guia', rotulo: 'Guias da DCTFWeb' }, { tipo: 'comprovante', rotulo: 'Comprovantes de pagamento' }]}
      />
      <GerarLoteDialog
        aberto={andamentoLote}
        onClose={() => setAndamentoLote(false)}
        titulo={`Guia da DCTFWeb em andamento de ${siglaCompetencia(competencia)}`}
        descricao="Guia da declaração que ainda não foi transmitida (em andamento), uma por cliente marcado, um de cada vez."
        itens={matrizes.filter((l) => marcados.has(l.contact_id)).map((l) => ({
          contactId: l.contact_id, nome: l.nome, aviso: estadoDctfweb(l) === 'transmitida' ? 'A declaração do mês já foi transmitida: use a guia comum.' : null,
        }))}
        executar={async (item, dataPagamento) => {
          const r = await gerarGuia.mutateAsync({ contactId: item.contactId, competencia, dataPagamento, andamento: true });
          return { ok: r.ok, jaGerado: r.jaGerado, error: r.semProcuracao ? 'Sem procuração para a DCTFWeb' : r.error };
        }}
      />
      <EnviarGuiasDialog
        aberto={envioAberto}
        onClose={() => setEnvioAberto(false)}
        titulo={`Conferir e enviar guias da DCTFWeb de ${siglaCompetencia(competencia)}`}
        processo="dctfweb"
        competencia={competencia}
        itens={itensEnvio}
        assuntoPadrao={`Guia da DCTFWeb ${siglaCompetencia(competencia)} · {cliente}`}
        mensagemPadrao={`Olá! Segue a guia (DARF) da DCTFWeb de ${siglaCompetencia(competencia)} da {cliente}. Qualquer dúvida, é só responder este e-mail.\n\nContabilidade Alves`}
      />
      <AcoesEmLoteDialog
        aberto={acoesLote}
        onClose={() => setAcoesLote(false)}
        clientes={matrizes.map((l) => ({ id: l.contact_id, nome: l.nome, documento: l.documento, selo: seloDe(l) }))}
        extras={[
          { chave: 'recebe', rotulo: 'Recebe a guia pela CA', dica: 'Marcação do cadastro: a CA gera e envia a guia da DCTFWeb.', ids: quemRecebe.map((l) => l.contact_id) },
          { chave: 'novo', rotulo: 'Movimento novo', dica: 'A Receita avisou de eSocial, Reinf ou transmissão desde a última consulta.', ids: matrizes.filter((l) => l.novo).map((l) => l.contact_id) },
        ]}
        acoes={[
          { chave: 'consultar', rotulo: `Consultar ${siglaCompetencia(competencia)}`, custo: 'Consultar', vezes: 2, padrao: ['novo', 'nao_verificado'],
            dica: 'Recibo da DCTFWeb do mês e MIT do ano de cada cliente. Quem já foi consultado hoje fica de fora.' },
          { chave: 'completar', rotulo: `Completar ${competencia.slice(0, 4)}`, custo: 'Consultar', padrao: ['pendencia', 'atencao', 'nao_verificado', 'em_dia'],
            fora: (id) => (faltantesDe(id).length === 0 ? 'Ano já completo' : null),
            dica: 'Consulta os meses do ano que ainda não foram consultados (uma consulta por mês). Mostra o total antes.' },
          { chave: 'gerar', rotulo: 'Gerar guia', custo: 'Emitir', padrao: ['recebe'],
            fora: (id) => { const l = matrizes.find((x) => x.contact_id === id); return l && estadoDctfweb(l) === 'sem_declaracao' ? 'Sem DCTFWeb no mês' : null; },
            dica: 'Gera a guia (DARF) da DCTFWeb do mês de cada cliente.' },
          { chave: 'andamento', rotulo: 'Guia em andamento', custo: 'Emitir', padrao: [],
            dica: 'Gera a guia da declaração ainda em andamento (antes de transmitir).' },
          { chave: 'baixar', rotulo: 'Baixar recibos e guias', padrao: ['recebe'],
            dica: 'Baixa num ZIP os recibos e as guias já guardados. Não consulta a Receita.' },
        ]}
        onContinuar={(acao, ids) => {
          setMarcados(new Set(ids));
          if (acao === 'consultar') setConsultaLote(true);
          else if (acao === 'completar') setCompletarLote(true);
          else if (acao === 'gerar') setLoteAberto(true);
          else if (acao === 'andamento') setAndamentoLote(true);
          else setBaixarAberto(true);
        }}
      />
      <AcaoLoteDialog
        aberto={completarLote}
        onClose={() => setCompletarLote(false)}
        titulo={`Completar ${competencia.slice(0, 4)}: DCTFWeb dos meses que faltam`}
        descricao="Para cada cliente marcado, uma consulta por mês ainda não consultado (do começo do ano até o mês escolhido, nunca o mês corrente), um de cada vez. A MIT do ano já vem inteira e não é consultada de novo."
        itens={matrizes.filter((l) => marcados.has(l.contact_id)).map((l) => {
          const n = faltantesDe(l.contact_id).length;
          return { contactId: l.contact_id, nome: l.nome, vezes: n, pular: n === 0 ? 'Ano já completo' : null };
        })}
        tipo="Consultar"
        rotuloAcao="Completar"
        rotuloFeito="Meses completados"
        executar={async (item) => {
          const meses = faltantesDe(item.contactId);
          let feitos = 0;
          for (const m of meses) {
            const r = await consultarDm.mutateAsync({ contactId: item.contactId, competencia: m, soDctfweb: true });
            if (!r.ok) return { ok: false, error: `${siglaCompetencia(m)}: ${r.semProcuracao ? 'sem procuração para a DCTFWeb' : r.error ?? 'a Receita recusou'}${feitos ? ` (${feitos} mês(es) antes deste já foram consultados)` : ''}` };
            feitos += 1;
          }
          return { ok: true, resumo: `${feitos} ${feitos === 1 ? 'mês consultado' : 'meses consultados'}` };
        }}
      />
      {(() => {
        const idx = filtradas.findIndex((l) => l.contact_id === aberto);
        const linhaAberta = idx >= 0 ? filtradas[idx] : linhas.find((l) => l.contact_id === aberto) ?? null;
        if (!linhaAberta) return null;
        const outros = [linhaAberta.novo ? 'Movimento novo' : null, linhaAberta.semProcuracao ? 'Sem procuração' : null].filter((x): x is string => !!x);
        return (
          <FichaPresumidoRealSheet
            key={linhaAberta.contact_id}
            linha={linhaAberta}
            competencia={competencia}
            selo={seloDe(linhaAberta)}
            outros={outros}
            responsavel={responsaveis.get(linhaAberta.contact_id)?.nome ?? null}
            abertura={aberturas.get(linhaAberta.contact_id) ?? null}
            posicao={{ atual: idx >= 0 ? idx + 1 : 1, total: idx >= 0 ? filtradas.length : 1 }}
            onAnterior={idx > 0 ? () => setAberto(filtradas[idx - 1].contact_id) : null}
            onProximo={idx >= 0 && idx < filtradas.length - 1 ? () => setAberto(filtradas[idx + 1].contact_id) : null}
            onClose={() => setAberto(null)}
            consultando={emAndamento === linhaAberta.contact_id}
            onConsultar={() => executar(linhaAberta.contact_id)}
            onGerarGuia={() => { setMarcados(new Set([linhaAberta.contact_id])); setLoteAberto(true); }}
            onGerarGuiaAndamento={() => { setMarcados(new Set([linhaAberta.contact_id])); setAndamentoLote(true); }}
          />
        );
      })()}
    </div>
  );
}
