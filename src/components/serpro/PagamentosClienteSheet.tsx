import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ChevronDown, FileDown, Loader2, Receipt, RefreshCw, Search } from 'lucide-react';

import { DsBadge } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAbrirArquivo, useGerarDasComConfirmacao } from '@/components/serpro/pgdasdUi';
import {
  siglaCompetencia, useComprovantePagamento, useConsultarPagamentos, usePagamentosCliente, usePublicarPagamento,
  type FiltrosPagamentos, type PagamentoRow,
} from '@/hooks/useSerproPagamentos';
import { dasReaproveitavel } from '@/hooks/useSerproPgdasd';
import { ehSimplesConsultavel, type DasUnificado, type LinhaUnificada } from '@/hooks/useSerproDasUnificado';

const moeda = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const dataBR = (iso: string | null) => (iso ? format(new Date(`${iso}T00:00:00`), 'dd/MM/yyyy') : '—');

const TIPOS_FILTRO = [
  { value: 'todos', label: 'Todos os tipos' },
  { value: '04', label: 'DARF' },
  { value: '09', label: 'DAS' },
  { value: '10', label: 'DAE' },
  { value: '07', label: 'DJE' },
];

const lista = (texto: string) => texto.split(/[\s,;]+/).map((t) => t.replace(/\D/g, '')).filter(Boolean);

const dataHoraBR = (iso: string | null) => (iso ? format(new Date(iso), 'dd/MM/yyyy HH:mm') : '—');

