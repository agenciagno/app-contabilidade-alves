import { useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { FileBadge, Loader2, Mail, MoreHorizontal, Receipt, Wallet } from 'lucide-react';

import { SearchField } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CompetenciaNav } from '@/components/serpro/CompetenciaNav';
import { AcoesEmLoteDialog, BotaoAcoesEmLote } from '@/components/monitor/AcoesEmLote';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { ExportarMenu } from '@/components/serpro/ExportarMenu';
import { usePagamentosClienteJanela } from '@/components/serpro/PagamentosDoCliente';
import { FaixaEstados, PaginacaoLista, RodapeLista, SeloMini, SeloMonitor, UltimaBusca, useEstadoUrl, usePaginacao } from '@/components/monitor/MonitorUi';
import {
  AcaoLoteDialog, BaixarLoteDialog, BarraSelecao, EnviarGuiasDialog, GerarLoteDialog, useSelecao, type ItemEnvio, type ItemLote,
} from '@/components/monitor/GuiasLote';
import { useGuiasEnviadas, useMarcacoesGuia, useMarcarGuia } from '@/hooks/useGuiasCliente';
import {
  dasMeiValido, ultimaBuscaMei, useDividaAtivaMei, useEmitirCcmei, useGerarDasMei, useLinkMei, useMatrizMei, useSituacaoMei, type LinhaMei,
} from '@/hooks/useSerproMei';
import { competenciaPadrao, mesDeData, siglaCompetencia } from '@/hooks/useSerproPagamentos';
import { abrirPdf } from '@/hooks/useSerproPgdasd';
import { ROTULO_ESTADO, contarEstados, piorSelo, type Selo } from '@/lib/monitorEstados';
import { hojeBR } from '@/lib/prazosFederais';
import type { TabelaExport } from '@/lib/exportarTabela';

