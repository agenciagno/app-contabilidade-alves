import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';

import { DsTab, PageHeader, SearchField } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AcaoLoteDialog, BarraSelecao, useSelecao } from '@/components/monitor/GuiasLote';
import { hojeBR } from '@/lib/prazosFederais';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { IntimacoesAba } from '@/components/serpro/IntimacoesAba';
import { ConsultaLoteCaixaDialog } from '@/components/serpro/ConsultaLoteCaixaDialog';
import { MensagensClienteSheet } from '@/components/serpro/MensagensClienteSheet';
import { FaixaEstados, PaginacaoLista, RodapeLista, SeloMini, SeloMonitor, UltimaBusca, useEstadoUrl, usePaginacao } from '@/components/monitor/MonitorUi';
import { seloDte, useConsultarDte, useDteMapa } from '@/hooks/useSerproExtras';
import { useBuscaInicial } from '@/hooks/useBuscaInicial';
import { STATUS_MONITORADO, seloCaixa, useClientesCaixa, type ClienteCaixa, type SeloEstado } from '@/hooks/useSerproCaixaPostal';
import { ROTULO_ESTADO, contarEstados, seloCaixaPostal, type Selo } from '@/lib/monitorEstados';
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
const digitos = (v: string) => v.replace(/\D/g, '');
const ehFilial = (c: ClienteCaixa) => digitos(c.documento).length === 14 && digitos(c.documento).slice(8, 12) !== '0001';

type Aba = 'clientes' | 'intimacoes';

/** Situações que a coluna Situação mostra, na ordem do filtro. */
const SITUACOES_CLIENTE: SeloEstado[] = ['nao_lida', 'nova', 'todas_lidas', 'sem_procuracao', 'nao_verificada'];

/**
 * Caixa Postal e-CAC (Rodada 3, 09/10/2026). Duas abas: Clientes (molde único do Monitoramento, selo de `seloCaixaPostal`, o mesmo que o
 * Dashboard Fiscal conta) e Intimações (a antiga tela Termos de intimação). A aba Clientes é paginada (30, 50 ou 100) e a consulta de um
 * cliente fica só no painel dele; consultar vários é pelo botão Consulta em Lote.
 */
