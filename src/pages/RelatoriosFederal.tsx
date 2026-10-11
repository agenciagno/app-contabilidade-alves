import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Mail } from 'lucide-react';

import { PageHeader, SearchField } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { AcoesEmLoteDialog, BotaoAcoesEmLote } from '@/components/monitor/AcoesEmLote';
import { useFichaFiscal } from '@/components/monitor/FichaFiscal';
import {
  AcaoLoteDialog, BaixarLoteDialog, BarraSelecao, EnviarGuiasDialog, useSelecao, type ItemEnvio, type ResultadoLote,
} from '@/components/monitor/GuiasLote';
import { FaixaEstados, PaginacaoLista, RodapeLista, SeloMonitor, useEstadoUrl, usePaginacao } from '@/components/monitor/MonitorUi';
import { useBuscaInicial } from '@/hooks/useBuscaInicial';
import { useMarcacoesGuia } from '@/hooks/useGuiasCliente';
import { useRelatorioCompleto } from '@/hooks/useRelatorioCompleto';
import { useGuardarRelatorio, useRelatorioConfig, useUltimosRelatorios } from '@/hooks/useRelatoriosCliente';
import { competenciaPadrao, siglaCompetencia } from '@/hooks/useSerproPagamentos';
import { useSituacaoCarteira } from '@/hooks/useSituacaoCarteira';
import { ROTULO_ESTADO, contarEstados, type Selo } from '@/lib/monitorEstados';
import { pdfParaBase64 } from '@/lib/pdfRelatorios';
import { ROTULO_VEREDITO, vereditoDe, type Veredito } from '@/lib/relatorioCompleto';
import { calcularScore, montarPlanoAcao, type Score } from '@/lib/relatoriosCliente';
import { hojeBR } from '@/lib/prazosFederais';
import type { TabelaExport } from '@/lib/exportarTabela';
import type { LinhaCarteira } from '@/lib/situacaoCarteira';

const formatarCnpj = (d: string) => {
  const n = d.replace(/\D/g, '');
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};
const dataHora = (iso: string | null | undefined) => (iso ? format(new Date(iso), 'dd/MM/yyyy HH:mm') : '');

/** Situação do cliente nesta tela = veredito do relatório (o mesmo que vai na capa do PDF). */
const SELO_VEREDITO: Record<Veredito, Selo> = {
  regular: { estado: 'em_dia', motivo: ROTULO_VEREDITO.regular },
  atencao: { estado: 'pendencia', motivo: 'Pontos de atenção' },
  pendencias: { estado: 'atencao', motivo: ROTULO_VEREDITO.pendencias },
};

interface LinhaRelatorio { l: LinhaCarteira; score: Score; selo: Selo; veredito: Veredito | null }

/**
 * Relatórios (R3 da varredura do Monitoramento, 10/10/2026): o Relatório Completo da Empresa de cada cliente monitorado.
 * Gerar guarda o PDF (sem consultar a Receita, sem custo); enviar manda por e-mail com conferência; baixar junta num ZIP.
 * Clique na linha abre a Ficha Fiscal, onde dá para baixar e enviar um por um.
 */
