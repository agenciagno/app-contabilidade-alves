import { useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { PaginacaoLista, RodapeLista, usePaginacao } from '@/components/monitor/MonitorUi';

import { useBuscaInicial } from '@/hooks/useBuscaInicial';
import { DsBadge, PageHeader, SearchField, StatCardRow } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AcaoLoteDialog, BaixarLoteDialog, BarraSelecao, useSelecao } from '@/components/monitor/GuiasLote';
import { hojeBR } from '@/lib/prazosFederais';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CompetenciaNav } from '@/components/serpro/CompetenciaNav';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { PagamentosClienteSheet } from '@/components/serpro/PagamentosClienteSheet';
import { useConsultaPagamentos } from '@/components/serpro/useConsultaPagamentos';
import { useConsultaPgdasd } from '@/components/serpro/pgdasdUi';
import { competenciaPadrao, mesDeData, siglaCompetencia, useComprovantePagamento, useConsultarPagamentos, useMatrizPagamentos, type TipoDoc } from '@/hooks/useSerproPagamentos';
import { anoDe, duplicidadeDas, useMatrizPgdasd } from '@/hooks/useSerproPgdasd';
import { unificarLinhas, type DasUnificado, type LinhaUnificada } from '@/hooks/useSerproDasUnificado';
import type { TabelaExport } from '@/lib/exportarTabela';

const REGIMES: Record<string, string> = {
  simples_nacional: 'Simples Nacional',
  lucro_presumido: 'Lucro Presumido',
  lucro_real: 'Lucro Real',
  mei: 'MEI',
  isento: 'Isento',
};

const formatarCnpj = (d: string) => {
  const n = d.replace(/\D/g, '');
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const ddmm = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7);

const TIPOS_COLUNA: TipoDoc[] = ['DARF', 'DAE'];

type Situacao = 'todos' | 'das_pago' | 'das_vencido' | 'das_a_vencer' | 'sem_das' | 'novo' | 'nao_consultados' | 'consultados' | 'alerta';
const SITUACOES: { value: Situacao; label: string }[] = [
  { value: 'todos', label: 'Todos os ativos' },
  { value: 'das_pago', label: 'DAS pago' },
  { value: 'das_vencido', label: 'DAS vencido, sem pagamento' },
  { value: 'das_a_vencer', label: 'DAS a vencer' },
  { value: 'sem_das', label: 'Sem DAS gerado' },
  { value: 'novo', label: 'Pagamento novo' },
  { value: 'nao_consultados', label: 'Não consultados' },
  { value: 'consultados', label: 'Consultados' },
  { value: 'alerta', label: 'Com alerta' },
];

/** Rótulo do DAS na matriz. Cliente sem dado (não consultado, filial, outro regime) fica com traço. */
function rotuloDas(d: DasUnificado): { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' } | null {
  switch (d.estado) {
    case 'pago': return { label: 'Pago', tone: 'ok' };
    case 'a_vencer': return { label: `Vence ${ddmm(d.vencimento!)}`, tone: 'warn' };
    case 'vencido': return { label: `Vencido ${ddmm(d.vencimento!)}`, tone: 'danger' };
    case 'sem_das': return { label: 'Sem DAS', tone: 'info' };
    default: return null;
  }
}

const duplicidade = (l: LinhaUnificada, pa: string) => l.duplicidade || (!!l.simples && duplicidadeDas(l.simples, pa));
const alerta = (l: LinhaUnificada, pa: string) => duplicidade(l, pa) || l.saldo;
const alertasTexto = (l: LinhaUnificada, pa: string) => [duplicidade(l, pa) && 'Duplicidade', l.saldo && 'Saldo a verificar'].filter(Boolean).join(' · ');

function tabelaExport(linhas: LinhaUnificada[], competencia: string): TabelaExport {
  return {
    arquivo: `das-e-pagamentos-${competencia}`,
    titulo: `DAS e pagamentos na Receita — competência ${siglaCompetencia(competencia)}`,
    colunas: ['Razão social', 'CNPJ', 'Regime', 'Competência', 'DAS', 'Vencimento do DAS', 'Valor do DAS', 'DARF', 'DAE', 'Outros', 'Alertas', 'Pagamento novo', 'Consultado em'],
    linhas: linhas.map((l) => {
      const c = l.consultadoEm !== null;
      const r = rotuloDas(l.das);
      return [
        l.nome, formatarCnpj(l.documento), REGIMES[l.regime ?? ''] ?? l.regime ?? '', siglaCompetencia(competencia),
        r?.label ?? '', r && l.das.vencimento ? format(new Date(`${l.das.vencimento}T00:00:00`), 'dd/MM/yyyy') : '', l.das.valor != null ? moeda(l.das.valor) : '',
        ...(['DARF', 'DAE'] as TipoDoc[]).map((t) => (c ? String(l.contagem[t]) : '')),
        c ? String(l.contagem.DJE + l.contagem.OUTRO) : '',
        alertasTexto(l, competencia), l.novo ? 'Sim' : '', l.ultimaConsulta ? format(new Date(l.ultimaConsulta), 'dd/MM/yyyy HH:mm') : '',
      ];
    }),
  };
}