function resumoDas(d: DasUnificado): { badge: { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' }; texto: string } {
  const venc = d.vencimento ? dataBR(d.vencimento) : '—';
  switch (d.estado) {
    case 'pago': {
      const origem = d.origemPago === 'ambos' ? 'confirmado pelo PGDAS e por Pagamentos'
        : d.origemPago === 'pagamentos' ? 'confirmado em Pagamentos'
          : 'segundo o PGDAS (para ver data e valor do pagamento, use "Consultar pagamentos")';
      return { badge: { label: 'Pago', tone: 'ok' }, texto: `${d.pagoEm ? `Pago em ${dataBR(d.pagoEm)} · ` : ''}${origem}.` };
    }
    case 'a_vencer': return { badge: { label: `Vence ${venc.slice(0, 5)}`, tone: 'warn' }, texto: `Vence em ${venc}${d.vencimentoCalculado ? ' (data calculada: dia 20, segunda-feira se cair no fim de semana)' : ''}. Ainda sem pagamento registrado pela Receita.` };
    case 'vencido': return { badge: { label: `Vencido ${venc.slice(0, 5)}`, tone: 'danger' }, texto: `Venceu em ${venc}${d.vencimentoCalculado ? ' (data calculada)' : ''} e a Receita não registra pagamento. Se o cliente pagou há pouco, a Receita pode levar 1 a 2 dias úteis para marcar.` };
    case 'sem_das': return { badge: { label: 'Sem DAS', tone: 'info' }, texto: 'Nenhum DAS gerado para este período na Receita.' };
    default: return { badge: { label: 'Não consultado', tone: 'neutral' }, texto: 'Ainda não consultado. Use "Atualizar DAS" para ver se o DAS foi gerado e se está pago.' };
  }
}

/**
 * Painel de UM cliente. Abrir = documentos já salvos (grátis). "Consultar" baixa os pagamentos do mês de apuração;
 * a busca avançada usa os filtros do serviço (tipo, documento, receita, datas e valores). O comprovante é emitido por
 * clique, uma vez: depois só se reabre o arquivo guardado.
 */
export function PagamentosClienteSheet({
  linha, competencia, consultando, consultandoDas, onConsultar, onConsultarDas, onClose,
}: {
  linha: LinhaUnificada | null;
  competencia: string;
  consultando: boolean;
  consultandoDas: boolean;
  onConsultar: (contactId: string) => void;
  onConsultarDas: (contactId: string) => void;
  onClose: () => void;
}) {
  const { data: todos = [], isLoading } = usePagamentosCliente(linha?.contact_id ?? null);
  const buscar = useConsultarPagamentos();
  const comprovante = useComprovantePagamento();
  const publicar = usePublicarPagamento();
  const { ocupado, abrirExtrato } = useAbrirArquivo();
  const { pedir: pedirDas, gerando, dialog: dialogGerar } = useGerarDasComConfirmacao();
  const [soMes, setSoMes] = useState(true);
  const [avancada, setAvancada] = useState(false);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [emitindo, setEmitindo] = useState<string | null>(null);
  const [f, setF] = useState({ tipo: 'todos', numero: '', receita: '', de: '', ate: '', valorDe: '', valorAte: '' });

  const visiveis = useMemo(
    () => todos.filter((p) => !soMes || (p.periodo_apuracao ?? '').slice(0, 7) === competencia),
    [todos, soMes, competencia],
  );
  const duplicados = useMemo(() => {
    const n = new Map<string, number>();
    for (const p of todos) n.set(p.numero_documento, (n.get(p.numero_documento) ?? 0) + 1);
    return new Set([...n.entries()].filter(([, q]) => q > 1).map(([k]) => k));
  }, [todos]);

  if (!linha) return null;

  const baixarComprovante = async (p: PagamentoRow) => {
    setEmitindo(p.id);
    try {
      const r = await comprovante.mutateAsync({ pagamentoId: p.id, contactId: p.contact_id });
      if (r.semProcuracao) { toast.error('Sem procuração para emitir comprovante deste cliente.'); return; }
      if (!r.ok || !r.url) { toast.error(r.error ?? 'Não foi possível obter o comprovante.'); return; }
      const a = document.createElement('a');
      a.href = r.url;
      a.click();
    } catch (e) {
      toast.error((e as Error)?.message || 'Não foi possível obter o comprovante.');
    } finally {
      setEmitindo(null);
    }
  };

  const buscaAvancada = async () => {
    const filtros: FiltrosPagamentos = {};
    if (f.tipo !== 'todos') filtros.codigoTipoDocumentoLista = [f.tipo];
    if (lista(f.numero).length) filtros.numeroDocumentoLista = lista(f.numero);
    if (lista(f.receita).length) filtros.codigoReceitaLista = lista(f.receita);
    if (f.de) filtros.dataInicial = f.de;
    if (f.ate) filtros.dataFinal = f.ate;
    if (f.valorDe.trim() && !Number.isNaN(Number(f.valorDe.replace(',', '.')))) filtros.valorInicial = Number(f.valorDe.replace(',', '.'));
    if (f.valorAte.trim() && !Number.isNaN(Number(f.valorAte.replace(',', '.')))) filtros.valorFinal = Number(f.valorAte.replace(',', '.'));
    if (!Object.keys(filtros).length) { toast.error('Preencha ao menos um filtro.'); return; }
    try {
      const r = await buscar.mutateAsync({ contactId: linha.contact_id, competencia, filtros });
      if (r.foraDoMonitoramento || !r.ok) { toast.error(r.error ?? 'Falha na busca.'); return; }
      setSoMes(false);
      toast.success(`${r.documentos ?? 0} documentos encontrados (${r.novos ?? 0} novos). Mostrando todos os meses.`);
    } catch (e) {
      toast.error((e as Error)?.message || 'Falha na busca. Tente novamente em instantes.');
    }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[780px]">
        <SheetHeader className="space-y-1 text-left">
          <p className="font-mono text-meta text-muted-ink-2">{linha.documento}</p>
          <SheetTitle className="text-[20px]">{linha.nome}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-2">
              <DsBadge tone={linha.consultadoEm ? 'ok' : 'neutral'}>
                {linha.consultadoEm ? `PA ${siglaCompetencia(competencia)} consultado` : `PA ${siglaCompetencia(competencia)} não consultado`}
              </DsBadge>
              {linha.novo && <DsBadge tone="warn">Pagamento novo</DsBadge>}
              {linha.duplicidade && <DsBadge tone="danger">Duplicidade</DsBadge>}
              {linha.saldo && <DsBadge tone="info">Saldo a verificar</DsBadge>}
              <span className="text-meta text-muted-ink">
                {linha.consultadoEm ? `Última consulta em ${format(new Date(linha.consultadoEm), 'dd/MM/yyyy HH:mm')}` : 'Use "Consultar" para baixar os pagamentos do mês'}
              </span>
            </div>
          </SheetDescription>
        </SheetHeader>

        {linha.das.estado !== 'nao_simples' && linha.das.estado !== 'filial' && (() => {
          const d = linha.das;
          const r = resumoDas(d);
          const consultavel = ehSimplesConsultavel(linha);
          const pg = linha.simples;
          const reaproveitavel = !!pg && dasReaproveitavel(pg, competencia);
          const naoConsultado = d.estado === 'nao_consultado';
          return (
            <div className="mt-5 space-y-3 rounded-lg border border-line bg-paper p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <DsBadge tone="info">DAS</DsBadge>
                    <span className="text-ui text-ink">{siglaCompetencia(competencia)}</span>
                    <DsBadge tone={r.badge.tone}>{r.badge.label}</DsBadge>
                  </div>
                  <p className="mt-1 text-meta text-muted-ink">{r.texto}</p>
                  {pg?.consultadoEm && <p className="text-meta text-muted-ink-2">Consulta do PGDAS em {dataHoraBR(pg.consultadoEm)}</p>}
                </div>
                {d.valor != null && <p className="text-[18px] font-medium text-ink">{moeda(d.valor)}</p>}
              </div>

              {d.casados.length > 0 && (
                <div className="divide-y divide-line rounded-md border border-line">
                  {d.casados.map(({ das, doc }) => (
                    <div key={das.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-meta">
                      <span className="min-w-0 text-ink">
                        <span className="font-mono">{das.numero_das}</span>
                        <span className="text-muted-ink-2"> · emitido em {dataHoraBR(das.emitido_em)}{doc ? ' · conferido em Pagamentos' : ''}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <DsBadge tone={das.das_pago === true ? 'ok' : 'warn'} dot={false}>{das.das_pago === true ? 'Pago' : 'Não pago'}</DsBadge>
                        <DicaBotao custo={das.extrato_path ? undefined : 'Consultar'}
                          texto={das.extrato_path ? 'Abre o extrato do DAS em PDF, que já está guardado.' : 'Baixa da Receita o extrato do DAS em PDF e guarda. Depois, é só reabrir o arquivo.'}>
                          <Button size="sm" variant="outline" disabled={ocupado === `${das.id}:extrato`} onClick={() => abrirExtrato(das)}>
                            {ocupado === `${das.id}:extrato` ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileDown className="mr-1.5 h-4 w-4" />}
                            Extrato{!das.extrato_path && <Preco tipo="Consultar" />}
                          </Button>
                        </DicaBotao>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <DicaBotao custo={consultavel ? 'Consultar' : undefined}
                  texto={consultavel ? `Consulta na Receita as declarações e os DAS do ano inteiro deste cliente, numa só chamada: mostra se o DAS foi gerado e se está pago.` : 'Filial: o DAS é da matriz. Consulte o CNPJ da matriz.'}>
                  <Button variant="outline" disabled={!consultavel || consultandoDas} onClick={() => onConsultarDas(linha.contact_id)}>
                    {consultandoDas ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Atualizar DAS{consultavel && <Preco tipo="Consultar" />}
                  </Button>
                </DicaBotao>
                {d.estado !== 'pago' && (
                  <DicaBotao custo={!consultavel || naoConsultado || reaproveitavel ? undefined : 'Emitir'}
                    texto={naoConsultado ? 'Consulte o ano deste cliente antes de gerar o DAS.'
                      : reaproveitavel ? 'Já existe um DAS gerado aqui e dentro do prazo: abre o arquivo guardado, sem emitir outro.'
                        : 'Gera o DAS deste período na Receita e guarda o PDF. Fica registrada uma emissão. Pede confirmação antes.'}>
                    <Button disabled={!consultavel || naoConsultado || gerando === linha.contact_id} onClick={() => pedirDas(linha.contact_id, competencia, linha.nome, reaproveitavel)}>
                      {gerando === linha.contact_id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Receipt className="mr-2 h-4 w-4" />}
                      Gerar DAS{consultavel && !naoConsultado && !reaproveitavel && <Preco tipo="Emitir" />}
                    </Button>
                  </DicaBotao>
                )}
                <p className="min-w-[200px] flex-1 text-meta text-muted-ink-2">Guia, extrato e comprovante são documentos diferentes e só saem no clique. O comprovante fica no documento pago, logo abaixo.</p>
              </div>
            </div>
          );
        })()}

        <div className="mt-5 space-y-3 rounded-lg border border-line bg-bg-2 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <DicaBotao custo="Consultar" texto={`Baixa da Receita os pagamentos da competência ${siglaCompetencia(competencia)} deste cliente.`}>
              <Button onClick={() => onConsultar(linha.contact_id)} disabled={consultando}>
                {consultando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Consultar pagamentos<Preco tipo="Consultar" />
              </Button>
            </DicaBotao>
            <DicaBotao texto="Mostra ou esconde os filtros para procurar pagamentos por tipo, documento, receita, datas e valores.">
              <Button variant="outline" onClick={() => setAvancada((v) => !v)}>
                <Search className="mr-2 h-4 w-4" /> Busca avançada
              </Button>
            </DicaBotao>
            <p className="min-w-[200px] flex-1 text-meta text-muted-ink">
              Baixa os pagamentos da competência {siglaCompetencia(competencia)} (DARF, DAS, DAE e DJE). A Receita só informa o que foi pago.
            </p>
          </div>

          {avancada && (
            <div className="space-y-3 border-t border-line pt-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-meta text-muted-ink">
                  Tipo
                  <Select value={f.tipo} onValueChange={(v) => setF({ ...f, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TIPOS_FILTRO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </label>
                <label className="space-y-1 text-meta text-muted-ink">
                  Nº do documento
                  <Input value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} placeholder="um ou mais, separados por vírgula" />
                </label>
                <label className="space-y-1 text-meta text-muted-ink">
                  Código da receita
                  <Input value={f.receita} onChange={(e) => setF({ ...f, receita: e.target.value })} placeholder="ex.: 1475" />
                </label>
                <label className="space-y-1 text-meta text-muted-ink">
                  Pago de
                  <Input type="date" value={f.de} onChange={(e) => setF({ ...f, de: e.target.value })} />
                </label>
                <label className="space-y-1 text-meta text-muted-ink">
                  Pago até
                  <Input type="date" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-meta text-muted-ink">
                    Valor de (R$)
                    <Input inputMode="decimal" value={f.valorDe} onChange={(e) => setF({ ...f, valorDe: e.target.value })} />
                  </label>
                  <label className="space-y-1 text-meta text-muted-ink">
                    Valor até (R$)
                    <Input inputMode="decimal" value={f.valorAte} onChange={(e) => setF({ ...f, valorAte: e.target.value })} />
                  </label>
                </div>
              </div>
              <DicaBotao custo="Consultar" texto="Procura na Receita os pagamentos que batem com os filtros preenchidos.">
                <Button onClick={buscaAvancada} disabled={buscar.isPending}>
                  {buscar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Buscar<Preco tipo="Consultar" />
                </Button>
              </DicaBotao>
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-meta text-muted-ink">{visiveis.length} documento(s) {soMes ? `da competência ${siglaCompetencia(competencia)}` : 'de todos os meses salvos'}</p>
          <label className="flex items-center gap-2 text-meta text-muted-ink">
            Só desta competência <Switch checked={soMes} onCheckedChange={setSoMes} />
          </label>
        </div>

        <div className="mt-3 space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
          ) : visiveis.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line p-8 text-center text-ui text-muted-ink">
              {linha.consultadoEm && soMes
                ? 'Nenhum pagamento registrado pela Receita para esta competência.'
                : 'Nenhum pagamento salvo ainda. Use "Consultar" para baixar.'}
            </div>
          ) : (
            visiveis.map((p) => {
              const comp = p.desmembramentos ?? [];
              const aberto = !!abertos[p.id];
              return (
                <div key={p.id} className="space-y-3 rounded-lg border border-line bg-paper p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <DsBadge tone="info">{p.tipo_sigla}</DsBadge>
                        <span className="font-mono text-ui text-ink">{p.numero_documento}</span>
                        {duplicados.has(p.numero_documento) && <DsBadge tone="danger">Duplicidade</DsBadge>}
                        {(p.valor_saldo_total ?? 0) > 0 && <DsBadge tone="info">Saldo {moeda(p.valor_saldo_total)}</DsBadge>}
                      </div>
                      <p className="mt-1 text-meta text-muted-ink">
                        PA {p.periodo_apuracao ? `${p.periodo_apuracao.slice(5, 7)}/${p.periodo_apuracao.slice(0, 4)}` : '—'}
                        {' · '}Pago em {dataBR(p.data_arrecadacao)} · Vence em {dataBR(p.data_vencimento)}
                      </p>
                      {(p.receita_codigo || p.receita_descricao) && (
                        <p className="text-meta text-muted-ink-2">Receita {p.receita_codigo}{p.receita_descricao ? ` · ${p.receita_descricao}` : ''}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-[18px] font-medium text-ink">{moeda(p.valor_total)}</p>
                      {(p.valor_multa || p.valor_juros) ? (
                        <p className="text-meta text-muted-ink-2">principal {moeda(p.valor_principal)} · multa {moeda(p.valor_multa)} · juros {moeda(p.valor_juros)}</p>
                      ) : null}
                    </div>
                  </div>

                  {comp.length > 0 && (
                    <div>
                      <DicaBotao texto="Mostra ou esconde a composição deste documento: quais receitas e valores formam o total.">
                        <button type="button" className="flex items-center gap-1 text-meta text-muted-ink hover:text-ink" onClick={() => setAbertos((a) => ({ ...a, [p.id]: !aberto }))}>
                          <ChevronDown className={`h-4 w-4 transition-transform ${aberto ? 'rotate-180' : ''}`} /> Composição ({comp.length})
                        </button>
                      </DicaBotao>
                      {aberto && (
                        <div className="mt-2 divide-y divide-line rounded-md border border-line">
                          {comp.map((d, i) => (
                            <div key={`${d.sequencial ?? i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-meta">
                              <span className="min-w-0 text-ink">{d.receitaPrincipal?.codigo}{d.receitaPrincipal?.descricao ? ` · ${d.receitaPrincipal.descricao}` : ''}</span>
                              <span className="shrink-0 font-mono text-ink">{moeda(d.valorTotal ?? null)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <DicaBotao custo={p.comprovante_path ? undefined : 'Emitir'}
                      texto={p.comprovante_path ? 'Baixa o comprovante de pagamento que já está guardado. Não consulta a Receita.' : 'Emite na Receita o comprovante deste pagamento e guarda o PDF. Depois, é só reabrir o arquivo.'}>
                      <Button size="sm" variant={p.comprovante_path ? 'outline' : 'default'} onClick={() => baixarComprovante(p)} disabled={emitindo === p.id}>
                        {emitindo === p.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileDown className="mr-1.5 h-4 w-4" />}
                        {p.comprovante_path ? 'Baixar comprovante' : 'Emitir comprovante'}{!p.comprovante_path && <Preco tipo="Emitir" />}
                      </Button>
                    </DicaBotao>
                    <label className="flex items-center gap-2 text-meta text-muted-ink">
                      <Switch
                        checked={p.visivel_portal}
                        onCheckedChange={(v) => publicar.mutate(
                          { pagamentoId: p.id, contactId: p.contact_id, visivel: v },
                          { onError: () => toast.error('Não foi possível salvar.') },
                        )}
                      />
                      Publicar no portal
                    </label>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {dialogGerar}
      </SheetContent>
    </Sheet>
  );
}
