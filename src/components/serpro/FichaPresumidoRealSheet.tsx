import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { CalendarPlus, ChevronLeft, ChevronRight, FileCode, FileText, Loader2, MoreHorizontal, Receipt, RefreshCw, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Preco, brl } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { useAbrirRecibo } from '@/components/serpro/dctfwebUi';
import { PagamentosDoCliente } from '@/components/serpro/PagamentosDoCliente';
import { EnviarClienteDialog } from '@/components/gestao360/EnviarClienteDialog';
import { formatarCnpj } from '@/components/gestao360/ClienteFiltro';
import { AcaoLoteDialog } from '@/components/monitor/GuiasLote';
import { SeloMini, SeloMonitor, UltimaBusca } from '@/components/monitor/MonitorUi';
import { useEnviosCliente, ROTULO_CANAL } from '@/hooks/useEnvioCliente';
import { useDeclaracaoDctfweb, useLinkGuiaDctfweb } from '@/hooks/useGuiasCliente';
import { useDarfsGerados, useLinkDarf } from '@/hooks/useSerproDarf';
import {
  apuracaoVigente, estadoDctfweb, estadoMit, useConsultarDctfwebMit, type LinhaDctfwebMit,
} from '@/hooks/useSerproDctfweb';
import { mesesDoAno, mesesFaltantes, useDctfwebAnoCliente, useGuiasDctfwebCliente, useMitAnoCliente } from '@/hooks/useSerproFichaPresumido';
import { mesDeData, siglaCompetencia, usePagamentosCliente } from '@/hooks/useSerproPagamentos';
import { abrirPdf } from '@/hooks/useSerproPgdasd';
import { modeloDocumentos } from '@/lib/mensagensCliente';
import { seloDctfwebColuna, seloMitColuna, type Selo } from '@/lib/monitorEstados';

const moeda = (v: number | null | undefined) => (v === null || v === undefined ? '—' : brl(v));
const dataBR = (iso: string | null) => (iso ? format(new Date(`${iso.slice(0, 10)}T00:00:00`), 'dd/MM/yyyy') : '—');
const ddmm = (iso: string | null) => (iso ? format(new Date(`${iso.slice(0, 10)}T00:00:00`), 'dd/MM') : '—');
const REGIME: Record<string, string> = { lucro_presumido: 'Lucro Presumido', lucro_real: 'Lucro Real' };

/**
 * Ficha de UM cliente do Lucro Presumido ou do Real (10/10/2026), no desenho da ficha do Simples: números do ano, mês a mês
 * (DCTFWeb, MIT, valor apurado, DARF pago, guia e documentos), pagamentos do mês com composição e últimos envios.
 * Abrir é grátis: só lê o que já está salvo. Consultar, "Completar o ano" e baixar documento ainda não guardado cobram, e o botão diz.
 * "Apurado" (MIT) e "DARF pago" ficam lado a lado, sem comparação automática: IRPJ e CSLL são trimestrais e o mesmo período recebe DARF de outras origens.
 */
