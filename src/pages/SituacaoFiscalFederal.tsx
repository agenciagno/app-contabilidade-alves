import { useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { FileText, History, Loader2, RefreshCw, Wallet } from 'lucide-react';

import { useBuscaInicial } from '@/hooks/useBuscaInicial';
import { DsBadge, PageHeader, SearchField } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { usePagamentosClienteJanela } from '@/components/serpro/PagamentosDoCliente';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { useAbrirRelatorioSitfis, useGerarRelatorioSitfis } from '@/components/serpro/sitfisUi';
import { FaixaEstados, PaginacaoLista, RodapeLista, SeloMini, SeloMonitor, UltimaBusca, useEstadoUrl, usePaginacao } from '@/components/monitor/MonitorUi';
import { DIAS_RELATORIO_VELHO, estadoSitfis, relatorioVelho, useGerarSitfis, useMatrizSitfis, type LinhaSitfis, type SitfisRow } from '@/hooks/useSerproSitfis';
import { AcaoLoteDialog, BaixarLoteDialog, BarraSelecao, useSelecao } from '@/components/monitor/GuiasLote';
import { hojeBR } from '@/lib/prazosFederais';
import { ROTULO_ESTADO, contarEstados, seloSitfis, type Selo } from '@/lib/monitorEstados';
import type { TabelaExport } from '@/lib/exportarTabela';

const REGIMES: Record<string, string> = {
  simples_nacional: 'Simples Nacional', lucro_presumido: 'Lucro Presumido', lucro_real: 'Lucro Real', mei: 'MEI', isento: 'Isento',
};
const formatarCnpj = (d: string) => {
  const n = d.replace(/\D/g, '');
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};
const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');

/** Resultado de UM relatório guardado (para o histórico), com a mesma leitura cautelosa da linha. */
function seloDoRelatorio(r: SitfisRow): Selo | null {
  if (!r.confiavel || r.resultado === 'nao_lido' || !r.resultado) return seloSitfis('a_conferir');
  return seloSitfis(r.resultado);
}

/**
 * Situação Fiscal (Rodada 3, 09/10/2026: molde único do Monitoramento). Selo de `seloSitfis`, o mesmo do Dashboard Fiscal, então a barra
 * do painel abre esta lista já filtrada. Histórico: todo relatório pronto fica guardado e abre de novo sem consultar a Receita.
 */
export default function SituacaoFiscalFederal() {
  const { abrir: abrirPagamentos, janela: janelaPagamentos } = usePagamentosClienteJanela();
  const { data: linhas = [], isLoading } = useMatrizSitfis();
  const { executar, emAndamento, dialog } = useGerarRelatorioSitfis();
  const { ocupado, abrir } = useAbrirRelatorioSitfis();
  const [estado, setEstado] = useEstadoUrl();
  const buscaInicial = useBuscaInicial();
  const [busca, setBusca] = useState(buscaInicial);
  const [historico, setHistorico] = useState<LinhaSitfis | null>(null);
  const sel = useSelecao();
  const gerarSitfis = useGerarSitfis();
  const [loteAberto, setLoteAberto] = useState(false);
  const [baixarAberto, setBaixarAberto] = useState(false);
  const hoje = hojeBR();

  const seloDe = (l: LinhaSitfis): Selo | null => (emAndamento === l.contact_id
    ? { estado: 'processando', motivo: 'Gerando relatório…' }
    : seloSitfis(estadoSitfis(l)));

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

  const tabelaExport = (): TabelaExport => ({
    arquivo: 'situacao-fiscal',
    titulo: 'Situação fiscal dos clientes ativos (Receita Federal e PGFN)',
    colunas: ['Razão social', 'CNPJ', 'Regime', 'Situação', 'Estado', 'Pendências', 'Certidão (tipo)', 'Certidão (validade)', 'Relatório em', 'Relatórios guardados'],
    linhas: filtradas.map((l) => {
      const s = seloDe(l);
      const u = l.ultimo;
      return [
        l.nome, formatarCnpj(l.documento), REGIMES[l.regime ?? ''] ?? l.regime ?? '', s?.motivo ?? '', s ? ROTULO_ESTADO[s.estado] : '',
        u?.categorias.join('; ') ?? '', u?.certidao_tipo ?? '', u?.certidao_validade ? dataBR(u.certidao_validade) : '',
        u?.gerado_em ? format(new Date(u.gerado_em), 'dd/MM/yyyy HH:mm') : '', String(l.historico.length),
      ];
    }),
  });

  return (
    <div className="space-y-6">
      <PageHeader kicker="~/dashboard fiscal · situação fiscal" title="Situação fiscal." />

      <div className="space-y-5">
        {isLoading ? <Skeleton className="h-[88px] w-full" /> : <FaixaEstados contagem={contagem} ativo={estado} onChange={setEstado} />}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchField placeholder="Buscar por razão social ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px] flex-1" />
          <ExportarMenu montar={tabelaExport} disabled={filtradas.length === 0} escolherColunas />
        </div>

        <BarraSelecao quantos={sel.marcados.size} onLimpar={sel.limpar}>
          {filtradas.some((l) => !sel.marcados.has(l.contact_id)) && filtradas.length > pag.recorte.length && (
            <DicaBotao texto="Marca todos os clientes da lista com os filtros atuais, inclusive os das outras páginas.">
              <Button size="sm" variant="outline" onClick={() => sel.somar(filtradas.map((l) => l.contact_id))}>Marcar os {filtradas.length} da lista</Button>
            </DicaBotao>
          )}
          <DicaBotao custo="Emitir" texto="Pede à Receita o relatório de situação fiscal de cada cliente marcado, um de cada vez. Quem já tem relatório de hoje fica de fora.">
            <Button size="sm" onClick={() => setLoteAberto(true)}>Gerar relatório ({sel.marcados.size})</Button>
          </DicaBotao>
          <DicaBotao texto="Baixa num ZIP o último relatório guardado de cada cliente marcado. Não consulta a Receita.">
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
                  <TableHead>Pendências</TableHead>
                  <TableHead>Última certidão</TableHead>
                  <TableHead>Última busca</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pag.recorte.map((l) => {
                  const e = estadoSitfis(l);
                  const u = l.ultimo;
                  const gerando = emAndamento === l.contact_id;
                  const validade = u?.certidao_validade ?? null;
                  const vencida = !!validade && validade < new Date().toISOString().slice(0, 10);
                  const outros = [
                    l.processando ? 'Receita ainda preparando o relatório' : null,
                    relatorioVelho(l) ? `Relatório com mais de ${DIAS_RELATORIO_VELHO} dias` : null,
                  ].filter((x): x is string => !!x);
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
                      <TableCell className="min-w-[170px]"><SeloMonitor selo={seloDe(l)} outros={outros} /></TableCell>
                      <TableCell className="max-w-[260px] text-meta text-muted-ink">
                        {u?.categorias.length ? u.categorias.join('; ') : u && e === 'com_pendencias' ? 'Abra o PDF' : '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-ui">
                        {u?.certidao_tipo ? (
                          <span className={vencida ? 'text-danger' : 'text-muted-ink'}>{u.certidao_tipo} · {vencida ? 'venceu em ' : 'até '}{dataBR(validade)}</span>
                        ) : <span className="text-muted-ink-2">—</span>}
                      </TableCell>
                      <TableCell><UltimaBusca iso={u?.gerado_em ?? null} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <DicaBotao texto="Abre os pagamentos deste cliente na Receita (DARF, DAS, DAE e DJE) com a composição de cada guia e o comprovante. Abrir é grátis: só lê o que já está salvo.">
                            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Pagamentos do cliente" onClick={() => abrirPagamentos(l.contact_id, l.nome, formatarCnpj(l.documento))}>
                              <Wallet className="h-4 w-4" />
                            </Button>
                          </DicaBotao>
                          {u && (
                            <DicaBotao texto="Abre o PDF do último relatório, que já está guardado. Não consulta a Receita.">
                              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="PDF do último relatório" disabled={ocupado === u.id} onClick={() => abrir(u.id)}>
                                {ocupado === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                              </Button>
                            </DicaBotao>
                          )}
                          {l.historico.length > 0 && (
                            <DicaBotao texto={`Histórico: os ${l.historico.length === 1 ? '1 relatório guardado' : `${l.historico.length} relatórios guardados`} deste cliente, cada um com o seu PDF. Não consulta a Receita.`}>
                              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Histórico de relatórios" onClick={() => setHistorico(l)}>
                                <History className="h-4 w-4" />
                              </Button>
                            </DicaBotao>
                          )}
                          <DicaBotao custo="Emitir"
                            texto={l.processando ? 'A Receita ainda estava preparando o relatório deste cliente. Clique para buscar o PDF pronto.'
                              : 'Pede à Receita o relatório de situação fiscal (Receita e PGFN) deste cliente e guarda o PDF. Leva alguns segundos.'}>
                            <Button size="sm" variant="outline" disabled={gerando} onClick={() => executar(l.contact_id)}>
                              {gerando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                              {u ? 'Atualizar' : 'Gerar'}<Preco tipo="Emitir" />
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
      </div>

      <Dialog open={!!historico} onOpenChange={(o) => !o && setHistorico(null)}>
        <DialogContent className="max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Histórico da situação fiscal</DialogTitle>
            <DialogDescription>{historico?.nome} · {historico ? formatarCnpj(historico.documento) : ''}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-line">
            <Table className="[&_td]:px-3 [&_th]:px-3">
              <TableHeader>
                <TableRow>
                  <TableHead>Gerado em</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>Certidão</TableHead>
                  <TableHead className="text-right">PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historico?.historico.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap font-mono text-ui">
                      {r.gerado_em ? format(new Date(r.gerado_em), 'dd/MM/yyyy HH:mm') : '—'}
                      {i === 0 && <DsBadge tone="neutral" dot={false} className="ml-2">Mais recente</DsBadge>}
                    </TableCell>
                    <TableCell>
                      <SeloMini selo={seloDoRelatorio(r)} />
                      {r.categorias.length > 0 && <p className="mt-0.5 max-w-[220px] text-meta text-muted-ink-2">{r.categorias.join('; ')}</p>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-meta text-muted-ink">{r.certidao_tipo ? `${r.certidao_tipo} · até ${dataBR(r.certidao_validade)}` : '—'}</TableCell>
                    <TableCell className="text-right">
                      <DicaBotao texto="Abre o PDF deste relatório, que já está guardado. Não consulta a Receita.">
                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Abrir PDF" disabled={!r.pdf_path || ocupado === r.id} onClick={() => abrir(r.id)}>
                          {ocupado === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                        </Button>
                      </DicaBotao>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-meta text-muted-ink-2">Um relatório novo entra aqui a cada mês, pela rotina mensal ou por um clique em Atualizar.</p>
        </DialogContent>
      </Dialog>

      {dialog}
      <AcaoLoteDialog
        aberto={loteAberto}
        onClose={() => setLoteAberto(false)}
        titulo="Gerar relatório de situação fiscal"
        descricao="Um relatório por cliente marcado (Receita e PGFN), um de cada vez. A Receita leva alguns segundos para preparar cada um."
        itens={matrizes.filter((l) => sel.marcados.has(l.contact_id)).map((l) => ({
          contactId: l.contact_id, nome: l.nome, pular: l.ultimo?.gerado_em?.slice(0, 10) === hoje ? 'Relatório de hoje' : null,
        }))}
        tipo="Emitir"
        rotuloAcao="Gerar"
        rotuloFeito="Relatório gerado"
        executar={async (item) => {
          const r = await gerarSitfis.mutateAsync({ contactId: item.contactId });
          if (r.processando) return { ok: false, error: `A Receita ainda está preparando. Tente de novo em ${r.aguarde ?? 10} segundos.` };
          return {
            ok: r.ok, recente: r.recente, error: r.semProcuracao ? 'Sem procuração para a Situação Fiscal' : r.error,
            resumo: r.resultado === 'sem_pendencias' && r.confiavel ? 'Sem pendências' : r.resultado === 'com_pendencias' && r.confiavel ? 'Com pendências' : 'Gerado: conferir o PDF',
          };
        }}
      />
      <BaixarLoteDialog
        aberto={baixarAberto}
        onClose={() => setBaixarAberto(false)}
        contactIds={[...sel.marcados]}
        referencia="último relatório de cada cliente"
        opcoes={[{ tipo: 'sitfis', rotulo: 'Relatório de situação fiscal da Receita (último)' }, { tipo: 'relatorio_situacao', rotulo: 'Relatório de Situação Fiscal para o cliente (CA)' }]}
      />
      {janelaPagamentos}
    </div>
  );
}
