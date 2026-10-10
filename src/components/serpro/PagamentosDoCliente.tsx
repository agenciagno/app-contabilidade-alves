/**
 * Pagamentos de UM cliente, em peças reutilizáveis (10/10/2026): o mesmo bloco aparece na tela Pagamentos, na ficha do Simples
 * Nacional e na ação "Pagamentos" das demais tabelas do Dashboard Federal (vale para qualquer regime, inclusive Lucro Presumido e Real).
 * Abrir é grátis: só lê o que já está salvo. Consultar (por mês), busca avançada e comprovante cobram, e o botão diz quanto (só para admin).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ChevronDown, FileDown, Loader2, RefreshCw, Search } from 'lucide-react';

import { DsBadge } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { CompetenciaNav } from '@/components/serpro/CompetenciaNav';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { useConsultaPagamentos } from '@/components/serpro/useConsultaPagamentos';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  competenciaPadrao, mesDeData, siglaCompetencia, useComprovantePagamento, useConsultarPagamentos, usePagamentosCliente, usePublicarPagamento,
  type FiltrosPagamentos, type PagamentoRow,
} from '@/hooks/useSerproPagamentos';

export const moedaPag = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
export const dataPagBR = (iso: string | null) => (iso ? format(new Date(`${iso.slice(0, 10)}T00:00:00`), 'dd/MM/yyyy') : '—');
const dataHoraBR = (iso: string | null) => (iso ? format(new Date(iso), 'dd/MM/yyyy HH:mm') : '—');

const TIPOS_FILTRO = [
  { value: 'todos', label: 'Todos os tipos' },
  { value: '04', label: 'DARF' },
  { value: '09', label: 'DAS' },
  { value: '10', label: 'DAE' },
  { value: '07', label: 'DJE' },
];
const lista = (texto: string) => texto.split(/[\s,;]+/).map((t) => t.replace(/\D/g, '')).filter(Boolean);

/** Números de documento pagos mais de uma vez (duplicidade). */
export function numerosDuplicados(todos: PagamentoRow[]): Set<string> {
  const n = new Map<string, number>();
  for (const p of todos) n.set(p.numero_documento, (n.get(p.numero_documento) ?? 0) + 1);
  return new Set([...n.entries()].filter(([, q]) => q > 1).map(([k]) => k));
}