export function FichaPresumidoRealSheet({
  linha, competencia, selo, outros, responsavel, abertura, posicao, onAnterior, onProximo, onClose, consultando, onConsultar, onGerarGuia, onGerarGuiaAndamento,
}: {
  linha: LinhaDctfwebMit;
  competencia: string;
  selo: Selo | null;
  outros: string[];
  responsavel: string | null;
  abertura: string | null;
  posicao: { atual: number; total: number };
  onAnterior: (() => void) | null;
  onProximo: (() => void) | null;
  onClose: () => void;
  consultando: boolean;
  onConsultar: () => void;
  onGerarGuia: () => void;
  /** Guia da declaração ainda em andamento (antes de transmitir), do mês escolhido. */
  onGerarGuiaAndamento: () => void;
}) {
  const ano = Number(competencia.slice(0, 4));
  const mesAtual = mesDeData(new Date());
  const { data: dctfAno = [] } = useDctfwebAnoCliente(linha.contact_id, ano);
  const { data: mitAno } = useMitAnoCliente(linha.contact_id, ano);
  const { data: guiasAno = [] } = useGuiasDctfwebCliente(linha.contact_id, ano);
  const { data: darfsTodos = [] } = useDarfsGerados();
  const { data: pagamentos = [] } = usePagamentosCliente(linha.contact_id);
  const envios = useEnviosCliente(linha.contact_id);
  const { ocupado: abrindoRecibo, abrir: abrirRecibo } = useAbrirRecibo();
  const declaracao = useDeclaracaoDctfweb();
  const linkGuia = useLinkGuiaDctfweb();
  const linkDarf = useLinkDarf();
  const consultar = useConsultarDctfwebMit();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [completando, setCompletando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const darfsDoCliente = useMemo(() => darfsTodos.filter((d) => d.contact_id === linha.contact_id), [darfsTodos, linha.contact_id]);

  const meses = useMemo(() => mesesDoAno(ano, competencia).reverse().map((m) => {
    const dctf = dctfAno.find((d) => d.competencia.slice(0, 7) === m) ?? null;
    const apuracoes = (mitAno?.apuracoes ?? []).filter((a) => a.periodo.slice(0, 7) === m);
    // Mesma regra da lista: monta uma "linha" do mês e usa os mesmos estados.
    const doMes: LinhaDctfwebMit = { ...linha, dctfweb: dctf, mit: apuracoes, mitConsultado: mitAno?.consulta ?? null };
    const apuracao = apuracaoVigente(doMes);
    const pagos = pagamentos.filter((p) => p.tipo_sigla === 'DARF' && (p.periodo_apuracao ?? '').slice(0, 7) === m);
    return {
      m, dctf, estD: estadoDctfweb(doMes), estM: estadoMit(doMes), apuracao,
      guia: guiasAno.find((g) => g.competencia.slice(0, 7) === m) ?? null,
      avulsos: darfsDoCliente.filter((d) => d.data_pa.slice(0, 7) === m),
      pagoTotal: pagos.reduce((s, p) => s + (p.valor_total ?? 0), 0),
      pagoQtd: pagos.length,
      pagoEm: pagos.map((p) => p.data_arrecadacao).filter((x): x is string => !!x).sort().pop() ?? null,
    };
  }), [ano, competencia, dctfAno, mitAno, guiasAno, darfsDoCliente, pagamentos, linha]);

  const faltantes = useMemo(
    () => mesesFaltantes(new Set(dctfAno.map((d) => d.competencia.slice(0, 7))), ano, competencia, mesAtual, abertura),
    [dctfAno, ano, competencia, mesAtual, abertura],
  );
  const comRecibo = meses.filter((x) => x.estD === 'transmitida').length;
  const encerradas = meses.filter((x) => x.estM === 'encerrada').length;
  const darfAno = pagamentos.filter((p) => p.tipo_sigla === 'DARF' && (p.periodo_apuracao ?? '').slice(0, 4) === String(ano)).reduce((s, p) => s + (p.valor_total ?? 0), 0);
  const doMesAberto = meses.find((x) => x.m === competencia);
  const podeGuia = doMesAberto?.estD === 'transmitida' && !doMesAberto.guia;

  const abrirArquivo = async (chave: string, fn: () => Promise<{ ok: boolean; url?: string; error?: string }>, falha: string) => {
    setOcupado(chave);
    try {
      const r = await fn();
      if (r.ok && r.url) abrirPdf(r.url); else toast.error(r.error ?? falha);
    } catch (e) {
      toast.error((e as Error)?.message || falha);
    } finally {
      setOcupado(null);
    }
  };

  const cartoes = [
    { rotulo: `DCTFWeb com recibo em ${ano}`, valor: String(comRecibo), dica: `até ${siglaCompetencia(competencia)}` },
    { rotulo: 'MIT encerradas', valor: String(encerradas), dica: mitAno?.consulta ? `de ${mitAno.apuracoes.length} apurações no ano` : 'MIT não consultada' },
    { rotulo: 'Meses sem consulta', valor: String(faltantes.length), dica: faltantes.length ? 'DCTFWeb ainda não consultada' : 'DCTFWeb de todos os meses consultada', alerta: false },
    { rotulo: `DARF pago em ${ano}`, valor: darfAno ? moeda(darfAno) : '—', dica: 'soma dos DARF já consultados' },
  ];

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[900px]">
        <SheetHeader className="space-y-2 text-left">
          <div className="flex items-center justify-between gap-3 pr-8">
            <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(linha.documento)} · {REGIME[linha.regime ?? ''] ?? 'Sem regime'}</p>
            <div className="flex items-center gap-1">
              <DicaBotao texto="Cliente anterior da lista, com os mesmos filtros.">
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Cliente anterior" disabled={!onAnterior} onClick={() => onAnterior?.()}><ChevronLeft className="h-4 w-4" /></Button>
              </DicaBotao>
              <span className="min-w-[64px] text-center text-meta text-muted-ink">{posicao.atual} de {posicao.total}</span>
              <DicaBotao texto="Próximo cliente da lista, com os mesmos filtros.">
                <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Próximo cliente" disabled={!onProximo} onClick={() => onProximo?.()}><ChevronRight className="h-4 w-4" /></Button>
              </DicaBotao>
            </div>
          </div>
          <SheetTitle className="text-[20px]">{linha.nome}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-start gap-x-5 gap-y-2">
              <SeloMonitor selo={selo} outros={outros} />
              <span className="text-meta text-muted-ink">Responsável: <span className="text-ink">{responsavel ?? 'sem responsável'}</span></span>
              <span className="flex items-center gap-2 text-meta text-muted-ink">Última busca <UltimaBusca iso={[linha.dctfweb?.consultado_em, linha.mitConsultado?.consultado_em].filter((x): x is string => !!x).sort().pop() ?? null} /></span>
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cartoes.map((c) => (
            <div key={c.rotulo} className="rounded-lg border border-line bg-paper p-3">
              <p className="text-kicker uppercase text-muted-ink">{c.rotulo}</p>
              <p className="mt-1 text-[18px] font-medium text-ink">{c.valor}</p>
              <p className="text-meta text-muted-ink">{c.dica}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <DicaBotao custo="Consultar" vezes={2} texto={`Consulta na Receita o recibo da DCTFWeb de ${siglaCompetencia(competencia)} e as apurações da MIT de ${ano} deste cliente (duas consultas).`}>
            <Button variant="outline" disabled={consultando} onClick={onConsultar}>
              {consultando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Consultar {siglaCompetencia(competencia)}<Preco tipo="Consultar" vezes={2} />
            </Button>
          </DicaBotao>
          <DicaBotao custo="Consultar" vezes={faltantes.length || undefined}
            texto={faltantes.length
              ? `Consulta o recibo da DCTFWeb dos ${faltantes.length} meses de ${ano} que ainda não foram consultados (uma consulta por mês, um de cada vez). A MIT do ano já vem inteira.`
              : `A DCTFWeb de todos os meses de ${ano} até ${siglaCompetencia(competencia)} já foi consultada.`}>
            <Button variant="outline" disabled={!faltantes.length} onClick={() => setCompletando(true)}>
              <CalendarPlus className="mr-2 h-4 w-4" />Completar o ano{faltantes.length ? ` (${faltantes.length})` : ''}
              {faltantes.length > 0 && <Preco tipo="Consultar" vezes={faltantes.length} />}
            </Button>
          </DicaBotao>
          {podeGuia && (
            <DicaBotao custo="Emitir" texto="Gera a guia (DARF) da DCTFWeb deste mês. Pede confirmação antes.">
              <Button onClick={onGerarGuia}><Receipt className="mr-2 h-4 w-4" />Gerar guia de {siglaCompetencia(competencia)}<Preco tipo="Emitir" /></Button>
            </DicaBotao>
          )}
          {doMesAberto?.estD !== 'transmitida' && (
            <DicaBotao custo="Emitir" texto={`Gera a guia da declaração de ${siglaCompetencia(competencia)} ainda EM ANDAMENTO (antes de transmitir). Pede confirmação antes.`}>
              <Button variant="outline" onClick={onGerarGuiaAndamento}><Receipt className="mr-2 h-4 w-4" />Guia em andamento de {siglaCompetencia(competencia)}<Preco tipo="Emitir" /></Button>
            </DicaBotao>
          )}
          <DicaBotao texto="Abre o envio ao cliente (e-mail ou WhatsApp) com os documentos já guardados para marcar.">
            <Button variant="outline" onClick={() => setEnviando(true)}><Send className="mr-2 h-4 w-4" />Enviar ao cliente</Button>
          </DicaBotao>
        </div>

        <section className="mt-6 space-y-2">
          <h3 className="text-ui-strong text-ink">Mês a mês em {ano}</h3>
          <div className="overflow-hidden rounded-lg border border-line bg-paper">
            <div className="overflow-x-auto">
              <Table className="[&_td]:px-2 [&_th]:px-2">
                <TableHeader>
                  <TableRow>
                    <TableHead>Período</TableHead>
                    <TableHead>DCTFWeb</TableHead>
                    <TableHead>MIT</TableHead>
                    <TableHead className="text-right">Apurado (MIT)</TableHead>
                    <TableHead className="text-right">DARF pago</TableHead>
                    <TableHead className="text-center">Documentos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {meses.map((x) => (
                    <TableRow key={x.m} className={x.m === competencia ? 'bg-bg-2/60' : undefined}>
                      <TableCell className="font-mono text-ui">{siglaCompetencia(x.m)}</TableCell>
                      <TableCell>
                        <SeloMini selo={seloDctfwebColuna(x.estD)} />
                        {x.guia && <p className="mt-0.5 text-meta text-muted-ink-2">guia gerada em {ddmm(x.guia.emitido_em)}</p>}
                      </TableCell>
                      <TableCell>
                        <SeloMini selo={seloMitColuna(x.estM)} />
                        {x.apuracao?.data_encerramento && <p className="mt-0.5 whitespace-nowrap text-meta text-muted-ink-2">em {dataBR(x.apuracao.data_encerramento)}</p>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-ui">{x.apuracao?.valor_total != null ? moeda(x.apuracao.valor_total) : <span className="text-muted-ink-2">—</span>}</TableCell>
                      <TableCell className="whitespace-nowrap text-right text-ui">
                        {x.pagoQtd ? (
                          <>
                            {moeda(x.pagoTotal)}
                            <p className="text-meta text-muted-ink-2">{x.pagoQtd > 1 ? `${x.pagoQtd} DARF · ` : ''}pago em {ddmm(x.pagoEm)}</p>
                          </>
                        ) : <span className="text-muted-ink-2">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-0.5">
                          {x.dctf?.status === 'transmitida' && (
                            <DicaBotao texto="Abre o PDF do recibo da DCTFWeb deste mês, que já está guardado. Não consulta a Receita.">
                              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Recibo da DCTFWeb" disabled={abrindoRecibo === x.dctf.id} onClick={() => abrirRecibo(x.dctf!.id)}>
                                {abrindoRecibo === x.dctf.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                              </Button>
                            </DicaBotao>
                          )}
                          {x.guia && (
                            <DicaBotao texto="Abre a guia (DARF) da DCTFWeb gerada aqui, já guardada.">
                              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Guia da DCTFWeb" disabled={ocupado === `guia:${x.guia.id}`}
                                onClick={() => abrirArquivo(`guia:${x.guia!.id}`, () => linkGuia.mutateAsync({ id: x.guia!.id }), 'Não foi possível abrir a guia.')}>
                                {ocupado === `guia:${x.guia.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                              </Button>
                            </DicaBotao>
                          )}
                          {x.avulsos.map((d) => (
                            <DicaBotao key={d.id} texto={`Abre o DARF avulso gerado pela tela DARF (receita ${d.codigo_receita}, ${moeda(d.valor_total)}), já guardado.`}>
                              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`DARF avulso ${d.codigo_receita}`} disabled={ocupado === `darf:${d.id}`}
                                onClick={() => abrirArquivo(`darf:${d.id}`, () => linkDarf.mutateAsync({ id: d.id }), 'Não foi possível abrir o DARF.')}>
                                {ocupado === `darf:${d.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4 text-brand" />}
                              </Button>
                            </DicaBotao>
                          ))}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Declaração completa">
                                {ocupado?.startsWith(`decl:${x.m}`) ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-[250px]">
                              <DropdownMenuItem onSelect={() => abrirArquivo(`decl:${x.m}:pdf`, () => declaracao.mutateAsync({ contactId: linha.contact_id, competencia: x.m, formato: 'pdf' }), 'Não foi possível abrir a declaração.')}>
                                <FileText className="mr-2 h-4 w-4" />Declaração completa (PDF)<Preco tipo="Consultar" />
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => abrirArquivo(`decl:${x.m}:xml`, () => declaracao.mutateAsync({ contactId: linha.contact_id, competencia: x.m, formato: 'xml' }), 'Não foi possível abrir a declaração.')}>
                                <FileCode className="mr-2 h-4 w-4" />Declaração em XML<Preco tipo="Consultar" />
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <p className="text-meta text-muted-ink-2">
            "Apurado" vem da MIT e "DARF pago" dos pagamentos já consultados. O sistema não compara os dois nem avisa diferença: IRPJ e CSLL são trimestrais
            e o mesmo período recebe DARF de outras origens. "Não consultada" quer dizer que o mês ainda não foi buscado na Receita.
          </p>
        </section>

        <section className="mt-6 space-y-2">
          <div>
            <h3 className="text-ui-strong text-ink">Pagamentos de {siglaCompetencia(competencia)}</h3>
            <p className="text-meta text-muted-ink">DARF e demais documentos pagos, com a composição por receita e o comprovante. Abrir é grátis; só consultar e emitir cobram.</p>
          </div>
          <PagamentosDoCliente contactId={linha.contact_id} competencia={competencia} />
        </section>

        <section className="mt-6 space-y-2">
          <h3 className="text-ui-strong text-ink">Últimos envios ao cliente</h3>
          {(envios.data ?? []).length === 0 ? (
            <p className="text-meta text-muted-ink">Nenhum envio registrado.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-paper">
              {(envios.data ?? []).map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-meta">
                  <span className="text-ink">{ROTULO_CANAL[e.canal]}{e.documentos.length ? ` · ${e.documentos.map((d) => d.nome).join(', ')}` : ''}</span>
                  <span className="text-muted-ink">{format(new Date(e.enviado_em), 'dd/MM/yyyy HH:mm')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {enviando && (
          <EnviarClienteDialog contactId={linha.contact_id} nome={linha.nome} modelo={modeloDocumentos()} origem="ficha" onClose={() => setEnviando(false)} />
        )}
        <AcaoLoteDialog
          aberto={completando}
          onClose={() => setCompletando(false)}
          titulo={`Completar ${ano}: DCTFWeb dos meses que faltam`}
          descricao="Uma consulta por mês, um de cada vez: traz o recibo da DCTFWeb de cada mês ainda não consultado. A MIT do ano já vem inteira e não é consultada de novo."
          itens={faltantes.map((m) => ({ contactId: m, nome: `DCTFWeb de ${siglaCompetencia(m)}` }))}
          tipo="Consultar"
          rotuloAcao="Consultar"
          rotuloFeito="Consultado"
          executar={async (item) => {
            const r = await consultar.mutateAsync({ contactId: linha.contact_id, competencia: item.contactId, soDctfweb: true });
            return {
              ok: r.ok, recente: r.recente, error: r.semProcuracao ? 'Sem procuração para a DCTFWeb' : r.error,
              resumo: r.dctfweb?.status === 'transmitida' ? 'Com recibo' : r.dctfweb?.status === 'sem_declaracao' ? 'Sem declaração no mês' : undefined,
            };
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
