import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, FileDown, FileText, Loader2, Receipt, RefreshCw, Send } from 'lucide-react';
import { Bar, BarChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { useAbrirArquivo, useGerarDasComConfirmacao } from '@/components/serpro/pgdasdUi';
import { EnviarClienteDialog } from '@/components/gestao360/EnviarClienteDialog';
import { formatarCnpj } from '@/components/gestao360/ClienteFiltro';
import { SeloMini, SeloMonitor, UltimaBusca } from '@/components/monitor/MonitorUi';
import { ROTULO_CANAL, useEnviosCliente } from '@/hooks/useEnvioCliente';
import { dasDoPeriodo, dasReaproveitavel, declaracaoVigente } from '@/hooks/useSerproPgdasd';
import { dasUnificado } from '@/hooks/useSerproDasUnificado';
import { siglaCompetencia } from '@/hooks/useSerproPagamentos';
import { modeloDocumentos } from '@/lib/mensagensCliente';
import { seloDas, seloPgdasMes } from '@/lib/monitorEstados';
import { digitos } from '@/lib/situacaoCarteira';
import type { LinhaSimples } from '@/lib/simplesNacionalLinhas';

const moeda = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const moedaCurta = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil` : String(Math.round(v)));
const dataBR = (iso: string | null) => (iso ? format(new Date(`${iso.slice(0, 10)}T00:00:00`), 'dd/MM/yyyy') : '—');
const mesCurto = (aaaamm: string) => `${aaaamm.slice(5, 7)}/${aaaamm.slice(2, 4)}`;

/**
 * Ficha de UM cliente do Simples Nacional (Rodada 2, modelo da ficha por processo do MonitorHub): 4 números do ano, mês a mês com
 * os documentos, faturamento de 12 meses e os últimos envios. As setas passam para o cliente anterior ou o próximo da lista filtrada.
 * Abrir a ficha é grátis: só lê o que já está salvo. Consultar, gerar DAS e baixar documento ainda não guardado cobram, e o botão diz.
 */
export function FichaSimplesSheet({
  linha, pa, hoje, abertura, posicao, onAnterior, onProximo, onClose, consultando, onConsultar, onVerLeitura,
}: {
  linha: LinhaSimples;
  pa: string;
  hoje: string;
  abertura: string | null;
  posicao: { atual: number; total: number };
  onAnterior: (() => void) | null;
  onProximo: (() => void) | null;
  onClose: () => void;
  consultando: boolean;
  onConsultar: () => void;
  onVerLeitura: () => void;
}) {
  const l = linha.pg;
  const ano = Number(pa.slice(0, 4));
  const { ocupado, abrirDeclaracao, abrirExtrato, abrirDas } = useAbrirArquivo();
  const { pedir: pedirDas, gerando, dialog: dialogGerar } = useGerarDasComConfirmacao();
  const envios = useEnviosCliente(linha.contact_id);
  const [enviando, setEnviando] = useState(false);

  // Mês a mês do ano, do mais recente para o mais antigo. A situação do DAS vem do índice do PGDAS-D (pago ou não);
  // o valor e a data do pagamento ficam na tela Pagamentos.
  const meses = useMemo(() => {
    const out: string[] = [];
    for (let m = Number(pa.slice(5, 7)); m >= 1; m--) out.push(`${ano}-${String(m).padStart(2, '0')}`);
    return out.map((m) => {
      const decl = declaracaoVigente(l, m);
      const das = m === pa ? linha.das : dasUnificado(l, [], m, hoje);
      return { pa: m, decl, declSelo: seloPgdasMes(l, m, hoje, abertura), das, dasSelo: !decl && das.estado === 'sem_das' ? null : seloDas(das), guias: dasDoPeriodo(l, m) };
    }).filter((x) => x.declSelo || x.dasSelo);
  }, [l, pa, ano, hoje, abertura, linha.das]);

  const pagos = meses.filter((x) => x.das.estado === 'pago').length;
  const emAberto = meses.filter((x) => x.das.estado === 'vencido');

  const fat = linha.fat;
  const barras = useMemo(() => {
    const d = fat?.dados;
    if (!d) return [];
    const mapa = new Map<string, number>();
    for (const m of d.historico_interno ?? []) mapa.set(m.mes, (mapa.get(m.mes) ?? 0) + m.valor);
    for (const m of d.historico_externo ?? []) mapa.set(m.mes, (mapa.get(m.mes) ?? 0) + m.valor);
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([mes, valor]) => ({ mes: mesCurto(mes), valor }));
  }, [fat]);

  const consultavel = !!l.consultadoEm;
  const reaproveitavel = dasReaproveitavel(l, pa);
  const podeGerar = consultavel && !!linha.declaracaoRow && linha.das.estado !== 'pago';

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[820px]">
        <SheetHeader className="space-y-2 text-left">
          <div className="flex items-center justify-between gap-3 pr-8">
            <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(linha.documento)}</p>
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
              <SeloMonitor selo={linha.situacao} outros={linha.outros} />
              <span className="text-meta text-muted-ink">Responsável: <span className="text-ink">{linha.responsavel?.nome ?? 'sem responsável'}</span></span>
              <span className="flex items-center gap-2 text-meta text-muted-ink">Última busca <UltimaBusca iso={linha.ultimaBusca} /></span>
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { rotulo: `DAS pagos em ${ano}`, valor: String(pagos), dica: `até ${siglaCompetencia(pa)}` },
            { rotulo: 'DAS vencidos', valor: String(emAberto.length), dica: emAberto.length ? emAberto.map((x) => siglaCompetencia(x.pa)).join(', ') : 'nenhum sem pagamento', alerta: emAberto.length > 0 },
            { rotulo: 'Próximo vencimento', valor: linha.das.vencimento && linha.das.estado !== 'pago' ? dataBR(linha.das.vencimento) : '—', dica: linha.das.estado === 'pago' ? `DAS de ${siglaCompetencia(pa)} pago` : linha.das.valor != null ? moeda(linha.das.valor) : `DAS de ${siglaCompetencia(pa)}` },
            { rotulo: 'Últimos 12 meses', valor: fat ? moeda(fat.rbt12_total) : '—', dica: fat ? `leitura de ${siglaCompetencia(fat.periodo_apuracao.slice(0, 7))}` : 'faturamento não lido' },
          ].map((c) => (
            <div key={c.rotulo} className={`rounded-lg border p-3 ${c.alerta ? 'border-danger bg-danger-soft' : 'border-line bg-paper'}`}>
              <p className="text-kicker uppercase text-muted-ink">{c.rotulo}</p>
              <p className="mt-1 text-[18px] font-medium text-ink">{c.valor}</p>
              <p className="text-meta text-muted-ink">{c.dica}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <DicaBotao custo="Consultar" texto={`Consulta na Receita as declarações e os DAS de ${ano} deste cliente, numa só chamada.`}>
            <Button variant="outline" disabled={consultando} onClick={onConsultar}>
              {consultando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Consultar {ano}<Preco tipo="Consultar" />
            </Button>
          </DicaBotao>
          {linha.das.estado !== 'pago' && (
            <DicaBotao custo={podeGerar && !reaproveitavel ? 'Emitir' : undefined}
              texto={!consultavel ? 'Consulte o ano deste cliente antes de gerar o DAS.'
                : !linha.declaracaoRow ? `Sem declaração de ${siglaCompetencia(pa)}: o DAS sai depois que a declaração é transmitida.`
                  : reaproveitavel ? 'Já existe um DAS gerado aqui e dentro do prazo: abre o arquivo guardado, sem emitir outro.'
                    : 'Gera o DAS deste período na Receita e guarda o PDF. Pede confirmação antes.'}>
              <Button disabled={!podeGerar || gerando === linha.contact_id} onClick={() => pedirDas(linha.contact_id, pa, linha.nome, reaproveitavel)}>
                {gerando === linha.contact_id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Receipt className="mr-2 h-4 w-4" />}
                Gerar DAS de {siglaCompetencia(pa)}{podeGerar && !reaproveitavel && <Preco tipo="Emitir" />}
              </Button>
            </DicaBotao>
          )}
          <DicaBotao texto="Abre o envio ao cliente (e-mail ou WhatsApp) com os documentos já guardados para marcar.">
            <Button variant="outline" onClick={() => setEnviando(true)}><Send className="mr-2 h-4 w-4" />Enviar ao cliente</Button>
          </DicaBotao>
          <Link to={`/dashboard-federal/pagamentos?q=${digitos(linha.documento)}`} className="px-2 text-ui-strong text-action hover:underline">Pagamentos e comprovantes</Link>
        </div>

        <section className="mt-6 space-y-2">
          <h3 className="text-ui-strong text-ink">Mês a mês em {ano}</h3>
          {meses.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line p-6 text-center text-ui text-muted-ink">Nada a mostrar neste ano.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-line bg-paper">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Período</TableHead>
                    <TableHead>Declaração</TableHead>
                    <TableHead>DAS</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-center">Documentos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {meses.map((m) => {
                    const guia = m.guias[0] ?? null;
                    return (
                      <TableRow key={m.pa} className={m.pa === pa ? 'bg-bg-2/60' : undefined}>
                        <TableCell className="font-mono text-ui">{siglaCompetencia(m.pa)}</TableCell>
                        <TableCell><SeloMini selo={m.declSelo} /></TableCell>
                        <TableCell><SeloMini selo={m.dasSelo} /></TableCell>
                        <TableCell className="whitespace-nowrap text-right text-ui">{moeda(m.das.valor)}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            {m.decl && (
                              <DicaBotao custo={m.decl.declaracao_path ? undefined : 'Consultar'} texto={m.decl.declaracao_path ? 'Abre o PDF da declaração, já guardado.' : 'Baixa da Receita o PDF da declaração e guarda.'}>
                                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={ocupado === `${m.decl.id}:declaracao`} onClick={() => abrirDeclaracao(m.decl!, 'declaracao')}>
                                  {ocupado === `${m.decl.id}:declaracao` ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                                </Button>
                              </DicaBotao>
                            )}
                            {guia?.das_path && (
                              <DicaBotao texto="Abre a guia do DAS gerada aqui, já guardada.">
                                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={ocupado === `${guia.id}:das`} onClick={() => abrirDas(guia)}>
                                  {ocupado === `${guia.id}:das` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                                </Button>
                              </DicaBotao>
                            )}
                            {guia && (
                              <DicaBotao custo={guia.extrato_path ? undefined : 'Consultar'} texto={guia.extrato_path ? 'Abre o extrato do DAS, já guardado.' : 'Baixa da Receita o extrato do DAS e guarda.'}>
                                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={ocupado === `${guia.id}:extrato`} onClick={() => abrirExtrato(guia)}>
                                  {ocupado === `${guia.id}:extrato` ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                                </Button>
                              </DicaBotao>
                            )}
                            {!m.decl && !guia && <span className="text-muted-ink-2">—</span>}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-meta text-muted-ink-2">Nos meses anteriores, "pago" vem do índice do PGDAS-D. Data e valor do pagamento ficam em Pagamentos.</p>
        </section>

        <section className="mt-6 space-y-2">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="text-ui-strong text-ink">Faturamento dos últimos 12 meses</h3>
              <p className="text-meta text-muted-ink">{fat ? `Lido da declaração de ${siglaCompetencia(fat.periodo_apuracao.slice(0, 7))}.` : 'Ainda sem leitura confiável da declaração deste cliente.'}</p>
            </div>
            <div className="flex items-center gap-3">
              {linha.limite && <SeloMini selo={linha.limite} />}
              {fat && <Button variant="outline" size="sm" onClick={onVerLeitura}>Ver leitura completa</Button>}
            </div>
          </div>
          {barras.length > 0 ? (
            <div className="h-[180px] rounded-lg border border-line bg-paper p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barras} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <XAxis dataKey="mes" tick={{ fill: 'var(--muted-ink)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={moedaCurta} tick={{ fill: 'var(--muted-ink)', fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
                  <RTooltip cursor={{ fill: 'var(--bg-2)' }} formatter={(v: number) => [moeda(v), 'Receita']} />
                  <Bar dataKey="valor" fill="var(--action)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-line p-6 text-center text-ui text-muted-ink">
              Sem leitura do faturamento. Na lista, use "Ler faturamento" no menu da linha (lê o PDF da declaração do mês).
            </p>
          )}
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

        {dialogGerar}
        {enviando && (
          <EnviarClienteDialog contactId={linha.contact_id} nome={linha.nome} modelo={modeloDocumentos()} origem="ficha" onClose={() => setEnviando(false)} />
        )}
      </SheetContent>
    </Sheet>
  );
}