const formatarCnpj = (d: string) => {
  const n = d.replace(/\D/g, '');
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Situação no MEI (CCMEI): fora do MEI é atenção. */
function seloEnquadramento(l: LinhaMei): Selo | null {
  if (!l.situacao) return { estado: 'nao_verificado', motivo: 'Situação não consultada' };
  if (l.situacao.optante_mei === false) return { estado: 'atencao', motivo: 'Fora do MEI' };
  return { estado: 'em_dia', motivo: l.situacao.situacao_cadastral ? `Ativo no MEI · ${l.situacao.situacao_cadastral}` : 'Ativo no MEI' };
}
/** Dívida ativa do ano (PGMEI): qualquer débito é atenção. */
function seloDivida(l: LinhaMei, ano: number): Selo | null {
  if (!l.divida) return { estado: 'nao_verificado', motivo: `Dívida ativa ${ano} não consultada` };
  if (l.divida.total > 0) return { estado: 'atencao', motivo: `Dívida ativa ${moeda(l.divida.total)}` };
  return { estado: 'em_dia', motivo: `Sem dívida ativa em ${ano}` };
}

/**
 * Aba MEI do Simples Nacional (Rodada 4, 09/10/2026; decisão de Gabriel: aba dentro do Simples, sem rota nova).
 * Selo da linha = o pior entre a situação no MEI e a dívida ativa do ano. O DAS do MEI aparece na coluna e não entra na situação
 * (o MEI pode pagar pelo app; DAS não gerado não é obrigação descumprida).
 */
export function AbaMei() {
  const { abrir: abrirPagamentos, janela: janelaPagamentos } = usePagamentosClienteJanela();
  const [pa, setPa] = useState(competenciaPadrao());
  const ano = Number(pa.slice(0, 4));
  const hoje = hojeBR();
  const { data: linhas = [], isLoading } = useMatrizMei(ano);
  const [estado, setEstado] = useEstadoUrl();
  const [busca, setBusca] = useState('');
  const sel = useSelecao();
  const gerarDas = useGerarDasMei();
  const divida = useDividaAtivaMei();
  const ccmei = useEmitirCcmei();
  const situacao = useSituacaoMei();
  const link = useLinkMei();
  const { data: marcacoes } = useMarcacoesGuia();
  const marcar = useMarcarGuia();
  const { data: enviadas } = useGuiasEnviadas('das_mei', pa);
  const [lote, setLote] = useState<'das' | 'divida' | 'situacao' | 'ccmei' | null>(null);
  const [envioAberto, setEnvioAberto] = useState(false);
  const [baixarAberto, setBaixarAberto] = useState(false);
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [acoesLote, setAcoesLote] = useState(false);

  const seloDe = (l: LinhaMei): Selo | null => piorSelo([seloEnquadramento(l), seloDivida(l, ano)]);
  const base = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qd = q.replace(/\D/g, '');
    return linhas.filter((l) => !q || l.nome.toLowerCase().includes(q) || (!!qd && l.documento.replace(/\D/g, '').includes(qd)));
  }, [linhas, busca]);
  const contagem = contarEstados(base.map(seloDe));
  const filtradas = base.filter((l) => !estado || seloDe(l)?.estado === estado).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const pag = usePaginacao(filtradas, `${busca}|${estado ?? ''}|${pa}`);
  const topoTabela = useRef<HTMLDivElement>(null);
  const irParaPagina = (n: number) => {
    pag.setPagina(n);
    requestAnimationFrame(() => topoTabela.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const idsDaPagina = pag.recorte.map((l) => l.contact_id);
  const marcadas = linhas.filter((l) => sel.marcados.has(l.contact_id));
  const quemRecebe = linhas.filter((l) => !!marcacoes?.get(l.contact_id)?.das);
  const hojeDe = (iso?: string | null) => (iso ?? '').slice(0, 10) === hoje;

  const itensEnvio: ItemEnvio[] = quemRecebe.flatMap((l) => {
    const d = dasMeiValido(l, pa, hoje) ?? l.das.find((x) => x.periodo.slice(0, 7) === pa);
    if (!d) return [];
    return [{
      contactId: l.contact_id, nome: l.nome, email: marcacoes?.get(l.contact_id)?.email ?? null,
      documento: { tipo: 'mei_das', id: d.id },
      rotulo: `DAS do MEI ${siglaCompetencia(pa)}${d.vencimento ? ` · vence ${ddmm(d.vencimento)}` : ''}${d.valor_total != null ? ` · ${moeda(d.valor_total)}` : ''}`,
      enviadoEm: enviadas?.get(d.id) ?? null,
    }];
  });
  const aEnviar = itensEnvio.filter((i) => i.email && !i.enviadoEm).length;

  const abrir = async (tipo: 'das' | 'ccmei', id: string) => {
    setAbrindo(id);
    try {
      const r = await link.mutateAsync({ tipo, id });
      if (r.ok && r.url) abrirPdf(r.url); else toast.error(r.error ?? 'Não foi possível abrir o arquivo.');
    } catch (e) { toast.error((e as Error)?.message || 'Não foi possível abrir o arquivo.'); } finally { setAbrindo(null); }
  };

  const tabelaExport = (): TabelaExport => ({
    arquivo: `mei-${pa}`,
    titulo: `MEI — competência ${siglaCompetencia(pa)}`,
    colunas: ['Razão social', 'CNPJ', 'Situação', 'Estado', 'Situação no MEI', `Dívida ativa ${ano}`, `DAS ${siglaCompetencia(pa)}`, 'Vencimento do DAS', 'Valor do DAS'],
    linhas: filtradas.map((l) => {
      const s = seloDe(l);
      const d = l.das.find((x) => x.periodo.slice(0, 7) === pa);
      return [
        l.nome, formatarCnpj(l.documento), s?.motivo ?? '', s ? ROTULO_ESTADO[s.estado] : '', seloEnquadramento(l)?.motivo ?? '',
        l.divida ? moeda(l.divida.total) : 'Não consultada', d ? 'Gerado' : '', d?.vencimento ? format(new Date(`${d.vencimento}T00:00:00`), 'dd/MM/yyyy') : '', d?.valor_total != null ? moeda(d.valor_total) : '',
      ];
    }),
  });

  const loteItens = (pular: (l: LinhaMei) => string | null, guardada?: (l: LinhaMei) => boolean): ItemLote[] =>
    marcadas.map((l) => ({ contactId: l.contact_id, nome: l.nome, pular: pular(l), guardada: guardada?.(l) }));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <CompetenciaNav competencia={pa} onChange={(v) => { setPa(v); sel.limpar(); }} limite={mesDeData(new Date())} />
        <div className="flex flex-wrap items-center gap-2">
          <BotaoAcoesEmLote onClick={() => setAcoesLote(true)} disabled={linhas.length === 0} />
          <DicaBotao texto="Lista os DAS do MEI já gerados dos clientes que recebem DAS pela CA, para conferir e mandar por e-mail.">
            <Button variant="outline" size="sm" className="h-10" onClick={() => setEnvioAberto(true)}>
              <Mail className="mr-1.5 h-4 w-4" />Conferir e enviar{aEnviar ? ` (${aEnviar})` : ''}
            </Button>
          </DicaBotao>
          <ExportarMenu montar={tabelaExport} disabled={filtradas.length === 0} escolherColunas />
        </div>
      </div>

      {isLoading ? <Skeleton className="h-[88px] w-full" /> : <FaixaEstados contagem={contagem} ativo={estado} onChange={setEstado} />}

      <SearchField placeholder="Buscar por razão social ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="max-w-[429px]" />

      <BarraSelecao quantos={sel.marcados.size} onLimpar={sel.limpar}>
        {filtradas.some((l) => !sel.marcados.has(l.contact_id)) && filtradas.length > pag.recorte.length && (
          <DicaBotao texto="Marca todos os clientes da lista com os filtros atuais, inclusive os das outras páginas.">
            <Button size="sm" variant="outline" onClick={() => sel.somar(filtradas.map((l) => l.contact_id))}>Marcar os {filtradas.length} da lista</Button>
          </DicaBotao>
        )}
        <DicaBotao custo="Emitir" texto="Gera o DAS do MEI de cada cliente marcado. Quem já tem DAS guardado e válido não é emitido de novo.">
          <Button size="sm" onClick={() => setLote('das')}>Gerar DAS ({sel.marcados.size})</Button>
        </DicaBotao>
        <DicaBotao custo="Consultar" texto={`Consulta na Receita os débitos de ${ano} em dívida ativa de cada MEI marcado.`}>
          <Button size="sm" variant="outline" onClick={() => setLote('divida')}>Dívida ativa</Button>
        </DicaBotao>
        <DicaBotao custo="Consultar" texto="Consulta a situação cadastral e o enquadramento no MEI de cada cliente marcado.">
          <Button size="sm" variant="outline" onClick={() => setLote('situacao')}>Situação no MEI</Button>
        </DicaBotao>
        <DicaBotao custo="Emitir" texto="Emite o Certificado da Condição de MEI (CCMEI) de cada cliente marcado.">
          <Button size="sm" variant="outline" onClick={() => setLote('ccmei')}>Emitir CCMEI</Button>
        </DicaBotao>
        <DicaBotao texto="Baixa num ZIP os DAS do MEI e os CCMEI já guardados. Não consulta a Receita.">
          <Button size="sm" variant="outline" onClick={() => setBaixarAberto(true)}>Baixar</Button>
        </DicaBotao>
        <Button size="sm" variant="ghost" disabled={marcar.isPending} onClick={() => marcar.mutate({ contactIds: [...sel.marcados], processo: 'das', valor: true })}>Marcar "recebe DAS da CA"</Button>
      </BarraSelecao>

      <div ref={topoTabela} className="scroll-mt-16 overflow-x-auto rounded-lg border border-line bg-paper">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtradas.length === 0 ? (
          <div className="p-10 text-center text-ui text-muted-ink">{linhas.length ? 'Nenhum cliente nesta situação.' : 'Nenhum cliente ativo com regime MEI no cadastro.'}</div>
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
                <TableHead>DAS {siglaCompetencia(pa)}</TableHead>
                <TableHead>Dívida ativa {ano}</TableHead>
                <TableHead>No MEI</TableHead>
                <TableHead>Última busca</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pag.recorte.map((l) => {
                const d = l.das.find((x) => x.periodo.slice(0, 7) === pa) ?? null;
                return (
                  <TableRow key={l.contact_id}>
                    <TableCell className="min-w-[240px] max-w-[360px]">
                      <div className="flex items-start gap-3">
                        <span className="pt-0.5"><Checkbox aria-label={`Marcar ${l.nome}`} checked={sel.marcados.has(l.contact_id)} onCheckedChange={() => sel.alternar(l.contact_id)} /></span>
                        <div className="min-w-0">
                          <p className="text-ui text-ink">{l.nome}</p>
                          <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(l.documento)}</p>
                          {marcacoes?.get(l.contact_id)?.das && <p className="text-meta text-muted-ink-2">Recebe DAS da CA</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[170px]"><SeloMonitor selo={seloDe(l)} /></TableCell>
                    <TableCell className="whitespace-nowrap text-ui">
                      {d ? (
                        <div className="space-y-0.5">
                          <p className="text-ink">{d.valor_total != null ? moeda(d.valor_total) : 'Gerado'}</p>
                          {d.vencimento && <p className="text-meta text-muted-ink-2">vence {ddmm(d.vencimento)}</p>}
                        </div>
                      ) : <span className="text-meta text-muted-ink-2">Não gerado</span>}
                    </TableCell>
                    <TableCell>
                      <SeloMini selo={seloDivida(l, ano)} />
                      {l.divida && l.divida.itens.length > 0 && <p className="mt-0.5 text-meta text-muted-ink-2">{l.divida.itens.length} {l.divida.itens.length === 1 ? 'débito' : 'débitos'}</p>}
                    </TableCell>
                    <TableCell><SeloMini selo={seloEnquadramento(l)} /></TableCell>
                    <TableCell><UltimaBusca iso={ultimaBuscaMei(l)} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {d && (
                          <DicaBotao texto="Abre o DAS do MEI já guardado. Não consulta a Receita.">
                            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Abrir DAS do MEI" disabled={abrindo === d.id} onClick={() => abrir('das', d.id)}>
                              {abrindo === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                            </Button>
                          </DicaBotao>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Mais ações"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[260px]">
                            <DropdownMenuItem onSelect={() => { sel.definir([l.contact_id]); setLote('das'); }}>
                              <Receipt className="mr-2 h-4 w-4" />Gerar DAS de {siglaCompetencia(pa)}<Preco tipo="Emitir" />
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => { sel.definir([l.contact_id]); setLote('divida'); }}>Consultar dívida ativa<Preco tipo="Consultar" /></DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => { sel.definir([l.contact_id]); setLote('situacao'); }}>Consultar situação no MEI<Preco tipo="Consultar" /></DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {l.ccmei && (
                              <DropdownMenuItem onSelect={() => abrir('ccmei', l.ccmei!.id)}>
                                <FileBadge className="mr-2 h-4 w-4" />Abrir CCMEI ({format(new Date(l.ccmei.emitido_em), 'dd/MM/yyyy')})
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onSelect={() => { sel.definir([l.contact_id]); setLote('ccmei'); }}>
                              <FileBadge className="mr-2 h-4 w-4" />Emitir CCMEI<Preco tipo="Emitir" />
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => abrirPagamentos(l.contact_id, l.nome, formatarCnpj(l.documento))}>
                              <Wallet className="mr-2 h-4 w-4" />Pagamentos e comprovantes
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

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <RodapeLista mostrando={filtradas.length} total={linhas.length} unidade="clientes MEI ativos" faixa={pag.faixa} />
        <PaginacaoLista pagina={pag.pagina} totalPaginas={pag.totalPaginas} porPagina={pag.porPagina} total={filtradas.length}
          onPagina={irParaPagina} onPorPagina={pag.setPorPagina} />
      </div>
      <p className="text-meta text-muted-ink-2">O DAS do MEI aparece na coluna, mas não entra na situação: o MEI pode pagar pelo app. Os parcelamentos do MEI ficam em Parcelamentos.</p>

      <AcoesEmLoteDialog
        aberto={acoesLote}
        onClose={() => setAcoesLote(false)}
        clientes={linhas.map((l) => ({ id: l.contact_id, nome: l.nome, documento: l.documento, selo: seloDe(l) }))}
        extras={[{ chave: 'recebe', rotulo: 'Recebe o DAS pela CA', dica: 'Marcação do cadastro: a CA gera e envia o DAS do MEI.', ids: quemRecebe.map((l) => l.contact_id) }]}
        acoes={[
          { chave: 'das', rotulo: `Gerar DAS de ${siglaCompetencia(pa)}`, custo: 'Emitir', padrao: ['recebe'],
            dica: 'Um DAS do MEI por cliente. Quem já tem DAS guardado e válido não é emitido de novo.' },
          { chave: 'divida', rotulo: `Dívida ativa de ${ano}`, custo: 'Consultar', padrao: ['pendencia', 'atencao', 'nao_verificado'],
            seloDe: (id) => { const l = linhas.find((x) => x.contact_id === id); return l ? seloDivida(l, ano) : null; },
            dica: 'Consulta os débitos do ano em dívida ativa.' },
          { chave: 'situacao', rotulo: 'Situação no MEI', custo: 'Consultar', padrao: ['pendencia', 'atencao', 'nao_verificado'],
            seloDe: (id) => { const l = linhas.find((x) => x.contact_id === id); return l ? seloEnquadramento(l) : null; },
            dica: 'Consulta a situação cadastral e o enquadramento no MEI.' },
          { chave: 'ccmei', rotulo: 'Emitir CCMEI', custo: 'Emitir', padrao: [],
            dica: 'Emite o Certificado da Condição de MEI (CCMEI).' },
          { chave: 'baixar', rotulo: 'Baixar DAS e CCMEI', padrao: ['recebe'],
            dica: 'Baixa num ZIP os DAS do MEI e os CCMEI já guardados. Não consulta a Receita.' },
        ]}
        onContinuar={(acao, ids) => {
          sel.definir(ids);
          if (acao === 'baixar') setBaixarAberto(true); else setLote(acao as 'das' | 'divida' | 'situacao' | 'ccmei');
        }}
      />
      <GerarLoteDialog
        aberto={lote === 'das'}
        onClose={() => setLote(null)}
        titulo={`Gerar DAS do MEI de ${siglaCompetencia(pa)}`}
        descricao="Um DAS por cliente marcado, um de cada vez. Cada emissão fica registrada na Receita; quem já tem DAS guardado e válido não é emitido de novo."
        itens={loteItens(() => null, (l) => !!dasMeiValido(l, pa, hoje))}
        executar={async (item, dataPagamento) => {
          const r = await gerarDas.mutateAsync({ contactId: item.contactId, periodo: pa, dataPagamento });
          return { ok: r.ok && !r.foraDoMonitoramento, jaGerado: r.jaGerado, error: r.error };
        }}
      />
      <AcaoLoteDialog
        aberto={lote === 'divida'}
        onClose={() => setLote(null)}
        titulo={`Consultar dívida ativa de ${ano}`}
        descricao="Uma consulta por MEI marcado: débitos do ano em dívida ativa."
        itens={loteItens((l) => (hojeDe(l.divida?.consultado_em) ? 'Consultado hoje' : null))}
        tipo="Consultar"
        rotuloAcao="Consultar"
        rotuloFeito="Consultado"
        executar={async (item) => {
          const r = await divida.mutateAsync({ contactId: item.contactId, ano });
          return { ok: r.ok && !r.foraDoMonitoramento, error: r.error, resumo: r.debitos ? `${r.debitos} ${r.debitos === 1 ? 'débito' : 'débitos'} · ${moeda(r.total ?? 0)}` : 'Sem dívida ativa' };
        }}
      />
      <AcaoLoteDialog
        aberto={lote === 'situacao'}
        onClose={() => setLote(null)}
        titulo="Consultar situação no MEI"
        descricao="Uma consulta por cliente marcado: situação cadastral e se continua enquadrado no MEI."
        itens={loteItens((l) => (hojeDe(l.situacao?.consultado_em) ? 'Consultado hoje' : null))}
        tipo="Consultar"
        rotuloAcao="Consultar"
        rotuloFeito="Consultado"
        executar={async (item) => {
          const r = await situacao.mutateAsync({ contactId: item.contactId });
          return { ok: r.ok && !r.foraDoMonitoramento, error: r.error, resumo: r.optante === false ? 'Fora do MEI' : r.situacao ? `No MEI · ${r.situacao}` : 'No MEI' };
        }}
      />
      <AcaoLoteDialog
        aberto={lote === 'ccmei'}
        onClose={() => setLote(null)}
        titulo="Emitir CCMEI"
        descricao="Um Certificado da Condição de MEI por cliente marcado, um de cada vez."
        itens={loteItens((l) => (hojeDe(l.ccmei?.emitido_em) ? 'Emitido hoje' : null))}
        tipo="Emitir"
        rotuloAcao="Emitir"
        rotuloFeito="CCMEI guardado"
        executar={async (item) => {
          const r = await ccmei.mutateAsync({ contactId: item.contactId });
          return { ok: r.ok && !r.foraDoMonitoramento, error: r.error };
        }}
      />
      <EnviarGuiasDialog
        aberto={envioAberto}
        onClose={() => setEnvioAberto(false)}
        titulo={`Conferir e enviar DAS do MEI de ${siglaCompetencia(pa)}`}
        processo="das_mei"
        competencia={pa}
        itens={itensEnvio}
        assuntoPadrao={`DAS do MEI ${siglaCompetencia(pa)} · {cliente}`}
        mensagemPadrao={`Olá! Segue o DAS do MEI de ${siglaCompetencia(pa)} da {cliente}. Qualquer dúvida, é só responder este e-mail.\n\nContabilidade Alves`}
      />
      <BaixarLoteDialog
        aberto={baixarAberto}
        onClose={() => setBaixarAberto(false)}
        contactIds={[...sel.marcados]}
        competencia={pa}
        referencia={`competência ${siglaCompetencia(pa)}`}
        opcoes={[{ tipo: 'mei_das', rotulo: 'DAS do MEI' }, { tipo: 'mei_ccmei', rotulo: 'CCMEI (último)' }]}
      />
      {janelaPagamentos}
    </div>
  );
}