/** Um documento pago: valores, composição por receita, comprovante (emite uma vez, depois só reabre) e publicação no portal. */
export function DocumentoPagamentoCard({ p, duplicado = false, emitidoEm, extrato }: {
  p: PagamentoRow; duplicado?: boolean; emitidoEm?: string | null; extrato?: ReactNode;
}) {
  const comprovante = useComprovantePagamento();
  const publicar = usePublicarPagamento();
  const [aberto, setAberto] = useState(false);
  const [emitindo, setEmitindo] = useState(false);
  const comp = p.desmembramentos ?? [];

  const baixarComprovante = async () => {
    setEmitindo(true);
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
      setEmitindo(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-line bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <DsBadge tone="info">{p.tipo_sigla}</DsBadge>
            <span className="font-mono text-ui text-ink">{p.numero_documento}</span>
            {duplicado && <DsBadge tone="danger">Duplicidade</DsBadge>}
            {(p.valor_saldo_total ?? 0) > 0 && <DsBadge tone="info">Saldo {moedaPag(p.valor_saldo_total)}</DsBadge>}
          </div>
          <p className="mt-1 text-meta text-muted-ink">
            PA {p.periodo_apuracao ? `${p.periodo_apuracao.slice(5, 7)}/${p.periodo_apuracao.slice(0, 4)}` : '—'}
            {' · '}Pago em {dataPagBR(p.data_arrecadacao)} · Vence em {dataPagBR(p.data_vencimento)}{emitidoEm ? ` · Emitido em ${dataHoraBR(emitidoEm)}` : ''}
          </p>
          {(p.receita_codigo || p.receita_descricao) && (
            <p className="text-meta text-muted-ink-2">Receita {p.receita_codigo}{p.receita_descricao ? ` · ${p.receita_descricao}` : ''}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-[18px] font-medium text-ink">{moedaPag(p.valor_total)}</p>
          {(p.valor_multa || p.valor_juros) ? (
            <p className="text-meta text-muted-ink-2">principal {moedaPag(p.valor_principal)} · multa {moedaPag(p.valor_multa)} · juros {moedaPag(p.valor_juros)}</p>
          ) : null}
        </div>
      </div>

      {comp.length > 0 && (
        <div>
          <DicaBotao texto="Mostra ou esconde a composição deste documento: quais receitas e valores formam o total.">
            <button type="button" className="flex items-center gap-1 text-meta text-muted-ink hover:text-ink" onClick={() => setAberto((v) => !v)}>
              <ChevronDown className={`h-4 w-4 transition-transform ${aberto ? 'rotate-180' : ''}`} /> Composição ({comp.length})
            </button>
          </DicaBotao>
          {aberto && (
            <div className="mt-2 divide-y divide-line rounded-md border border-line">
              {comp.map((d, i) => (
                <div key={`${d.sequencial ?? i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-meta">
                  <span className="min-w-0 text-ink">{d.receitaPrincipal?.codigo}{d.receitaPrincipal?.descricao ? ` · ${d.receitaPrincipal.descricao}` : ''}</span>
                  <span className="shrink-0 font-mono text-ink">{moedaPag(d.valorTotal ?? null)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <DicaBotao custo={p.comprovante_path ? undefined : 'Emitir'}
          texto={p.comprovante_path ? 'Baixa o comprovante de pagamento que já está guardado. Não consulta a Receita.' : 'Emite na Receita o comprovante deste pagamento e guarda o PDF. Depois, é só reabrir o arquivo.'}>
          <Button size="sm" variant={p.comprovante_path ? 'outline' : 'default'} onClick={baixarComprovante} disabled={emitindo}>
            {emitindo ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileDown className="mr-1.5 h-4 w-4" />}
            {p.comprovante_path ? 'Baixar comprovante' : 'Emitir comprovante'}{!p.comprovante_path && <Preco tipo="Emitir" />}
          </Button>
        </DicaBotao>
        {extrato}
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
}

/**
 * Consultar o mês, busca avançada e a lista de documentos pagos do cliente (DARF, DAS, DAE, DJE) com composição e comprovante.
 * `excluirIds`: documentos que a tela já mostra em outro lugar (o DAS do mês, na tela Pagamentos). `meio`: bloco que entra entre
 * a consulta e a lista. Sem `onConsultar`, o componente consulta sozinho (e mostra o aviso de "consultado há pouco").
 */
export function PagamentosDoCliente({
  contactId, competencia, excluirIds, soMesInicial = true, consultando: consultandoFora, onConsultar, consultadoEm, temDasNoMes = false, meio,
}: {
  contactId: string;
  competencia: string;
  excluirIds?: Set<string>;
  soMesInicial?: boolean;
  consultando?: boolean;
  onConsultar?: (contactId: string) => void;
  /** Última consulta deste mês (null = nunca; undefined = não sei). */
  consultadoEm?: string | null;
  temDasNoMes?: boolean;
  meio?: ReactNode;
}) {
  const { data: todos = [], isLoading } = usePagamentosCliente(contactId);
  const buscar = useConsultarPagamentos();
  const interna = useConsultaPagamentos(competencia);
  const [soMes, setSoMes] = useState(soMesInicial);
  const [avancada, setAvancada] = useState(false);
  const [f, setF] = useState({ tipo: 'todos', numero: '', receita: '', de: '', ate: '', valorDe: '', valorAte: '' });

  const consultando = consultandoFora ?? interna.emAndamento === contactId;
  const consultar = () => (onConsultar ? onConsultar(contactId) : interna.executar(contactId));

  const visiveis = useMemo(
    () => todos.filter((p) => !(excluirIds?.has(p.id)) && (!soMes || (p.periodo_apuracao ?? '').slice(0, 7) === competencia)),
    [todos, excluirIds, soMes, competencia],
  );
  const duplicados = useMemo(() => numerosDuplicados(todos), [todos]);

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
      const r = await buscar.mutateAsync({ contactId, competencia, filtros });
      if (r.foraDoMonitoramento || !r.ok) { toast.error(r.error ?? 'Falha na busca.'); return; }
      setSoMes(false);
      toast.success(`${r.documentos ?? 0} documentos encontrados (${r.novos ?? 0} novos). Mostrando todos os meses.`);
    } catch (e) {
      toast.error((e as Error)?.message || 'Falha na busca. Tente novamente em instantes.');
    }
  };

  return (
    <>
      <div className="space-y-3 rounded-lg border border-line bg-bg-2 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <DicaBotao custo="Consultar" texto={`Baixa da Receita os pagamentos da competência ${siglaCompetencia(competencia)} deste cliente.`}>
            <Button onClick={consultar} disabled={consultando}>
              {consultando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Consultar pagamentos de {siglaCompetencia(competencia)}<Preco tipo="Consultar" />
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

      {meio}

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
            {consultadoEm && soMes
              ? (temDasNoMes ? 'Sem outros documentos (DARF, DAE) nesta competência além do DAS.' : 'Nenhum pagamento registrado pela Receita para esta competência.')
              : todos.length > 0 && soMes
                ? `Nenhum pagamento salvo para ${siglaCompetencia(competencia)}. Use "Consultar" para baixar ou desligue "Só desta competência".`
                : 'Nenhum pagamento salvo ainda. Use "Consultar" para baixar.'}
          </div>
        ) : (
          visiveis.map((p) => <DocumentoPagamentoCard key={p.id} p={p} duplicado={duplicados.has(p.numero_documento)} />)
        )}
      </div>
      {interna.dialog}
    </>
  );
}

/**
 * Janela "Pagamentos do cliente" para qualquer tela: abre pelo menu da linha. Sem o bloco do DAS (cada tela tem o seu); mostra todos os
 * meses salvos e deixa escolher o mês para consultar. Vale para todos os regimes.
 */
export function PagamentosClienteAvulso({ alvo, onClose }: { alvo: { contactId: string; nome: string; documento?: string } | null; onClose: () => void }) {
  const [competencia, setCompetencia] = useState(competenciaPadrao());
  if (!alvo) return null;
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[780px]">
        <SheetHeader className="space-y-1 text-left">
          {alvo.documento && <p className="font-mono text-meta text-muted-ink-2">{alvo.documento}</p>}
          <SheetTitle className="text-[20px]">{alvo.nome}</SheetTitle>
          <SheetDescription>Pagamentos do cliente na Receita (DARF, DAS, DAE e DJE) que já estão salvos.</SheetDescription>
        </SheetHeader>
        <div className="mt-4"><CompetenciaNav competencia={competencia} onChange={setCompetencia} limite={mesDeData(new Date())} /></div>
        <div className="mt-4">
          <PagamentosDoCliente contactId={alvo.contactId} competencia={competencia} soMesInicial={false} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Uso nas tabelas: `const { abrir, janela } = usePagamentosClienteJanela()`; `abrir(contactId, nome, documento)` e `{janela}` no fim da tela. */
export function usePagamentosClienteJanela() {
  const [alvo, setAlvo] = useState<{ contactId: string; nome: string; documento?: string } | null>(null);
  return {
    abrir: (contactId: string, nome: string, documento?: string) => setAlvo({ contactId, nome, documento }),
    janela: <PagamentosClienteAvulso alvo={alvo} onClose={() => setAlvo(null)} />,
  };
}
