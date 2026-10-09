import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, FileText, Loader2, MoreHorizontal, Receipt, RefreshCw, Search, X } from 'lucide-react';

import { DsTab, PageHeader, SearchField } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CompetenciaNav } from '@/components/serpro/CompetenciaNav';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { FaturamentoClienteSheet } from '@/components/serpro/FaturamentoClienteSheet';
import { FichaSimplesSheet } from '@/components/serpro/FichaSimplesSheet';
import { useAbrirArquivo, useConsultaPgdasd } from '@/components/serpro/pgdasdUi';
import { useAbrirDefis, useConsultaDefis } from '@/components/serpro/defisUi';
import { useLeituraFaturamento } from '@/components/serpro/useLeituraFaturamento';
import { formatarCnpj } from '@/components/gestao360/ClienteFiltro';
import { FaixaEstados, SeloMini, SeloMonitor, UltimaBusca, useEstadoUrl } from '@/components/monitor/MonitorUi';
import { useBuscaInicial } from '@/hooks/useBuscaInicial';
import { useCadastroMonitor } from '@/hooks/useSituacaoCarteira';
import { competenciaPadrao, mesDeData, rotuloCompetencia, siglaCompetencia, useMatrizPagamentos } from '@/hooks/useSerproPagamentos';
import { anoDe, useMatrizPgdasd } from '@/hooks/useSerproPgdasd';
import { percentualLimite, useFaturamentoAno } from '@/hooks/useSerproFaturamento';
import { TIPO_DEFIS, defisDoAno, prazoDefis, statusDefis, useMatrizDefis, type LinhaDefis } from '@/hooks/useSerproDefis';
import { ROTULO_ESTADO, contarEstados, seloDefis, type Selo } from '@/lib/monitorEstados';
import { montarLinhasSimples, seloDaFonte, type FonteSimples, type LinhaSimples } from '@/lib/simplesNacionalLinhas';
import { digitos, type ResponsavelCliente } from '@/lib/situacaoCarteira';
import { hojeBR } from '@/lib/prazosFederais';
import type { TabelaExport } from '@/lib/exportarTabela';

type Aba = 'mensal' | 'defis';

const ROTULO_FONTE: Record<Exclude<FonteSimples, 'situacao'>, string> = { declaracao: 'Declaração', das: 'DAS', limite: 'Limite do Simples' };
const moeda = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const pct = (v: number | null) => (v === null ? '' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);

function bate(busca: string, nome: string, documento: string) {
  const q = busca.trim().toLowerCase();
  if (!q) return true;
  const qd = q.replace(/\D/g, '');
  return nome.toLowerCase().includes(q) || (!!qd && digitos(documento).includes(qd));
}

/**
 * Simples Nacional (Rodada 2, 08/10/2026): junta as telas PGDAS, Faturamento e DEFIS no molde único do Monitoramento.
 * Aba Mensal: uma linha por cliente com declaração, DAS e limite da competência. Aba DEFIS: a declaração anual.
 * Pagamentos (DARF e DAE de todos os regimes) continua na tela própria.
 */
