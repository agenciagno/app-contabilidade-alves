import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ChevronDown, FileDown, Loader2, RefreshCw, Search } from 'lucide-react';

import { DsBadge } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  siglaCompetencia, useComprovantePagamento, useConsultarPagamentos, usePagamentosCliente, usePublicarPagamento,
  type FiltrosPagamentos, type LinhaPagamentos, type PagamentoRow,
} from '@/hooks/useSerproPagamentos';

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

/**
 * Painel de UM cliente. Abrir = documentos já salvos (grátis). "Consultar" baixa os pagamentos do mês de apuração;
 * a busca avançada usa os filtros do serviço (tipo, documento, receita, datas e valores). O comprovante é emitido por
 * clique, uma vez: depois só se reabre o arquivo guardado.
 */
export function PagamentosClienteSheet({
  linha, competencia, consultando, onConsultar, onClose,
}: {
  linha: LinhaPagamentos | null;
  competencia: string;
  consultando: boolean;
  onConsultar: (contactId: string) => void;
  onClose: () => void;
}) {
  const { data: todos = [], isLoading } = usePagamentosCliente(linha?.contact_id ?? null);
  const buscar = useConsultarPagamentos();
  const comprovante = useComprovantePagamento();
  const publicar = usePublicarPagamento();
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

        <div className="mt-5 space-y-3 rounded-lg border border-line bg-bg-2 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => onConsultar(linha.contact_id)} disabled={consultando}>
              {consultando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Consultar
            </Button>
            <Button variant="outline" onClick={() => setAvancada((v) => !v)}>
              <Search className="mr-2 h-4 w-4" /> Busca avançada
            </Button>
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
              <Button onClick={buscaAvancada} disabled={buscar.isPending}>
                {buscar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Buscar
              </Button>
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
                      <button type="button" className="flex items-center gap-1 text-meta text-muted-ink hover:text-ink" onClick={() => setAbertos((a) => ({ ...a, [p.id]: !aberto }))}>
                        <ChevronDown className={`h-4 w-4 transition-transform ${aberto ? 'rotate-180' : ''}`} /> Composição ({comp.length})
                      </button>
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
                    <Button size="sm" variant={p.comprovante_path ? 'outline' : 'default'} onClick={() => baixarComprovante(p)} disabled={emitindo === p.id}>
                      {emitindo === p.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileDown className="mr-1.5 h-4 w-4" />}
                      {p.comprovante_path ? 'Baixar comprovante' : 'Emitir comprovante'}
                    </Button>
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
      </SheetContent>
    </Sheet>
  );
}
