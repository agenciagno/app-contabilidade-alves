import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, FileText, Loader2, Mail, MoreHorizontal, Receipt, RefreshCw, X } from 'lucide-react';

import { DsTab, PageHeader, SearchField } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CompetenciaNav } from '@/components/serpro/CompetenciaNav';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { FaturamentoClienteSheet } from '@/components/serpro/FaturamentoClienteSheet';
import { FichaSimplesSheet } from '@/components/serpro/FichaSimplesSheet';
import { useConsultaPgdasd } from '@/components/serpro/pgdasdUi';
import { useAbrirDefis, useConsultaDefis } from '@/components/serpro/defisUi';
import { useLeituraFaturamento } from '@/components/serpro/useLeituraFaturamento';
import { formatarCnpj } from '@/components/gestao360/ClienteFiltro';
import { FaixaEstados, FiltroSelo, PaginacaoLista, RodapeLista, SeloMini, SeloMonitor, UltimaBusca, passaFiltroSelo, useEstadoUrl, usePaginacao } from '@/components/monitor/MonitorUi';
import { AbaMei } from '@/components/monitor/AbaMei';
import { AcaoLoteDialog, BaixarLoteDialog, BarraSelecao, EnviarGuiasDialog, GerarLoteDialog, useSelecao, type ItemEnvio, type ItemLote } from '@/components/monitor/GuiasLote';
import { useGuiasEnviadas, useMarcacoesGuia, useMarcarGuia } from '@/hooks/useGuiasCliente';
import { rotuloRegime, useConsultarRegime, useRegimeMapa } from '@/hooks/useSerproExtras';
import { useBuscaInicial } from '@/hooks/useBuscaInicial';
import { useCadastroMonitor } from '@/hooks/useSituacaoCarteira';
import { competenciaPadrao, mesDeData, rotuloCompetencia, siglaCompetencia, useMatrizPagamentos } from '@/hooks/useSerproPagamentos';
import { anoDe, useConsultarPgdasd, useGerarDas, useMatrizPgdasd, type DasRow } from '@/hooks/useSerproPgdasd';
import { percentualLimite, useFaturamentoAno } from '@/hooks/useSerproFaturamento';
import { TIPO_DEFIS, defisDoAno, prazoDefis, statusDefis, useConsultarDefis, useMatrizDefis, type LinhaDefis } from '@/hooks/useSerproDefis';
import { ROTULO_ESTADO, contarEstados, seloDefis, type Selo } from '@/lib/monitorEstados';
import { montarLinhasSimples, seloDaFonte, type FonteSimples, type LinhaSimples } from '@/lib/simplesNacionalLinhas';
import { digitos, type ResponsavelCliente } from '@/lib/situacaoCarteira';
import { hojeBR } from '@/lib/prazosFederais';
import type { TabelaExport } from '@/lib/exportarTabela';

type Aba = 'mensal' | 'defis' | 'mei';

const ROTULO_FONTE: Record<Exclude<FonteSimples, 'situacao'>, string> = { declaracao: 'Declaração', das: 'DAS', limite: 'Limite do Simples' };
const moeda = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const EM_CONSULTA: Selo = { estado: 'processando', motivo: 'Consultando…' };
const motivoDoSelo = (s: Selo | null) => s?.motivo ?? '';
const pct = (v: number | null) => (v === null ? '' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);

function bate(busca: string, nome: string, documento: string) {
  const q = busca.trim().toLowerCase();
  if (!q) return true;
  const qd = q.replace(/\D/g, '');
  return nome.toLowerCase().includes(q) || (!!qd && digitos(documento).includes(qd));
}

/**
 * Simples Nacional | MEI (Rodada 2, 08/10/2026): junta as telas PGDAS, Faturamento e DEFIS no molde único do Monitoramento.
 * Aba Mensal: uma linha por cliente com a situação do PGDAS, a do DAS e o sublimite (RBA) da competência. Aba DEFIS: a declaração anual.
 * Pagamentos (DARF e DAE de todos os regimes) continua na tela própria.
 */