export default function SimplesNacionalFederal() {
  const [params, setParams] = useSearchParams();
  const aba: Aba = params.get('aba') === 'defis' ? 'defis' : 'mensal';
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
      <PageHeader kicker="~/dashboard fiscal · simples nacional" title="Simples Nacional." />

      <div className="flex gap-1 border-b border-line">
        <DsTab active={aba === 'mensal'} onClick={() => irPara('mensal')}>Mensal</DsTab>
        <DsTab active={aba === 'defis'} onClick={() => irPara('defis')}>DEFIS</DsTab>
      </div>

      {aba === 'mensal' ? (
        <AbaMensal
          busca={busca} setBusca={setBusca} estado={estado} setEstado={setEstado}
          fonte={fonte} limparFonte={() => mudar((n) => { n.delete('fonte'); n.delete('estado'); })}
          responsaveis={responsaveis} aberturas={aberturas} carregandoCadastro={carregandoCadastro}
        />
      ) : (
        <AbaDefis busca={busca} setBusca={setBusca} estado={estado} setEstado={setEstado} responsaveis={responsaveis} carregandoCadastro={carregandoCadastro} />
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
  const { ocupado, abrirDeclaracao } = useAbrirArquivo();
  const [aberto, setAberto] = useState<string | null>(null);
  const [verLeitura, setVerLeitura] = useState(false);

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
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const idx = filtradas.findIndex((l) => l.contact_id === aberto);
  const linhaAberta = idx >= 0 ? filtradas[idx] : linhas.find((l) => l.contact_id === aberto) ?? null;
  const carregando = carregandoPg || carregandoPag || carregandoFat || carregandoCadastro;
  const foraDaLista = pgdas.filter((l) => l.filial).length;

  const tabelaExport = (): TabelaExport => ({
    arquivo: `simples-nacional-${pa}`,
    titulo: `Simples Nacional — competência ${siglaCompetencia(pa)}`,
    colunas: ['Razão social', 'CNPJ', 'Responsável', 'Situação', 'Estado', 'Declaração', 'Nº da declaração', 'DAS', 'Vencimento do DAS', 'Valor do DAS', 'Últimos 12 meses', '% do limite', 'Limite', 'Última busca'],
    linhas: filtradas.map((l) => [
      l.nome, formatarCnpj(l.documento), l.responsavel?.nome ?? '', l.situacao?.motivo ?? '', l.situacao ? ROTULO_ESTADO[l.situacao.estado] : '',
      l.declMes?.motivo ?? '', l.declaracaoRow?.numero_declaracao ?? '', l.dasSelo?.motivo ?? '',
      l.das.vencimento ? format(new Date(`${l.das.vencimento}T00:00:00`), 'dd/MM/yyyy') : '', l.das.valor != null ? moeda(l.das.valor) : '',
      l.fat ? moeda(l.fat.rbt12_total) : '', l.fat ? pct(percentualLimite(l.fat)) : '', l.limite?.motivo ?? '',
      l.ultimaBusca ? format(new Date(l.ultimaBusca), 'dd/MM/yyyy HH:mm') : '',
    ]),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <CompetenciaNav competencia={pa} onChange={setPa} limite={mesDeData(new Date())} />
        <ExportarMenu montar={tabelaExport} disabled={filtradas.length === 0} escolherColunas />
      </div>

      {fonte !== 'situacao' && (
        <div className="flex items-center gap-2 text-meta text-muted-ink">
          Contando só a coluna <span className="text-ui-strong text-ink">{ROTULO_FONTE[fonte]}</span>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={limparFonte}><X className="mr-1 h-3.5 w-3.5" />Voltar à situação da linha</Button>
        </div>
      )}

      {carregando ? <Skeleton className="h-[88px] w-full" /> : <FaixaEstados contagem={contagem} ativo={estado} onChange={setEstado} />}

      <SearchField placeholder="Buscar por razão social ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px]" />

      <div className="overflow-x-auto rounded-lg border border-line bg-paper">
        {carregando ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtradas.length === 0 ? (
          <div className="p-10 text-center text-ui text-muted-ink">Nenhum cliente nesta situação.</div>
        ) : (
          <Table className="[&_td]:px-3 [&_th]:px-3">
            <TableHeader>
              <TableRow>
                <TableHead>Situação</TableHead>
                <TableHead>Declaração e DAS</TableHead>
                <TableHead>Últimos 12 meses</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Última busca</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((l) => {
                const consultando = consulta.emAndamento === l.contact_id;
                const lendo = leitura.emAndamento === l.contact_id;
                const d = l.declaracaoRow;
                const p = l.fat ? percentualLimite(l.fat) : null;
                return (
                  <TableRow key={l.contact_id} className="cursor-pointer" onClick={() => setAberto(l.contact_id)}>
                    <TableCell className="min-w-[160px]"><SeloMonitor selo={seloDe(l)} outros={fonte === 'situacao' ? l.outros : []} /></TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <SeloMini selo={l.declMes} />
                        <span className="flex flex-wrap items-center gap-1.5">
                          <SeloMini selo={l.dasSelo} vazio="" />
                          {l.das.valor != null && <span className="text-meta text-muted-ink-2">{moeda(l.das.valor)}</span>}
                        </span>
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
                    <TableCell className="min-w-[180px] max-w-[260px]">
                      <p className="text-ui text-ink">{l.nome}</p>
                      <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(l.documento)}</p>
                    </TableCell>
                    <TableCell><UltimaBusca iso={l.ultimaBusca} /></TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <DicaBotao texto="Abre a ficha do cliente: mês a mês, documentos, faturamento e envios. Não consulta a Receita.">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setAberto(l.contact_id)}><Search className="h-4 w-4" /></Button>
                        </DicaBotao>
                        <DicaBotao custo="Consultar" texto={`Consultar: busca na Receita as declarações e os DAS de ${ano} deste cliente, numa só chamada.`}>
                          <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Consultar na Receita" disabled={consultando} onClick={() => consulta.executar(l.contact_id)}>
                            {consultando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                          </Button>
                        </DicaBotao>
                        <DropdownMenu>
                          <DicaBotao texto="Mais ações: documentos da declaração, leitura do faturamento e pagamentos.">
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8">{lendo || (d && ocupado?.startsWith(d.id)) ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}</Button>
                            </DropdownMenuTrigger>
                          </DicaBotao>
                          <DropdownMenuContent align="end" className="w-[260px]">
                            <DropdownMenuItem disabled={!d} onSelect={() => d && abrirDeclaracao(d, 'declaracao')}>
                              <FileText className="mr-2 h-4 w-4" />Declaração em PDF{d && !d.declaracao_path && <Preco tipo="Consultar" />}
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={!d} onSelect={() => d && abrirDeclaracao(d, 'recibo')}>
                              <Receipt className="mr-2 h-4 w-4" />Recibo de entrega{d && !d.recibo_path && <Preco tipo="Consultar" />}
                            </DropdownMenuItem>
                            {d?.maed_notificacao_path && <DropdownMenuItem onSelect={() => abrirDeclaracao(d, 'maed_notificacao')}>Notificação da multa (MAED)</DropdownMenuItem>}
                            {d?.maed_darf_path && <DropdownMenuItem onSelect={() => abrirDeclaracao(d, 'maed_darf')}>DARF da multa (MAED)</DropdownMenuItem>}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled={!d || lendo} onSelect={() => leitura.executar(l.contact_id, pa)}>
                              {l.fat && l.fat.periodo_apuracao.slice(0, 7) === pa ? 'Reler faturamento' : 'Ler faturamento'}{d && !d.declaracao_path && <Preco tipo="Consultar" />}
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to={`/dashboard-federal/pagamentos?q=${digitos(l.documento)}`}>Pagamentos e comprovantes</Link>
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

      <p className="text-meta text-muted-ink-2">
        Mostrando {filtradas.length} de {linhas.length} clientes do Simples Nacional · {rotuloCompetencia(pa)}
        {foraDaLista > 0 ? ` · ${foraDaLista} ${foraDaLista === 1 ? 'filial segue' : 'filiais seguem'} a matriz e ficam de fora` : ''}.
        O limite aparece na coluna, mas não entra na situação da linha.
      </p>

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

  const seloDe = (l: LinhaDefis): Selo | null => (consulta.emAndamento === l.contact_id
    ? { estado: 'processando', motivo: 'Consultando…' }
    : seloDefis(statusDefis(l, ano), ano, prazo));

  // Filial (a DEFIS é da matriz) e empresa aberta depois do ano-calendário não têm DEFIS daquele ano: ficam fora da lista e da conta.
  const base = useMemo(
    () => linhas.filter((l) => !l.filial && statusDefis(l, ano) !== 'nao_se_aplica' && bate(busca, l.nome, l.documento)),
    [linhas, ano, busca],
  );
  const contagem = contarEstados(base.map(seloDe));
  const filtradas = base.filter((l) => !estado || seloDe(l)?.estado === estado).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

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

      <SearchField placeholder="Buscar por razão social ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px]" />

      <div className="overflow-x-auto rounded-lg border border-line bg-paper">
        {isLoading || carregandoCadastro ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtradas.length === 0 ? (
          <div className="p-10 text-center text-ui text-muted-ink">Nenhum cliente nesta situação.</div>
        ) : (
          <Table className="[&_td]:px-3 [&_th]:px-3">
            <TableHeader>
              <TableRow>
                <TableHead>Situação</TableHead>
                <TableHead>Nº da DEFIS</TableHead>
                <TableHead>Transmissão</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Última busca</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((l) => {
                const d = defisDoAno(l, ano);
                const consultando = consulta.emAndamento === l.contact_id;
                return (
                  <TableRow key={l.contact_id}>
                    <TableCell className="min-w-[170px]"><SeloMonitor selo={seloDe(l)} /></TableCell>
                    <TableCell className="font-mono text-ui">{d?.id_defis ?? '—'}{d && d.tipo >= 3 && <span className="ml-1 text-meta text-muted-ink-2">(situação especial)</span>}</TableCell>
                    <TableCell className="whitespace-nowrap text-ui text-muted-ink">{d?.transmitida_em ? format(new Date(d.transmitida_em), 'dd/MM/yyyy HH:mm') : '—'}</TableCell>
                    <TableCell className="min-w-[220px]">
                      <p className="text-ui text-ink">{l.nome}</p>
                      <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(l.documento)}{l.anoAbertura ? ` · aberta em ${l.anoAbertura}` : ''}</p>
                    </TableCell>
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

      <p className="text-meta text-muted-ink-2">
        Mostrando {filtradas.length} de {base.length} clientes do Simples Nacional · ano-calendário {ano}. "Não entregue" não considera se o cliente estava no Simples naquele ano: confira antes de cobrar.
      </p>
      {consulta.dialog}
    </div>
  );
}