export default function MensagensEcac() {
  const [params, setParams] = useSearchParams();
  const aba: Aba = params.get('aba') === 'intimacoes' ? 'intimacoes' : 'clientes';
  const irPara = (a: Aba) => {
    const n = new URLSearchParams(params);
    n.delete('estado');
    if (a === 'clientes') n.delete('aba'); else n.set('aba', a);
    setParams(n, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader kicker="~/caixa postal e-cac" title="Caixa Postal e-CAC." />

      <div className="flex gap-1 border-b border-line">
        <DsTab active={aba === 'clientes'} onClick={() => irPara('clientes')}>Clientes</DsTab>
        <DsTab active={aba === 'intimacoes'} onClick={() => irPara('intimacoes')}>Intimações</DsTab>
      </div>

      {aba === 'clientes' ? <AbaClientes /> : <IntimacoesAba />}
    </div>
  );
}

// ---------------------------------------------------------------- aba Clientes

function AbaClientes() {
  const { data: clientes = [], isLoading } = useClientesCaixa();
  const [estado, setEstado] = useEstadoUrl();
  const buscaInicial = useBuscaInicial();
  const [busca, setBusca] = useState(buscaInicial);
  const [situacao, setSituacao] = useState<'todas' | SeloEstado>('todas');
  const [aberto, setAberto] = useState<string | null>(null);
  const sel = useSelecao();
  const [lote, setLote] = useState<{ inicial: string[] | null } | null>(null);
  const { data: dtes } = useDteMapa();
  const consultarDte = useConsultarDte();
  const [dteLote, setDteLote] = useState(false);
  const topoTabela = useRef<HTMLDivElement>(null);
  const hoje = hojeBR();

  const seloDe = (c: ClienteCaixa): Selo | null => seloCaixaPostal(seloCaixa(c).estado);

  // Mesmo universo do painel: clientes monitorados, só a matriz.
  const monitorados = useMemo(() => clientes.filter((c) => c.status_cliente === STATUS_MONITORADO), [clientes]);
  const matrizes = useMemo(() => monitorados.filter((c) => !ehFilial(c)), [monitorados]);

  // Os cartões do topo e os números do filtro de situação olham a lista inteira da busca, nunca só a página que está na tela.
  const base = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = digitos(q);
    return matrizes.filter((c) => !q || c.nome.toLowerCase().includes(q) || (!!qDigitos && digitos(c.documento).includes(qDigitos)));
  }, [matrizes, busca]);
  const contagem = contarEstados(base.map(seloDe));
  const porSituacao = useMemo(() => {
    const m = new Map<SeloEstado, number>();
    for (const c of base) { const e = seloCaixa(c).estado; m.set(e, (m.get(e) ?? 0) + 1); }
    return m;
  }, [base]);
  const filtrados = base.filter((c) => (!estado || seloDe(c)?.estado === estado) && (situacao === 'todas' || seloCaixa(c).estado === situacao));

  const pag = usePaginacao(filtrados, `${busca}|${estado ?? ''}|${situacao}`);
  const irParaPagina = (p: number) => {
    pag.setPagina(p);
    requestAnimationFrame(() => topoTabela.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const idsDaPagina = pag.recorte.map((c) => c.contact_id);

  const clienteAberto = clientes.find((c) => c.contact_id === aberto) ?? null;
  const comNovidade = matrizes.filter((c) => { const e = seloCaixa(c).estado; return (e === 'nova' || e === 'nao_lida') && c.procuracao !== 'ausente'; });

  const tabelaExport = (): TabelaExport => ({
    arquivo: 'caixa-postal-ecac',
    titulo: 'Caixa Postal e-CAC — por cliente',
    colunas: ['Razão social', 'CNPJ', 'Regime', 'Situação', 'Estado', 'Última consulta', 'Mensagens salvas', 'Não lidas (salvas)'],
    linhas: filtrados.map((c) => {
      const s = seloDe(c);
      return [
        c.nome, formatarCnpj(c.documento), REGIMES[c.regime ?? ''] ?? c.regime ?? '', s?.motivo ?? '', s ? ROTULO_ESTADO[s.estado] : '',
        c.consultado_em ? format(new Date(c.consultado_em), 'dd/MM/yyyy HH:mm') : '', String(c.mensagens_salvas), String(c.nao_lidas_salvas),
      ];
    }),
  });

  return (
    <div className="space-y-5">
      {isLoading ? <Skeleton className="h-[88px] w-full" /> : <FaixaEstados contagem={contagem} ativo={estado} onChange={setEstado} />}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchField
          placeholder="Buscar por razão social ou CNPJ..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          wrapperClassName="max-w-[429px] flex-1"
        />
        <Select value={situacao} onValueChange={(v) => { if (v) setSituacao(v as typeof situacao); }}>
          <SelectTrigger className="w-[220px]" aria-label="Filtrar por situação"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as situações ({base.length})</SelectItem>
            {SITUACOES_CLIENTE.map((e) => (
              <SelectItem key={e} value={e}>{seloCaixaPostal(e)?.motivo ?? e} ({porSituacao.get(e) ?? 0})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 sm:ml-auto">
          <DicaBotao custo="Consultar" texto={`Escolha quem consultar de uma vez: clientes com mensagem não lida, com mensagem nova (${comNovidade.length} agora) ou os que você marcar. Baixa só a lista, sem registrar ciência.`}>
            <Button variant="outline" size="sm" className="h-10" onClick={() => setLote({ inicial: null })}>Consulta em Lote</Button>
          </DicaBotao>
          <ExportarMenu montar={tabelaExport} disabled={filtrados.length === 0} escolherColunas />
        </div>
      </div>

      <BarraSelecao quantos={sel.marcados.size} onLimpar={sel.limpar}>
        <DicaBotao custo="Consultar" texto="Abre a Consulta em Lote já com os clientes marcados na lista. Você confere antes de começar; quem já foi consultado hoje fica de fora.">
          <Button size="sm" onClick={() => setLote({ inicial: [...sel.marcados] })}>Consultar marcados ({sel.marcados.size})</Button>
        </DicaBotao>
        <DicaBotao custo="Consultar" texto="Consulta se cada cliente marcado aderiu ao Domicílio Tributário Eletrônico (DTE) da Receita e do Simples.">
          <Button size="sm" variant="outline" onClick={() => setDteLote(true)}>Consultar DTE</Button>
        </DicaBotao>
      </BarraSelecao>

      <div ref={topoTabela} className="scroll-mt-16 overflow-x-auto rounded-lg border border-line bg-paper">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtrados.length === 0 ? (
          <div className="p-10 text-center text-ui text-muted-ink">Nenhum cliente nesta situação.</div>
        ) : (
          <Table className="[&_td]:px-3 [&_th]:px-3">
            <TableHeader>
              <TableRow>
                <TableHead>
                  <div className="flex items-center gap-3">
                    <Checkbox aria-label="Marcar todos desta página" checked={sel.todos(idsDaPagina)}
                      onCheckedChange={(v) => (v ? sel.somar(idsDaPagina) : sel.limpar())} />
                    Cliente / Razão Social
                  </div>
                </TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Mensagens baixadas</TableHead>
                <TableHead>DTE</TableHead>
                <TableHead>Última busca</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pag.recorte.map((c) => (
                <TableRow key={c.contact_id} className="cursor-pointer" onClick={() => setAberto(c.contact_id)}>
                  <TableCell className="min-w-[240px] max-w-[360px]">
                    <div className="flex items-start gap-3">
                      <span className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                        <Checkbox aria-label={`Marcar ${c.nome}`} checked={sel.marcados.has(c.contact_id)} onCheckedChange={() => sel.alternar(c.contact_id)} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-ui text-ink">{c.nome}</p>
                        <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(c.documento)}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[170px]"><SeloMonitor selo={seloDe(c)} /></TableCell>
                  <TableCell className="whitespace-nowrap text-ui text-muted-ink">
                    {c.consultado_em ? (
                      <>
                        {c.mensagens_salvas} {c.mensagens_salvas === 1 ? 'mensagem' : 'mensagens'}
                        {c.nao_lidas_salvas > 0 && <span className="text-meta text-muted-ink-2"> · {c.nao_lidas_salvas} não {c.nao_lidas_salvas === 1 ? 'lida' : 'lidas'}</span>}
                      </>
                    ) : <span className="text-meta text-muted-ink-2">Lista não baixada</span>}
                  </TableCell>
                  <TableCell><SeloMini selo={seloDte(dtes?.get(c.contact_id))} /></TableCell>
                  <TableCell><UltimaBusca iso={c.consultado_em} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <RodapeLista mostrando={filtrados.length} total={matrizes.length} unidade="clientes ativos" filiais={monitorados.length - matrizes.length} faixa={pag.faixa} />
        <PaginacaoLista pagina={pag.pagina} totalPaginas={pag.totalPaginas} porPagina={pag.porPagina} total={filtrados.length}
          onPagina={irParaPagina} onPorPagina={pag.setPorPagina} />
      </div>

      <MensagensClienteSheet cliente={clienteAberto} onClose={() => setAberto(null)} />
      <ConsultaLoteCaixaDialog aberto={!!lote} onClose={() => setLote(null)} clientes={matrizes} inicial={lote?.inicial ?? null} />
      <AcaoLoteDialog
        aberto={dteLote}
        onClose={() => setDteLote(false)}
        titulo="Consultar adesão ao DTE"
        descricao="Uma consulta por cliente marcado: se aderiu ao Domicílio Tributário Eletrônico da Receita (e-CAC) e ao do Simples."
        itens={matrizes.filter((c) => sel.marcados.has(c.contact_id)).map((c) => ({
          contactId: c.contact_id, nome: c.nome, pular: dtes?.get(c.contact_id)?.consultado_em?.slice(0, 10) === hoje ? 'Consultado hoje' : null,
        }))}
        tipo="Consultar"
        rotuloAcao="Consultar"
        rotuloFeito="Consultado"
        executar={async (item) => {
          const r = await consultarDte.mutateAsync({ contactId: item.contactId });
          return { ok: r.ok && !r.foraDoMonitoramento, error: r.semProcuracao ? 'Sem procuração para o DTE' : r.error, resumo: seloDte({ contact_id: item.contactId, consultado_em: '', indicador: r.indicador ?? null, status: null })?.motivo };
        }}
      />
    </div>
  );
}