export default function SimplesNacionalFederal() {
  const [params, setParams] = useSearchParams();
  const abaParam = params.get('aba');
  const aba: Aba = abaParam === 'defis' || abaParam === 'mei' ? abaParam : 'mensal';
  const fonteParam = params.get('fonte');
  const fonte: FonteSimples = fonteParam === 'declaracao' || fonteParam === 'das' || fonteParam === 'limite' ? fonteParam : 'situacao';
  const [estado, setEstado] = useEstadoUrl();
  const buscaInicial = useBuscaInicial();
  const [busca, setBusca] = useState(buscaInicial);

  const mudar = (f: (p: URLSearchParams) => void) => setParams((p) => { const n = new URLSearchParams(p); f(n); return n; }, { replace: true });
  const irPara = (a: Aba) => mudar((n) => { n.delete('estado'); n.delete('fonte'); if (a === 'mensal') n.delete('aba'); else n.set('aba', a); });

  const { responsaveis, aberturas, carregando: carregandoCadastro } = useCadastroMonitor();

  return (
    <div className="space-y-6">
      <PageHeader kicker="~/dashboard fiscal · simples nacional" title="Simples Nacional | MEI." />

      <div className="flex gap-1 border-b border-line">
        <DsTab active={aba === 'mensal'} onClick={() => irPara('mensal')}>Mensal</DsTab>
        <DsTab active={aba === 'defis'} onClick={() => irPara('defis')}>DEFIS</DsTab>
        <DsTab active={aba === 'mei'} onClick={() => irPara('mei')}>MEI</DsTab>
      </div>

      {aba === 'mensal' ? (
        <AbaMensal
          busca={busca} setBusca={setBusca} estado={estado} setEstado={setEstado}
          fonte={fonte} limparFonte={() => mudar((n) => { n.delete('fonte'); n.delete('estado'); })}
          responsaveis={responsaveis} aberturas={aberturas} carregandoCadastro={carregandoCadastro}
        />
      ) : aba === 'defis' ? (
        <AbaDefis busca={busca} setBusca={setBusca} estado={estado} setEstado={setEstado} responsaveis={responsaveis} carregandoCadastro={carregandoCadastro} />
      ) : (
        <AbaMei />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- aba Mensal

function AbaMensal({
  busca, setBusca, estado, setEstado, fonte, limparFonte, responsaveis, aberturas, carregandoCadastro,
}: {
  busca: string; setBusca: (v: string) => void;
  estado: ReturnType<typeof useEstadoUrl>[0]; setEstado: ReturnType<typeof useEstadoUrl>[1];
  fonte: FonteSimples; limparFonte: () => void;
  responsaveis: Map<string, ResponsavelCliente>; aberturas: Map<string, string | null>; carregandoCadastro: boolean;
}) {
  const [pa, setPa] = useState(competenciaPadrao());
  const ano = anoDe(pa);
  const hoje = hojeBR();
  const { data: pgdas = [], isLoading: carregandoPg } = useMatrizPgdasd(ano);
  const { data: pagamentos = [], isLoading: carregandoPag } = useMatrizPagamentos(pa);
  const { data: leituras = [], isLoading: carregandoFat } = useFaturamentoAno(ano);
  const consulta = useConsultaPgdasd(ano);
  const leitura = useLeituraFaturamento();
  const [aberto, setAberto] = useState<string | null>(null);
  const [verLeitura, setVerLeitura] = useState(false);
  const [filtroPgdas, setFiltroPgdas] = useState<string | null>(null);
  const [filtroDas, setFiltroDas] = useState<string | null>(null);
  // Rodada 5: lote de DAS pela tela e envio com conferência.
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [loteAberto, setLoteAberto] = useState(false);
  const [envioAberto, setEnvioAberto] = useState(false);
  const [consultaLote, setConsultaLote] = useState(false);
  const [baixarAberto, setBaixarAberto] = useState(false);
  const [cobrancaLote, setCobrancaLote] = useState(false);
  const [regimeLote, setRegimeLote] = useState(false);
  const consultarPg = useConsultarPgdasd();
  const { data: regimes } = useRegimeMapa(ano);
  const consultarRegime = useConsultarRegime();
  const { data: marcacoes } = useMarcacoesGuia();
  const marcar = useMarcarGuia();
  const gerarDas = useGerarDas();
  const { data: enviadas } = useGuiasEnviadas('das', pa);

  const linhas = useMemo(
    () => montarLinhasSimples({ pgdas, pagamentos, faturamento: leituras, responsaveis, aberturas, pa, hoje }),
    [pgdas, pagamentos, leituras, responsaveis, aberturas, pa, hoje],
  );

  // Linha com consulta em andamento fica azul ("Processando") até a resposta chegar.
  const seloDe = (l: LinhaSimples): Selo | null => {
    if (fonte === 'situacao' && (consulta.emAndamento === l.contact_id || leitura.emAndamento === l.contact_id)) return { estado: 'processando', motivo: 'Consultando…' };
    return seloDaFonte(l, fonte);
  };

  // Contando uma coluna só (link do painel): quem não tem aquele selo (ex.: sem declaração, logo sem DAS) sai, para o total bater com a barra.
  const base = useMemo(
    () => linhas.filter((l) => (fonte === 'situacao' || seloDaFonte(l, fonte) !== null) && bate(busca, l.nome, l.documento)),
    [linhas, fonte, busca],
  );
  const contagem = contarEstados(base.map(seloDe));
  const filtradas = base
    .filter((l) => !estado || seloDe(l)?.estado === estado)
    .filter((l) => passaFiltroSelo(l.declaracao, filtroPgdas) && passaFiltroSelo(l.dasSelo, filtroDas))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  // DAS guardado e ainda pagável (vale até a data limite de acolhimento): o servidor devolve esse arquivo sem emitir outro.
  const dasValido = (l: LinhaSimples): DasRow | null =>
    l.das.das.find((d) => !!d.das_path && (d.limite_acolhimento ?? d.vencimento ?? '') >= hoje) ?? null;
  const recebeDas = (id: string) => !!marcacoes?.get(id)?.das;
  const quemRecebe = linhas.filter((l) => recebeDas(l.contact_id));
  const itensLote: ItemLote[] = linhas.filter((l) => marcados.has(l.contact_id)).map((l) => ({
    contactId: l.contact_id, nome: l.nome, guardada: !!dasValido(l),
    aviso: !l.declaracaoRow ? 'Sem PGDAS-D transmitido no mês: a Receita não gera o DAS.' : l.das.estado === 'pago' ? 'DAS do mês já pago.' : null,
  }));
  const itensEnvio: ItemEnvio[] = quemRecebe.flatMap((l) => {
    const d = dasValido(l) ?? l.das.das.find((x) => !!x.das_path);
    if (!d) return [];
    const venc = d.vencimento ? ` · vence ${d.vencimento.slice(8, 10)}/${d.vencimento.slice(5, 7)}` : '';
    return [{
      contactId: l.contact_id, nome: l.nome, email: marcacoes?.get(l.contact_id)?.email ?? null,
      documento: { tipo: 'pgdasd_das', id: d.id }, rotulo: `DAS ${siglaCompetencia(pa)}${venc}${d.valor_total != null ? ` · ${moeda(d.valor_total)}` : ''}`,
      enviadoEm: enviadas?.get(d.id) ?? null,
    }];
  });
  const aEnviar = itensEnvio.filter((i) => i.email && !i.enviadoEm).length;
  const itensConsulta: ItemLote[] = linhas.filter((l) => marcados.has(l.contact_id)).map((l) => ({
    contactId: l.contact_id, nome: l.nome, pular: l.pg.consultadoEm && l.pg.consultadoEm.slice(0, 10) === hoje ? 'Consultado hoje' : null,
  }));
  const alternarMarcado = (id: string) => setMarcados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const pag = usePaginacao(filtradas, `${busca}|${estado ?? ''}|${fonte}|${filtroPgdas ?? ''}|${filtroDas ?? ''}|${pa}`);
  const topoTabela = useRef<HTMLDivElement>(null);
  const irParaPagina = (n: number) => {
    pag.setPagina(n);
    requestAnimationFrame(() => topoTabela.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const idsDaPagina = pag.recorte.map((l) => l.contact_id);
  const idx = filtradas.findIndex((l) => l.contact_id === aberto);
  const linhaAberta = idx >= 0 ? filtradas[idx] : linhas.find((l) => l.contact_id === aberto) ?? null;
  const carregando = carregandoPg || carregandoPag || carregandoFat || carregandoCadastro;
  const foraDaLista = pgdas.filter((l) => l.filial).length;

  const tabelaExport = (): TabelaExport => ({
    arquivo: `simples-nacional-${pa}`,
    titulo: `Simples Nacional — competência ${siglaCompetencia(pa)}`,
    colunas: ['Razão social', 'CNPJ', 'Responsável', 'Situação geral', 'Estado', 'Situação PGDAS', 'Nº da declaração', 'Situação DAS', 'Vencimento do DAS', 'Valor do DAS', 'Sublimite (RBA)', '% do limite', 'Limite', 'Última busca'],
    linhas: filtradas.map((l) => [
      l.nome, formatarCnpj(l.documento), l.responsavel?.nome ?? '', l.situacao?.motivo ?? '', l.situacao ? ROTULO_ESTADO[l.situacao.estado] : '',
      l.declaracao?.motivo ?? '', l.declaracaoRow?.numero_declaracao ?? '', l.dasSelo?.motivo ?? '',
      l.das.vencimento ? format(new Date(`${l.das.vencimento}T00:00:00`), 'dd/MM/yyyy') : '', l.das.valor != null ? moeda(l.das.valor) : '',
      l.fat ? moeda(l.fat.rbt12_total) : '', l.fat ? pct(percentualLimite(l.fat)) : '', l.limite?.motivo ?? '',
      l.ultimaBusca ? format(new Date(l.ultimaBusca), 'dd/MM/yyyy HH:mm') : '',
    ]),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <CompetenciaNav competencia={pa} onChange={(v) => { setPa(v); setMarcados(new Set()); }} limite={mesDeData(new Date())} />
        <div className="flex flex-wrap items-center gap-2">
          <DicaBotao texto={`Marca na lista os clientes que recebem o DAS pela CA (marcação do cadastro), para gerar em lote. ${quemRecebe.length} marcados no cadastro.`}>
            <Button variant="outline" size="sm" className="h-10" disabled={!quemRecebe.length} onClick={() => setMarcados(new Set(quemRecebe.map((l) => l.contact_id)))}>
              Selecionar quem recebe DAS ({quemRecebe.length})
            </Button>
          </DicaBotao>
          <DicaBotao texto="Lista os DAS já gerados dos clientes que recebem DAS pela CA, para conferir e mandar por e-mail. Nada sai sem você confirmar.">
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
            <Button size="sm" variant="outline" onClick={() => setMarcados(new Set([...marcados, ...filtradas.map((l) => l.contact_id)]))}>
              Marcar os {filtradas.length} da lista
            </Button>
          </DicaBotao>
        )}
        <DicaBotao custo="Emitir" texto="Gera o DAS de cada cliente marcado. Quem já tem DAS guardado e válido não é emitido de novo. Pede confirmação antes.">
          <Button size="sm" onClick={() => setLoteAberto(true)}>Gerar DAS ({marcados.size})</Button>
        </DicaBotao>
        <DicaBotao custo="Consultar" texto={`Consulta na Receita as declarações e os DAS de ${ano} de cada cliente marcado. Quem já foi consultado hoje fica de fora.`}>
          <Button size="sm" variant="outline" onClick={() => setConsultaLote(true)}>Consultar PGDAS-D ({marcados.size})</Button>
        </DicaBotao>
        <DicaBotao custo="Emitir" texto={`Gera o DAS de ${siglaCompetencia(pa)} pelo sistema de Cobrança da Receita (período que já foi para cobrança), para cada cliente marcado.`}>
          <Button size="sm" variant="outline" onClick={() => setCobrancaLote(true)}>DAS de cobrança</Button>
        </DicaBotao>
        <DicaBotao custo="Consultar" texto={`Consulta se cada cliente marcado optou pelo regime de caixa ou de competência em ${ano}.`}>
          <Button size="sm" variant="outline" onClick={() => setRegimeLote(true)}>Regime de apuração</Button>
        </DicaBotao>
        <DicaBotao texto="Baixa num ZIP os DAS, recibos e declarações já guardados dos clientes marcados. Não consulta a Receita.">
          <Button size="sm" variant="outline" onClick={() => setBaixarAberto(true)}>Baixar</Button>
        </DicaBotao>
        <Button size="sm" variant="outline" disabled={marcar.isPending}
          onClick={() => marcar.mutate({ contactIds: [...marcados], processo: 'das', valor: true })}>Marcar "recebe DAS da CA"</Button>
        <Button size="sm" variant="ghost" disabled={marcar.isPending}
          onClick={() => marcar.mutate({ contactIds: [...marcados], processo: 'das', valor: false })}>Desmarcar</Button>
      </BarraSelecao>

      {fonte !== 'situacao' && (
        <div className="flex items-center gap-2 text-meta text-muted-ink">
          Contando só a coluna <span className="text-ui-strong text-ink">{ROTULO_FONTE[fonte]}</span>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={limparFonte}><X className="mr-1 h-3.5 w-3.5" />Voltar à situação da linha</Button>
        </div>
      )}

      {carregando ? <Skeleton className="h-[88px] w-full" /> : <FaixaEstados contagem={contagem} ativo={estado} onChange={setEstado} />}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchField placeholder="Buscar por razão social ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px] flex-1" />
        <FiltroSelo rotulo="PGDAS" selos={base.map((l) => l.declaracao)} valor={filtroPgdas} onChange={setFiltroPgdas} semSelo="Sem informação" />
        <FiltroSelo rotulo="DAS" selos={base.map((l) => l.dasSelo)} valor={filtroDas} onChange={setFiltroDas} semSelo="Sem DAS (sem declaração)" />
      </div>

      <div ref={topoTabela} className="scroll-mt-16 overflow-x-auto rounded-lg border border-line bg-paper">
        {carregando ? (
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
                <TableHead>Situação PGDAS</TableHead>
                <TableHead>Situação DAS</TableHead>
                <TableHead>Sublimite (RBA)</TableHead>
                <TableHead>Última busca</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pag.recorte.map((l) => {
                const consultando = consulta.emAndamento === l.contact_id;
                const lendo = leitura.emAndamento === l.contact_id;
                const p = l.fat ? percentualLimite(l.fat) : null;
                return (
                  <TableRow key={l.contact_id} className="cursor-pointer" tabIndex={0} aria-label={`Abrir a ficha de ${l.nome}`} onClick={() => setAberto(l.contact_id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) setAberto(l.contact_id); }}>
                    <TableCell className="min-w-[240px] max-w-[360px]">
                      <div className="flex items-start gap-3">
                        <span className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                          <Checkbox aria-label={`Marcar ${l.nome}`} checked={marcados.has(l.contact_id)} onCheckedChange={() => alternarMarcado(l.contact_id)} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-ui text-ink">{l.nome}</p>
                          <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(l.documento)}</p>
                          {rotuloRegime(regimes?.get(l.contact_id)?.regime) && <p className="text-meta text-muted-ink-2">{rotuloRegime(regimes?.get(l.contact_id)?.regime)} ({ano})</p>}
                          {recebeDas(l.contact_id) && <p className="text-meta text-muted-ink-2">Recebe DAS da CA</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[160px]"><SeloMonitor selo={consultando || lendo ? EM_CONSULTA : l.declaracao} /></TableCell>
                    <TableCell className="min-w-[150px]">
                      <div className="space-y-1">
                        <SeloMonitor selo={consultando || lendo ? EM_CONSULTA : l.dasSelo} />
                        {l.das.valor != null && <p className="text-meta text-muted-ink-2">{moeda(l.das.valor)}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {l.fat ? (
                        <div className="space-y-0.5">
                          <p className="text-ui text-ink">{moeda(l.fat.rbt12_total)}</p>
                          <SeloMini selo={l.limite} />
                        </div>
                      ) : <span className="text-meta text-muted-ink-2">Não lido</span>}
                      {p !== null && <span className="sr-only">{pct(p)} do limite</span>}
                    </TableCell>
                    <TableCell><UltimaBusca iso={l.ultimaBusca} /></TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <DicaBotao custo="Consultar" texto={`Consultar: busca na Receita as declarações e os DAS de ${ano} deste cliente, numa só chamada.`}>
                          <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Consultar na Receita" disabled={consultando} onClick={() => consulta.executar(l.contact_id)}>
                            {consultando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                          </Button>
                        </DicaBotao>
                        <DropdownMenu>
                          <DicaBotao texto="Mais ações: DAS de cobrança e regime de apuração. Os documentos, o faturamento e os pagamentos ficam na ficha do cliente (clique na linha).">
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Mais ações"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                          </DicaBotao>
                          <DropdownMenuContent align="end" className="w-[260px]">
                            <DropdownMenuItem onSelect={() => { setMarcados(new Set([l.contact_id])); setCobrancaLote(true); }}>
                              DAS de cobrança de {siglaCompetencia(pa)}<Preco tipo="Emitir" />
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => { setMarcados(new Set([l.contact_id])); setRegimeLote(true); }}>
                              Regime de apuração de {ano}<Preco tipo="Consultar" />
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="space-y-1">
          <RodapeLista mostrando={filtradas.length} total={linhas.length} unidade="clientes do Simples Nacional" filiais={foraDaLista} faixa={pag.faixa} />
          <p className="text-meta text-muted-ink-2">Competência {rotuloCompetencia(pa)}. O sublimite (RBA) aparece na coluna, mas não entra na situação do cliente.</p>
        </div>
        <PaginacaoLista pagina={pag.pagina} totalPaginas={pag.totalPaginas} porPagina={pag.porPagina} total={filtradas.length}
          onPagina={irParaPagina} onPorPagina={pag.setPorPagina} />
      </div>

      {linhaAberta && !verLeitura && (
        <FichaSimplesSheet
          linha={linhaAberta}
          pa={pa}
          hoje={hoje}
          abertura={aberturas.get(linhaAberta.contact_id) ?? null}
          posicao={{ atual: idx >= 0 ? idx + 1 : 1, total: idx >= 0 ? filtradas.length : 1 }}
          onAnterior={idx > 0 ? () => setAberto(filtradas[idx - 1].contact_id) : null}
          onProximo={idx >= 0 && idx < filtradas.length - 1 ? () => setAberto(filtradas[idx + 1].contact_id) : null}
          onClose={() => setAberto(null)}
          consultando={consulta.emAndamento === linhaAberta.contact_id}
          onConsultar={() => consulta.executar(linhaAberta.contact_id)}
          onVerLeitura={() => setVerLeitura(true)}
          onLerFaturamento={() => leitura.executar(linhaAberta.contact_id, pa)}
          lendoFaturamento={leitura.emAndamento === linhaAberta.contact_id}
        />
      )}
      {linhaAberta && verLeitura && (
        <FaturamentoClienteSheet
          nome={linhaAberta.nome}
          documento={formatarCnpj(linhaAberta.documento)}
          contactId={linhaAberta.contact_id}
          faturamento={linhaAberta.fat}
          onClose={() => setVerLeitura(false)}
        />
      )}
      {consulta.dialog}

      <GerarLoteDialog
        aberto={loteAberto}
        onClose={() => setLoteAberto(false)}
        titulo={`Gerar DAS de ${siglaCompetencia(pa)}`}
        descricao="Um DAS por cliente marcado, um de cada vez. Cada emissão fica registrada na Receita; quem já tem DAS guardado e válido não é emitido de novo."
        itens={itensLote}
        executar={async (item, dataPagamento) => {
          const r = await gerarDas.mutateAsync({ contactId: item.contactId, periodo: pa, dataPagamento });
          return { ok: r.ok, jaGerado: r.jaGerado, error: r.semProcuracao ? 'Sem procuração para o PGDAS-D' : r.error };
        }}
      />
      <AcaoLoteDialog
        aberto={consultaLote}
        onClose={() => setConsultaLote(false)}
        titulo={`Consultar PGDAS-D de ${ano}`}
        descricao="Uma consulta por cliente marcado, um de cada vez: traz as declarações e os DAS do ano."
        itens={itensConsulta}
        tipo="Consultar"
        rotuloAcao="Consultar"
        rotuloFeito="Consultado"
        executar={async (item) => {
          const r = await consultarPg.mutateAsync({ contactId: item.contactId, ano });
          return { ok: r.ok, recente: r.recente, error: r.semProcuracao ? 'Sem procuração para o PGDAS-D' : r.error };
        }}
      />
      <GerarLoteDialog
        aberto={cobrancaLote}
        onClose={() => setCobrancaLote(false)}
        titulo={`DAS de cobrança de ${siglaCompetencia(pa)}`}
        descricao="Para período que já foi para o sistema de Cobrança da Receita (o DAS comum não sai mais). Um por cliente marcado, um de cada vez."
        itens={linhas.filter((l) => marcados.has(l.contact_id)).map((l) => ({ contactId: l.contact_id, nome: l.nome, aviso: !l.declaracaoRow ? 'Sem PGDAS-D transmitido no mês: a Receita não gera o DAS.' : null }))}
        comData={false}
        executar={async (item) => {
          const r = await gerarDas.mutateAsync({ contactId: item.contactId, periodo: pa, cobranca: true });
          return { ok: r.ok, error: r.semProcuracao ? 'Sem procuração para o PGDAS-D' : r.error };
        }}
      />
      <AcaoLoteDialog
        aberto={regimeLote}
        onClose={() => setRegimeLote(false)}
        titulo={`Regime de apuração de ${ano}`}
        descricao="Uma consulta por cliente marcado: se optou pelo regime de caixa ou de competência no ano."
        itens={linhas.filter((l) => marcados.has(l.contact_id)).map((l) => ({
          contactId: l.contact_id, nome: l.nome, pular: regimes?.get(l.contact_id)?.consultado_em?.slice(0, 10) === hoje ? 'Consultado hoje' : null,
        }))}
        tipo="Consultar"
        rotuloAcao="Consultar"
        rotuloFeito="Consultado"
        executar={async (item) => {
          const r = await consultarRegime.mutateAsync({ contactId: item.contactId, ano });
          return { ok: r.ok && !r.foraDoMonitoramento, error: r.semProcuracao ? 'Sem procuração para o regime de apuração' : r.error, resumo: rotuloRegime(r.regime) ?? undefined };
        }}
      />
      <BaixarLoteDialog
        aberto={baixarAberto}
        onClose={() => setBaixarAberto(false)}
        contactIds={[...marcados]}
        competencia={pa}
        referencia={`competência ${siglaCompetencia(pa)}`}
        opcoes={[
          { tipo: 'pgdasd_das', rotulo: 'DAS gerados' },
          { tipo: 'pgdasd_recibo', rotulo: 'Recibos do PGDAS-D' },
          { tipo: 'pgdasd_declaracao', rotulo: 'Declarações do PGDAS-D' },
          { tipo: 'comprovante', rotulo: 'Comprovantes de pagamento' },
        ]}
      />
      <EnviarGuiasDialog
        aberto={envioAberto}
        onClose={() => setEnvioAberto(false)}
        titulo={`Conferir e enviar DAS de ${siglaCompetencia(pa)}`}
        processo="das"
        competencia={pa}
        itens={itensEnvio}
        assuntoPadrao={`DAS do Simples Nacional ${siglaCompetencia(pa)} · {cliente}`}
        mensagemPadrao={`Olá! Segue o DAS do Simples Nacional de ${siglaCompetencia(pa)} da {cliente}. Qualquer dúvida, é só responder este e-mail.\n\nContabilidade Alves`}
      />
    </div>
  );
}

// ---------------------------------------------------------------- aba DEFIS

function AbaDefis({
  busca, setBusca, estado, setEstado, responsaveis, carregandoCadastro,
}: {
  busca: string; setBusca: (v: string) => void;
  estado: ReturnType<typeof useEstadoUrl>[0]; setEstado: ReturnType<typeof useEstadoUrl>[1];
  responsaveis: Map<string, ResponsavelCliente>; carregandoCadastro: boolean;
}) {
  const anoMax = new Date().getFullYear() - 1; // a DEFIS do ano em curso só existe depois do fim do ano
  const [ano, setAno] = useState(anoMax);
  const { data: linhas = [], isLoading } = useMatrizDefis();
  const consulta = useConsultaDefis();
  const { ocupado, abrir } = useAbrirDefis();
  const prazo = prazoDefis(ano);
  const sel = useSelecao();
  const consultarDefis = useConsultarDefis();
  const [consultaLote, setConsultaLote] = useState(false);
  const [baixarAberto, setBaixarAberto] = useState(false);
  const [filtroSituacao, setFiltroSituacao] = useState<string | null>(null);
  const hojeIso = hojeBR();

  const seloDe = (l: LinhaDefis): Selo | null => (consulta.emAndamento === l.contact_id
    ? { estado: 'processando', motivo: 'Consultando…' }
    : seloDefis(statusDefis(l, ano), ano, prazo));

  // Filial (a DEFIS é da matriz) e empresa aberta depois do ano-calendário não têm DEFIS daquele ano: ficam fora da lista e da conta.
  const base = useMemo(
    () => linhas.filter((l) => !l.filial && statusDefis(l, ano) !== 'nao_se_aplica' && bate(busca, l.nome, l.documento)),
    [linhas, ano, busca],
  );
  const contagem = contarEstados(base.map(seloDe));
  const filtradas = base
    .filter((l) => !estado || seloDe(l)?.estado === estado)
    .filter((l) => passaFiltroSelo(seloDe(l), filtroSituacao, motivoDoSelo))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const pag = usePaginacao(filtradas, `${busca}|${estado ?? ''}|${filtroSituacao ?? ''}|${ano}`);
  const topoTabela = useRef<HTMLDivElement>(null);
  const irParaPagina = (n: number) => {
    pag.setPagina(n);
    requestAnimationFrame(() => topoTabela.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const idsDaPagina = pag.recorte.map((l) => l.contact_id);

  const tabelaExport = (): TabelaExport => ({
    arquivo: `defis-${ano}`,
    titulo: `DEFIS — ano-calendário ${ano} (prazo ${format(prazo, 'dd/MM/yyyy')})`,
    colunas: ['Razão social', 'CNPJ', 'Responsável', 'Situação', 'Estado', 'Nº da DEFIS', 'Tipo', 'Transmissão', 'Última busca'],
    linhas: filtradas.map((l) => {
      const d = defisDoAno(l, ano);
      const s = seloDe(l);
      return [
        l.nome, formatarCnpj(l.documento), responsaveis.get(l.contact_id)?.nome ?? '', s?.motivo ?? '', s ? ROTULO_ESTADO[s.estado] : '',
        d?.id_defis ?? '', d ? TIPO_DEFIS[d.tipo] : '', d?.transmitida_em ? format(new Date(d.transmitida_em), 'dd/MM/yyyy HH:mm') : '',
        l.consultadoEm ? format(new Date(l.consultadoEm), 'dd/MM/yyyy HH:mm') : '',
      ];
    }),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2 self-start rounded-lg border border-line bg-paper p-1.5">
          <DicaBotao texto="Volta para o ano-calendário anterior.">
            <Button size="icon" variant="ghost" className="h-9 w-9" disabled={ano <= 2018} onClick={() => setAno(ano - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          </DicaBotao>
          <div className="min-w-[200px] text-center">
            <p className="text-[15px] font-medium text-ink">Ano-calendário {ano}</p>
            <p className="text-meta text-muted-ink-2">Prazo: {format(prazo, 'dd/MM/yyyy')}</p>
          </div>
          <DicaBotao texto={ano >= anoMax ? 'Este já é o último ano que pode ter DEFIS.' : 'Avança para o ano-calendário seguinte.'}>
            <Button size="icon" variant="ghost" className="h-9 w-9" disabled={ano >= anoMax} onClick={() => setAno(ano + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </DicaBotao>
        </div>
        <ExportarMenu montar={tabelaExport} disabled={filtradas.length === 0} escolherColunas />
      </div>

      {isLoading || carregandoCadastro ? <Skeleton className="h-[88px] w-full" /> : <FaixaEstados contagem={contagem} ativo={estado} onChange={setEstado} />}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchField placeholder="Buscar por razão social ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px] flex-1" />
        <FiltroSelo rotulo="Situação" selos={base.map(seloDe)} valor={filtroSituacao} onChange={setFiltroSituacao} chave={motivoDoSelo} semSelo="Sem informação" />
      </div>

      <BarraSelecao quantos={sel.marcados.size} onLimpar={sel.limpar}>
        {filtradas.some((l) => !sel.marcados.has(l.contact_id)) && filtradas.length > pag.recorte.length && (
          <DicaBotao texto="Marca todos os clientes da lista com os filtros atuais, inclusive os das outras páginas.">
            <Button size="sm" variant="outline" onClick={() => sel.somar(filtradas.map((l) => l.contact_id))}>Marcar os {filtradas.length} da lista</Button>
          </DicaBotao>
        )}
        <DicaBotao custo="Consultar" texto="Consulta na Receita as DEFIS de cada cliente marcado (todos os anos numa chamada). Quem já foi consultado hoje fica de fora.">
          <Button size="sm" onClick={() => setConsultaLote(true)}>Consultar DEFIS ({sel.marcados.size})</Button>
        </DicaBotao>
        <DicaBotao texto="Baixa num ZIP as declarações e os recibos da DEFIS já guardados. Não consulta a Receita.">
          <Button size="sm" variant="outline" onClick={() => setBaixarAberto(true)}>Baixar</Button>
        </DicaBotao>
      </BarraSelecao>

      <div ref={topoTabela} className="scroll-mt-16 overflow-x-auto rounded-lg border border-line bg-paper">
        {isLoading || carregandoCadastro ? (
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
                <TableHead>Nº da DEFIS</TableHead>
                <TableHead>Transmissão</TableHead>
                <TableHead>Última busca</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pag.recorte.map((l) => {
                const d = defisDoAno(l, ano);
                const consultando = consulta.emAndamento === l.contact_id;
                return (
                  <TableRow key={l.contact_id}>
                    <TableCell className="min-w-[240px] max-w-[360px]">
                      <div className="flex items-start gap-3">
                        <span className="pt-0.5"><Checkbox aria-label={`Marcar ${l.nome}`} checked={sel.marcados.has(l.contact_id)} onCheckedChange={() => sel.alternar(l.contact_id)} /></span>
                        <div className="min-w-0">
                          <p className="text-ui text-ink">{l.nome}</p>
                          <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(l.documento)}{l.anoAbertura ? ` · aberta em ${l.anoAbertura}` : ''}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[170px]"><SeloMonitor selo={seloDe(l)} /></TableCell>
                    <TableCell className="font-mono text-ui">{d?.id_defis ?? '—'}{d && d.tipo >= 3 && <span className="ml-1 text-meta text-muted-ink-2">(situação especial)</span>}</TableCell>
                    <TableCell className="whitespace-nowrap text-ui text-muted-ink">{d?.transmitida_em ? format(new Date(d.transmitida_em), 'dd/MM/yyyy HH:mm') : '—'}</TableCell>
                    <TableCell><UltimaBusca iso={l.consultadoEm} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {d && (
                          <>
                            <DicaBotao custo={d.declaracao_path ? undefined : 'Consultar'} texto={d.declaracao_path ? 'Abre o PDF da DEFIS, já guardado.' : 'Baixa da Receita o PDF da DEFIS e guarda.'}>
                              <Button size="icon" variant="ghost" className="h-8 w-8" disabled={ocupado === `${d.id}:declaracao`} onClick={() => abrir(d, l.contact_id, 'declaracao')}>
                                {ocupado === `${d.id}:declaracao` ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                              </Button>
                            </DicaBotao>
                            <DicaBotao custo={d.recibo_path ? undefined : 'Consultar'} texto={d.recibo_path ? 'Abre o recibo da DEFIS, já guardado.' : 'Baixa da Receita o recibo da DEFIS e guarda.'}>
                              <Button size="icon" variant="ghost" className="h-8 w-8" disabled={ocupado === `${d.id}:recibo`} onClick={() => abrir(d, l.contact_id, 'recibo')}>
                                {ocupado === `${d.id}:recibo` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                              </Button>
                            </DicaBotao>
                          </>
                        )}
                        <DicaBotao custo="Consultar" texto="Consultar: busca na Receita todas as DEFIS deste cliente, de todos os anos, numa só chamada.">
                          <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Consultar na Receita" disabled={consultando} onClick={() => consulta.executar(l.contact_id)}>
                            {consultando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
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

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="space-y-1">
          <RodapeLista mostrando={filtradas.length} total={base.length} unidade="clientes do Simples Nacional" faixa={pag.faixa} />
          <p className="text-meta text-muted-ink-2">Ano-calendário {ano}. "Não entregue" não considera se o cliente estava no Simples naquele ano: confira antes de cobrar.</p>
        </div>
        <PaginacaoLista pagina={pag.pagina} totalPaginas={pag.totalPaginas} porPagina={pag.porPagina} total={filtradas.length}
          onPagina={irParaPagina} onPorPagina={pag.setPorPagina} />
      </div>
      {consulta.dialog}
      <AcaoLoteDialog
        aberto={consultaLote}
        onClose={() => setConsultaLote(false)}
        titulo="Consultar DEFIS"
        descricao="Uma consulta por cliente marcado, um de cada vez: traz as DEFIS de todos os anos."
        itens={linhas.filter((l) => sel.marcados.has(l.contact_id)).map((l) => ({
          contactId: l.contact_id, nome: l.nome, pular: l.consultadoEm && l.consultadoEm.slice(0, 10) === hojeIso ? 'Consultado hoje' : null,
        }))}
        tipo="Consultar"
        rotuloAcao="Consultar"
        rotuloFeito="Consultado"
        executar={async (item) => {
          const r = await consultarDefis.mutateAsync({ contactId: item.contactId });
          return { ok: r.ok, recente: r.recente, error: r.semProcuracao ? 'Sem procuração para a DEFIS' : r.error };
        }}
      />
      <BaixarLoteDialog
        aberto={baixarAberto}
        onClose={() => setBaixarAberto(false)}
        contactIds={[...sel.marcados]}
        ano={ano}
        referencia={`ano-calendário ${ano}`}
        opcoes={[{ tipo: 'defis_declaracao', rotulo: 'Declarações da DEFIS' }, { tipo: 'defis_recibo', rotulo: 'Recibos da DEFIS' }]}
      />
    </div>
  );
}