export default function PagamentosFederal() {
  const [competencia, setCompetencia] = useState(competenciaPadrao());
  const ano = anoDe(competencia);
  const { data: pagamentos = [], isLoading: carregandoPag } = useMatrizPagamentos(competencia);
  const { data: simples = [], isLoading: carregandoSn } = useMatrizPgdasd(ano);
  const consultaPag = useConsultaPagamentos(competencia);
  const consultaDas = useConsultaPgdasd(ano);
  const buscaInicial = useBuscaInicial();
  const [busca, setBusca] = useState(buscaInicial);
  const [regime, setRegime] = useState('todos');
  const [situacao, setSituacao] = useState<Situacao>('todos');
  const [aberto, setAberto] = useState<string | null>(null);
  // Lotes (09/10/2026): consultar, emitir comprovantes que faltam e baixar.
  const sel = useSelecao();
  const consultarPag = useConsultarPagamentos();
  const comprovante = useComprovantePagamento();
  const [lote, setLote] = useState<'consultar' | 'comprovantes' | null>(null);
  const [baixarAberto, setBaixarAberto] = useState(false);
  const hoje = hojeBR();

  const isLoading = carregandoPag || carregandoSn;
  const linhas = useMemo(() => unificarLinhas(pagamentos, simples, competencia), [pagamentos, simples, competencia]);
  const limite = mesDeData(new Date());

  const stats = useMemo(() => {
    const consultados = linhas.filter((l) => l.ultimaConsulta);
    return {
      total: linhas.length,
      consultados: consultados.length,
      dasPagos: linhas.filter((l) => l.das.estado === 'pago').length,
      dasVencidos: linhas.filter((l) => l.das.estado === 'vencido').length,
      novos: linhas.filter((l) => l.novo).length,
    };
  }, [linhas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, '');
    return linhas
      .filter((l) => {
        switch (situacao) {
          case 'das_pago': return l.das.estado === 'pago';
          case 'das_vencido': return l.das.estado === 'vencido';
          case 'das_a_vencer': return l.das.estado === 'a_vencer';
          case 'sem_das': return l.das.estado === 'sem_das';
          case 'novo': return l.novo;
          case 'nao_consultados': return !l.ultimaConsulta;
          case 'consultados': return !!l.ultimaConsulta;
          case 'alerta': return alerta(l, competencia);
          default: return true;
        }
      })
      .filter((l) => regime === 'todos' || (l.regime ?? 'outros') === regime)
      .filter((l) => !q || l.nome.toLowerCase().includes(q) || (qDigitos && l.documento.replace(/\D/g, '').includes(qDigitos)));
  }, [linhas, busca, situacao, regime, competencia]);

  const pag = usePaginacao(filtradas, `${busca}|${situacao}|${regime}|${competencia}`);
  const topoTabela = useRef<HTMLDivElement>(null);
  const irParaPagina = (n: number) => {
    pag.setPagina(n);
    requestAnimationFrame(() => topoTabela.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const idsDaPagina = pag.recorte.map((l) => l.contact_id);

  const linhaAberta = linhas.find((l) => l.contact_id === aberto) ?? null;
  const marcadas = linhas.filter((l) => sel.marcados.has(l.contact_id));
  // Comprovante é por documento pago: um item por documento sem comprovante guardado.
  const semComprovante = marcadas.flatMap((l) => l.docs.filter((d) => !d.comprovante_path).map((d) => ({ l, d })));

  const chip = (l: LinhaUnificada, tipo: TipoDoc) => {
    if (!l.consultadoEm) return <span className="text-muted-ink-2">—</span>;
    const n = l.contagem[tipo];
    return <DsBadge tone={n > 0 ? 'ok' : 'neutral'} dot={false}>{n}</DsBadge>;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/dashboard fiscal · pagamentos e das"
        title="Pagamentos e DAS."
        subtitle="Documentos de arrecadação pagos na Receita (DARF e DAE) e o DAS do Simples (gerado, pago, a vencer ou vencido) por cliente ativo e competência. O aviso de pagamento novo vem da rotina diária das 07:35, sem custo. A situação do DAS é atualizada pela rotina do PGDAS (dia 16 e dia seguinte ao prazo) ou por Atualizar DAS no painel do cliente. Para ver valor, data e composição, abra o cliente e use Consultar pagamentos. A Receita só informa o que foi pago: zero em um mês consultado não prova que não havia o que pagar."
        actions={<ExportarMenu montar={() => tabelaExport(filtradas, competencia)} disabled={filtradas.length === 0} escolherColunas />}
      />

      <CompetenciaNav competencia={competencia} onChange={setCompetencia} limite={limite} />

      <StatCardRow
        items={[
          { label: 'Consultados', value: `${stats.consultados} de ${stats.total}`, hint: 'clientes ativos, um por vez' },
          { label: 'DAS pagos', value: stats.dasPagos, hint: 'segundo a Receita' },
          { label: 'DAS vencidos', value: stats.dasVencidos, hint: 'sem pagamento registrado', emphasis: stats.dasVencidos > 0 ? 'warm' : 'none' },
          { label: 'Pagamento novo', value: stats.novos, hint: 'a Receita mexeu; consulte', emphasis: stats.novos > 0 ? 'warm' : 'none' },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchField placeholder="Buscar por razão social ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px] flex-1" />
        <Select value={situacao} onValueChange={(v) => setSituacao(v as Situacao)}>
          <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
          <SelectContent>{SITUACOES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={regime} onValueChange={setRegime}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os regimes</SelectItem>
            {Object.entries(REGIMES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            <SelectItem value="outros">Outros / sem regime</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <BarraSelecao quantos={sel.marcados.size} onLimpar={sel.limpar}>
        {filtradas.some((l) => !sel.marcados.has(l.contact_id)) && filtradas.length > pag.recorte.length && (
          <DicaBotao texto="Marca todos os clientes da lista com os filtros atuais, inclusive os das outras páginas.">
            <Button size="sm" variant="outline" onClick={() => sel.somar(filtradas.map((l) => l.contact_id))}>Marcar os {filtradas.length} da lista</Button>
          </DicaBotao>
        )}
        <DicaBotao custo="Consultar" texto={`Consulta na Receita os pagamentos de ${siglaCompetencia(competencia)} de cada cliente marcado. Quem já foi consultado hoje fica de fora.`}>
          <Button size="sm" onClick={() => setLote('consultar')}>Consultar pagamentos ({sel.marcados.size})</Button>
        </DicaBotao>
        <DicaBotao custo="Emitir" texto="Emite o comprovante de cada pagamento já consultado que ainda não tem comprovante guardado.">
          <Button size="sm" variant="outline" disabled={!semComprovante.length} onClick={() => setLote('comprovantes')}>Emitir comprovantes ({semComprovante.length})</Button>
        </DicaBotao>
        <DicaBotao texto="Baixa num ZIP os comprovantes e os DAS já guardados da competência. Não consulta a Receita.">
          <Button size="sm" variant="outline" onClick={() => setBaixarAberto(true)}>Baixar</Button>
        </DicaBotao>
      </BarraSelecao>

      <div ref={topoTabela} className="scroll-mt-16 overflow-x-auto rounded-lg border border-line bg-paper">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtradas.length === 0 ? (
          <div className="p-10 text-center text-ui text-muted-ink">Nenhum cliente encontrado.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <div className="flex items-center gap-3">
                    <Checkbox aria-label="Marcar todos desta página" checked={sel.todos(idsDaPagina)}
                      onCheckedChange={(v) => (v ? sel.somar(idsDaPagina) : sel.quitar(idsDaPagina))} />
                    Cliente / Razão Social
                  </div>
                </TableHead>
                <TableHead>DAS</TableHead>
                {TIPOS_COLUNA.map((t) => <TableHead key={t} className="text-center">{t}</TableHead>)}
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pag.recorte.map((l) => {
                const r = rotuloDas(l.das);
                return (
                  <TableRow key={l.contact_id} className="cursor-pointer" tabIndex={0} aria-label={`Abrir o painel de ${l.nome}`} onClick={() => setAberto(l.contact_id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) setAberto(l.contact_id); }}>
                    <TableCell className="min-w-[240px] max-w-[360px]">
                      <div className="flex items-start gap-3">
                        <span className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                          <Checkbox aria-label={`Marcar ${l.nome}`} checked={sel.marcados.has(l.contact_id)} onCheckedChange={() => sel.alternar(l.contact_id)} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-ui text-ink">{l.nome}</p>
                          <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(l.documento)}</p>
                          <p className="text-meta text-muted-ink-2">{REGIMES[l.regime ?? ''] ?? l.regime ?? 'Sem regime'}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {r ? (
                        <div className="space-y-0.5">
                          <DsBadge tone={r.tone}>{r.label}</DsBadge>
                          {l.das.valor != null && <p className="text-meta text-muted-ink-2">{moeda(l.das.valor)}</p>}
                        </div>
                      ) : <span className="text-muted-ink-2">—</span>}
                    </TableCell>
                    {TIPOS_COLUNA.map((t) => <TableCell key={t} className="text-center">{chip(l, t)}</TableCell>)}
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {l.novo && <DsBadge tone="warn">Pagamento novo</DsBadge>}
                        {duplicidade(l, competencia) && <DsBadge tone="danger">Duplicidade</DsBadge>}
                        {l.saldo && <DsBadge tone="info">Saldo</DsBadge>}
                        {l.semProcuracao && <DsBadge tone="neutral">Sem procuração</DsBadge>}
                        {!l.novo && !duplicidade(l, competencia) && !l.saldo && !l.semProcuracao && (
                          <span className="text-meta text-muted-ink-2">
                            {l.ultimaConsulta ? `Consultado ${format(new Date(l.ultimaConsulta), 'dd/MM HH:mm')}` : 'Não consultado'}
                          </span>
                        )}
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
        <RodapeLista mostrando={filtradas.length} total={linhas.length} unidade="clientes ativos" faixa={pag.faixa} />
        <PaginacaoLista pagina={pag.pagina} totalPaginas={pag.totalPaginas} porPagina={pag.porPagina} total={filtradas.length}
          onPagina={irParaPagina} onPorPagina={pag.setPorPagina} />
      </div>

      <PagamentosClienteSheet
        linha={linhaAberta}
        competencia={competencia}
        consultando={!!linhaAberta && consultaPag.emAndamento === linhaAberta.contact_id}
        consultandoDas={!!linhaAberta && consultaDas.emAndamento === linhaAberta.contact_id}
        onConsultar={(id) => consultaPag.executar(id)}
        onConsultarDas={(id) => consultaDas.executar(id)}
        onClose={() => setAberto(null)}
      />
      {consultaPag.dialog}
      {consultaDas.dialog}
      <AcaoLoteDialog
        aberto={lote === 'consultar'}
        onClose={() => setLote(null)}
        titulo={`Consultar pagamentos de ${siglaCompetencia(competencia)}`}
        descricao="Uma consulta por cliente marcado, um de cada vez: traz os documentos pagos da competência (DARF, DAE e DAS)."
        itens={marcadas.map((l) => ({
          contactId: l.contact_id, nome: l.nome,
          pular: l.semProcuracao ? 'Sem procuração' : l.consultadoEm?.slice(0, 10) === hoje ? 'Consultado hoje' : null,
        }))}
        tipo="Consultar"
        rotuloAcao="Consultar"
        rotuloFeito="Consultado"
        executar={async (item) => {
          const r = await consultarPag.mutateAsync({ contactId: item.contactId, competencia });
          return {
            ok: r.ok && !r.foraDoMonitoramento, recente: r.recente, error: r.semProcuracao ? 'Sem procuração para Pagamentos' : r.error,
            resumo: r.do_mes != null ? `${r.do_mes} ${r.do_mes === 1 ? 'documento' : 'documentos'} no mês` : undefined,
          };
        }}
      />
      <AcaoLoteDialog
        aberto={lote === 'comprovantes'}
        onClose={() => setLote(null)}
        titulo="Emitir comprovantes de pagamento"
        descricao="Um comprovante por documento pago que ainda não tem PDF guardado, um de cada vez."
        itens={semComprovante.map(({ l, d }) => ({
          contactId: d.id, nome: `${l.nome} · ${d.tipo_sigla}${d.valor_total != null ? ` ${moeda(d.valor_total)}` : ''}${d.data_arrecadacao ? ` · pago em ${ddmm(d.data_arrecadacao)}` : ''}`,
        }))}
        tipo="Emitir"
        rotuloAcao="Emitir"
        rotuloFeito="Comprovante guardado"
        executar={async (item) => {
          const doc = semComprovante.find((x) => x.d.id === item.contactId);
          if (!doc) return { ok: false, error: 'Documento não encontrado' };
          const r = await comprovante.mutateAsync({ pagamentoId: doc.d.id, contactId: doc.l.contact_id });
          return { ok: r.ok, jaGerado: r.jaEmitido, error: r.semProcuracao ? 'Sem procuração para Pagamentos' : r.error };
        }}
      />
      <BaixarLoteDialog
        aberto={baixarAberto}
        onClose={() => setBaixarAberto(false)}
        contactIds={[...sel.marcados]}
        competencia={competencia}
        referencia={`competência ${siglaCompetencia(competencia)}`}
        opcoes={[{ tipo: 'comprovante', rotulo: 'Comprovantes de pagamento' }, { tipo: 'pgdasd_das', rotulo: 'DAS gerados' }]}
      />
    </div>
  );
}