export default function RelatoriosFederal() {
  const { linhas: carteira, carregando } = useSituacaoCarteira();
  const { data: ultimos, isLoading: carregandoRel } = useUltimosRelatorios();
  const { data: marcacoes } = useMarcacoesGuia();
  const { data: config } = useRelatorioConfig();
  const ficha = useFichaFiscal();
  const [estado, setEstado] = useEstadoUrl();
  const buscaInicial = useBuscaInicial();
  const [busca, setBusca] = useState(buscaInicial);
  const sel = useSelecao();
  const [acoesLote, setAcoesLote] = useState(false);
  const [lote, setLote] = useState<'gerar' | 'enviar' | 'baixar' | null>(null);
  const [gerando, setGerando] = useState<{ id: string; resolve: (r: ResultadoLote) => void } | null>(null);
  const hoje = hojeBR();
  const mes = hoje.slice(0, 7);
  const competencia = competenciaPadrao();

  const linhas = useMemo<LinhaRelatorio[]>(() => carteira.map((l) => {
    const score = calcularScore(l);
    if (score.verificados === 0) return { l, score, selo: { estado: 'nao_verificado', motivo: 'Nada verificado ainda' }, veredito: null };
    const veredito = vereditoDe(montarPlanoAcao(l, score));
    return { l, score, selo: SELO_VEREDITO[veredito], veredito };
  }), [carteira]);

  const base = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qd = q.replace(/\D/g, '');
    return linhas.filter(({ l }) => !q || l.nome.toLowerCase().includes(q) || (!!qd && l.documento.replace(/\D/g, '').includes(qd)));
  }, [linhas, busca]);
  const contagem = contarEstados(base.map((x) => x.selo));
  const filtradas = base.filter((x) => !estado || x.selo.estado === estado).sort((a, b) => a.l.nome.localeCompare(b.l.nome, 'pt-BR'));

  const pag = usePaginacao(filtradas, `${busca}|${estado ?? ''}`);
  const topoTabela = useRef<HTMLDivElement>(null);
  const irParaPagina = (n: number) => {
    pag.setPagina(n);
    requestAnimationFrame(() => topoTabela.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const idsDaPagina = pag.recorte.map((x) => x.l.contact_id);

  const ultimo = (id: string) => ultimos?.get(id) ?? null;
  const enviado = (id: string) => { const u = ultimo(id); return !!u?.enviadoEm && u.enviadoEm >= u.geradoEm; };
  const geradosNoMes = linhas.filter((x) => ultimo(x.l.contact_id)?.geradoEm.slice(0, 7) === mes).length;
  const enviadosNoMes = linhas.filter((x) => (ultimo(x.l.contact_id)?.enviadoEm ?? '').slice(0, 7) === mes).length;
  const nuncaGerados = linhas.filter((x) => !ultimo(x.l.contact_id)).length;
  const marcadas = linhas.filter((x) => sel.marcados.has(x.l.contact_id));

  const itensEnvio: ItemEnvio[] = marcadas.flatMap(({ l }) => {
    const u = ultimo(l.contact_id);
    if (!u) return [];
    return [{
      contactId: l.contact_id, nome: l.nome, email: marcacoes?.get(l.contact_id)?.email ?? null,
      documento: { tipo: 'relatorio_situacao', id: u.id }, rotulo: `Relatório Completo · gerado em ${dataHora(u.geradoEm)}`,
      enviadoEm: enviado(l.contact_id) ? u.enviadoEm : null,
    }];
  });

  const tabelaExport = (): TabelaExport => ({
    arquivo: 'relatorios-clientes',
    titulo: 'Relatório Completo da Empresa — por cliente',
    colunas: ['Razão social', 'CNPJ', 'Regime', 'Situação', 'Estado', 'Score', 'Último relatório', 'Enviado em'],
    linhas: filtradas.map(({ l, score, selo }) => {
      const u = ultimo(l.contact_id);
      return [
        l.nome, formatarCnpj(l.documento), l.regimeRotulo, selo.motivo, ROTULO_ESTADO[selo.estado],
        score.percentual === null ? '' : `${score.percentual}%`, dataHora(u?.geradoEm), enviado(l.contact_id) ? dataHora(u?.enviadoEm) : '',
      ];
    }),
  });

  const ocupado = carregando || carregandoRel;

  return (
    <div className="space-y-6">
      <PageHeader kicker="~/dashboard fiscal · relatórios" title="Relatórios." />

      <div className="space-y-5">
        {ocupado ? <Skeleton className="h-[88px] w-full" /> : <FaixaEstados contagem={contagem} ativo={estado} onChange={setEstado} />}

        <p className="text-meta text-muted-ink">
          Relatório Completo da Empresa (situação, obrigações do ano até {siglaCompetencia(competencia)}, pagamentos, parcelamentos, comunicações e o que fazer).
          {' '}Em {format(new Date(`${mes}-01T12:00:00`), 'MM/yyyy')}: <span className="text-ink">{geradosNoMes} gerados</span> · <span className="text-ink">{enviadosNoMes} enviados</span> · {nuncaGerados} clientes sem nenhum relatório.
          {config && !config.faturamento_validado ? ' Sem a validação do contador (Tech > Rotinas), o PDF sai sem a assinatura dele.' : ''}
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchField placeholder="Buscar por razão social ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px] flex-1" />
          <div className="flex items-center gap-2">
            <BotaoAcoesEmLote onClick={() => setAcoesLote(true)} disabled={linhas.length === 0} />
            <ExportarMenu montar={tabelaExport} disabled={filtradas.length === 0} escolherColunas />
          </div>
        </div>

        <BarraSelecao quantos={sel.marcados.size} onLimpar={sel.limpar}>
          {filtradas.some((x) => !sel.marcados.has(x.l.contact_id)) && filtradas.length > pag.recorte.length && (
            <DicaBotao texto="Marca todos os clientes da lista com os filtros atuais, inclusive os das outras páginas.">
              <Button size="sm" variant="outline" onClick={() => sel.somar(filtradas.map((x) => x.l.contact_id))}>Marcar os {filtradas.length} da lista</Button>
            </DicaBotao>
          )}
          <DicaBotao texto="Gera e guarda o Relatório Completo de cada cliente marcado, um de cada vez. Não consulta a Receita e não tem custo.">
            <Button size="sm" onClick={() => setLote('gerar')}>Gerar relatório ({sel.marcados.size})</Button>
          </DicaBotao>
          <DicaBotao texto="Lista o último relatório guardado de cada cliente marcado para conferir e mandar por e-mail. Nada sai sem você confirmar.">
            <Button size="sm" variant="outline" onClick={() => setLote('enviar')}><Mail className="mr-1.5 h-4 w-4" />Enviar por e-mail</Button>
          </DicaBotao>
          <DicaBotao texto="Baixa num ZIP o último relatório guardado de cada cliente marcado.">
            <Button size="sm" variant="outline" onClick={() => setLote('baixar')}>Baixar</Button>
          </DicaBotao>
        </BarraSelecao>

        <div ref={topoTabela} className="scroll-mt-16 overflow-x-auto rounded-lg border border-line bg-paper">
          {ocupado ? (
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
                  <TableHead>Score</TableHead>
                  <TableHead>Último relatório</TableHead>
                  <TableHead>Enviado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pag.recorte.map(({ l, score, selo }) => {
                  const u = ultimo(l.contact_id);
                  return (
                    <TableRow key={l.contact_id} className="cursor-pointer" tabIndex={0} aria-label={`Abrir a ficha fiscal de ${l.nome}`}
                      onClick={() => ficha.abrir(l.contact_id, 'plano')}
                      onKeyDown={(ev) => { if (ev.key === 'Enter' && ev.target === ev.currentTarget) ficha.abrir(l.contact_id, 'plano'); }}>
                      <TableCell className="min-w-[240px] max-w-[360px]">
                        <div className="flex items-start gap-3">
                          <span className="pt-0.5" onClick={(ev) => ev.stopPropagation()}>
                            <Checkbox aria-label={`Marcar ${l.nome}`} checked={sel.marcados.has(l.contact_id)} onCheckedChange={() => sel.alternar(l.contact_id)} />
                          </span>
                          <div className="min-w-0">
                            <p className="text-ui text-ink">{l.nome}</p>
                            <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(l.documento)}</p>
                            <p className="text-meta text-muted-ink-2">{l.regimeRotulo}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[170px]"><SeloMonitor selo={selo} /></TableCell>
                      <TableCell className="whitespace-nowrap text-ui text-ink">
                        {score.percentual === null ? <span className="text-muted-ink-2">—</span> : `${score.percentual}%`}
                        {score.naoVerificados > 0 && score.percentual !== null && <span className="text-meta text-muted-ink-2"> parcial</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-ui text-muted-ink">{u ? dataHora(u.geradoEm) : <span className="text-meta text-muted-ink-2">Nunca gerado</span>}</TableCell>
                      <TableCell className="whitespace-nowrap text-ui text-muted-ink">{enviado(l.contact_id) ? dataHora(u?.enviadoEm) : <span className="text-meta text-muted-ink-2">—</span>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <RodapeLista mostrando={filtradas.length} total={linhas.length} unidade="clientes monitorados" faixa={pag.faixa} />
          <PaginacaoLista pagina={pag.pagina} totalPaginas={pag.totalPaginas} porPagina={pag.porPagina} total={filtradas.length}
            onPagina={irParaPagina} onPorPagina={pag.setPorPagina} />
        </div>
      </div>

      <AcoesEmLoteDialog
        aberto={acoesLote}
        onClose={() => setAcoesLote(false)}
        clientes={linhas.map(({ l, selo }) => ({ id: l.contact_id, nome: l.nome, documento: l.documento, selo }))}
        extras={[
          { chave: 'nunca', rotulo: 'Sem nenhum relatório', dica: 'Clientes que ainda não têm Relatório Completo guardado.', ids: linhas.filter((x) => !ultimo(x.l.contact_id)).map((x) => x.l.contact_id) },
          { chave: 'nao_enviado', rotulo: 'Gerado e não enviado', dica: 'O último relatório guardado ainda não foi mandado ao cliente.', ids: linhas.filter((x) => !!ultimo(x.l.contact_id) && !enviado(x.l.contact_id)).map((x) => x.l.contact_id) },
        ]}
        acoes={[
          { chave: 'gerar', rotulo: 'Gerar relatório', padrao: ['nunca'],
            fora: (id) => (linhas.find((x) => x.l.contact_id === id)?.score.verificados === 0 ? 'Nada verificado ainda' : null),
            dica: 'Gera e guarda o Relatório Completo de cada cliente. Não consulta a Receita e não tem custo.' },
          { chave: 'enviar', rotulo: 'Enviar por e-mail', padrao: ['nao_enviado'],
            fora: (id) => (!ultimo(id) ? 'Sem relatório guardado' : !marcacoes?.get(id)?.email ? 'Sem e-mail no cadastro' : null),
            dica: 'Manda o último relatório guardado por e-mail, com conferência antes.' },
          { chave: 'baixar', rotulo: 'Baixar PDFs', padrao: [],
            fora: (id) => (!ultimo(id) ? 'Sem relatório guardado' : null),
            dica: 'Baixa num ZIP o último relatório guardado de cada cliente.' },
        ]}
        onContinuar={(acao, ids) => { sel.definir(ids); setLote(acao as 'gerar' | 'enviar' | 'baixar'); }}
      />

      <AcaoLoteDialog
        aberto={lote === 'gerar'}
        onClose={() => setLote(null)}
        titulo="Gerar Relatório Completo"
        descricao="Um relatório por cliente marcado, um de cada vez, só com o que já está salvo. O PDF fica guardado para baixar e enviar."
        itens={marcadas.map(({ l, score }) => ({
          contactId: l.contact_id, nome: l.nome,
          pular: ultimo(l.contact_id)?.geradoEm.slice(0, 10) === hoje ? 'Gerado hoje' : null,
          aviso: score.verificados === 0 ? 'Nada verificado ainda: o relatório sairia só com itens "não verificados".' : null,
        }))}
        rotuloAcao="Gerar"
        rotuloFeito="Relatório guardado"
        executar={(item) => new Promise<ResultadoLote>((resolve) => setGerando({ id: item.contactId, resolve }))}
      />
      {gerando && (
        <GeradorRelatorio key={gerando.id} contactId={gerando.id} onPronto={(r) => { const g = gerando; setGerando(null); g.resolve(r); }} />
      )}
      <EnviarGuiasDialog
        aberto={lote === 'enviar'}
        onClose={() => setLote(null)}
        titulo="Enviar Relatório Completo por e-mail"
        processo="relatorio"
        competencia={competencia}
        itens={itensEnvio}
        assuntoPadrao="Relatório completo da sua empresa · {cliente}"
        mensagemPadrao={'Olá! Segue o relatório completo da {cliente}: situação fiscal, obrigações do ano, pagamentos e o que precisa ser feito. Qualquer dúvida, é só responder este e-mail.\n\nContabilidade Alves'}
      />
      <BaixarLoteDialog
        aberto={lote === 'baixar'}
        onClose={() => setLote(null)}
        contactIds={[...sel.marcados]}
        referencia="último relatório de cada cliente"
        opcoes={[{ tipo: 'relatorio_situacao', rotulo: 'Relatório Completo da Empresa' }]}
      />
    </div>
  );
}

/** Gera e guarda o relatório de UM cliente usando o mesmo hook da ficha; a janela de lote monta um por vez e espera a resposta. */
function GeradorRelatorio({ contactId, onPronto }: { contactId: string; onPronto: (r: ResultadoLote) => void }) {
  const completo = useRelatorioCompleto(contactId);
  const guardar = useGuardarRelatorio();
  const feito = useRef(false);

  useEffect(() => {
    if (feito.current) return;
    if (completo.erro) { feito.current = true; onPronto({ ok: false, error: 'Não foi possível ler os dados salvos deste cliente.' }); return; }
    if (completo.carregando) return;
    const r = completo.relatorio;
    if (!r) { feito.current = true; onPronto({ ok: false, error: 'Cliente fora da carteira monitorada.' }); return; }
    feito.current = true;
    (async () => {
      try {
        const pdf = await completo.gerarPdf();
        await guardar.mutateAsync({
          contactId, tipo: 'situacao', pdfBase64: pdfParaBase64(pdf),
          resumo: { modelo: 'completo', veredito: r.veredito, competencia: r.competencia, percentual: r.score.percentual, regulares: r.score.regulares, verificados: r.score.verificados, naoVerificados: r.score.naoVerificados },
        });
        onPronto({ ok: true, resumo: `${ROTULO_VEREDITO[r.veredito]} · relatório guardado` });
      } catch (e) {
        onPronto({ ok: false, error: (e as Error)?.message || 'Não foi possível gerar o PDF.' });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completo.carregando, completo.relatorio, completo.erro]);

  return null;
}
