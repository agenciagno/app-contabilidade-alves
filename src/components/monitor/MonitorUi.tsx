/**
 * Peças do molde único das listas de Monitoramento (Rodada 1, 08/10/2026): selo em duas camadas, faixa de contadores que filtra
 * e "última busca". Toda tela de Monitoramento que adotar o molde usa estas peças, para a equipe ler todas do mesmo jeito.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';

import { DsBadge } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  COR_ESTADO, DICA_ESTADO, ESTADOS, ROTULO_ESTADO, TOM_ESTADO,
  type ContagemEstados, type EstadoMonitor, type Selo,
} from '@/lib/monitorEstados';

/** Selo da linha: cor = gravidade, texto = motivo. `outros` lista, embaixo, o que mais pede atenção no mesmo cliente. */
export function SeloMonitor({ selo, outros = [], vazio = '—' }: { selo: Selo | null; outros?: string[]; vazio?: string }) {
  if (!selo) return <span className="text-meta text-muted-ink-2">{vazio}</span>;
  const extra = outros.length > 2 ? [...outros.slice(0, 2), `e mais ${outros.length - 2}`] : outros;
  return (
    <div className="space-y-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex"><DsBadge tone={TOM_ESTADO[selo.estado]}>{selo.motivo}</DsBadge></span>
        </TooltipTrigger>
        <TooltipContent>{ROTULO_ESTADO[selo.estado]}: {DICA_ESTADO[selo.estado]}</TooltipContent>
      </Tooltip>
      {extra.length > 0 && <p className="max-w-[220px] text-meta text-muted-ink-2">{extra.join(' · ')}</p>}
    </div>
  );
}

/** Selo pequeno, sem dica: para colunas de detalhe (declaração, DAS) ao lado do selo principal. */
export function SeloMini({ selo, vazio = '—' }: { selo: Selo | null; vazio?: string }) {
  if (!selo) return <span className="text-meta text-muted-ink-2">{vazio}</span>;
  return <DsBadge tone={TOM_ESTADO[selo.estado]} dot={false}>{selo.motivo}</DsBadge>;
}

/**
 * Faixa de contadores no topo da lista: Total + os estados. Clicar filtra a lista; clicar de novo limpa.
 * "Processando" só aparece quando há alguma consulta em andamento.
 */
export function FaixaEstados({
  contagem, ativo, onChange, unidade = ['cliente', 'clientes'],
}: {
  contagem: ContagemEstados;
  ativo: EstadoMonitor | null;
  onChange: (e: EstadoMonitor | null) => void;
  unidade?: [string, string];
}) {
  const estados = ESTADOS.filter((e) => e !== 'processando' || contagem.processando > 0);
  const item = (chave: EstadoMonitor | null, rotulo: string, valor: number, dica: string) => {
    const selecionado = ativo === chave;
    return (
      <Tooltip key={chave ?? 'total'}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-pressed={selecionado}
            onClick={() => onChange(selecionado || chave === null ? null : chave)}
            className={cn(
              'flex min-w-0 flex-col gap-1 rounded-md border px-4 py-3 text-left transition-colors',
              selecionado ? 'border-ink bg-bg-2' : 'border-line bg-paper hover:border-ink/40',
            )}
          >
            <span className="flex items-center gap-1.5 text-kicker uppercase text-muted-ink">
              {chave && <span className="h-2 w-2 shrink-0 rounded-pill" style={{ background: COR_ESTADO[chave] }} aria-hidden />}
              {rotulo}
            </span>
            <span className="text-metric-xl text-ink">{valor}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>{dica}</TooltipContent>
      </Tooltip>
    );
  };
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3', estados.length > 4 ? 'lg:grid-cols-6' : 'lg:grid-cols-5')}>
      {item(null, 'Total', contagem.total, `Todos os ${unidade[1]} da lista. Clique para tirar o filtro.`)}
      {estados.map((e) => item(e, ROTULO_ESTADO[e], contagem[e], `${DICA_ESTADO[e]} Clique para ver só esses ${unidade[1]}.`))}
    </div>
  );
}

const ESTADO_VALIDO = new Set<string>(ESTADOS);

/** Estado escolhido na faixa, guardado na URL (`?estado=`): um link do painel abre a lista já filtrada. */
export function useEstadoUrl(): [EstadoMonitor | null, (e: EstadoMonitor | null) => void] {
  const [params, setParams] = useSearchParams();
  const v = params.get('estado');
  const estado = v && ESTADO_VALIDO.has(v) ? (v as EstadoMonitor) : null;
  const mudar = (e: EstadoMonitor | null) => {
    const p = new URLSearchParams(params);
    if (e) p.set('estado', e); else p.delete('estado');
    setParams(p, { replace: true });
  };
  return [estado, mudar];
}

/** Data da última consulta do cliente; "Nunca" quando não houve. */
export function UltimaBusca({ iso }: { iso: string | null }) {
  return iso
    ? <span className="whitespace-nowrap rounded-sm bg-bg-2 px-2 py-1 font-mono text-meta text-ink">{format(new Date(iso), 'dd/MM/yyyy')}</span>
    : <span className="text-meta text-muted-ink-2">Nunca</span>;
}

/**
 * Rodapé das listas: quantos aparecem e quantas filiais ficaram de fora (seguem a matriz, como no painel).
 * Com `faixa` (lista paginada) diz "Mostrando 31–60 de 120": `mostrando` continua sendo o total depois dos filtros.
 */
export function RodapeLista({ mostrando, total, unidade, filiais = 0, faixa }: { mostrando: number; total: number; unidade: string; filiais?: number; faixa?: { de: number; ate: number } }) {
  const filiaisTxt = filiais > 0 ? ` · ${filiais} ${filiais === 1 ? 'filial segue a matriz e fica' : 'filiais seguem a matriz e ficam'} de fora` : '';
  if (faixa) {
    return (
      <p className="text-meta text-muted-ink-2">
        Mostrando {faixa.de}–{faixa.ate} de {mostrando}{mostrando === total ? ` ${unidade}` : ` (${total} ${unidade} no total)`}{filiaisTxt}.
      </p>
    );
  }
  return (
    <p className="text-meta text-muted-ink-2">
      Mostrando {mostrando} de {total} {unidade}{filiaisTxt}.
    </p>
  );
}

export const POR_PAGINA = [30, 50, 100] as const;

/**
 * Paginação de lista: recorta a lista já filtrada. Os contadores do topo (FaixaEstados) continuam vindo da lista inteira.
 * `chaveReset` volta para a página 1 quando a busca ou um filtro muda.
 */
export function usePaginacao<T>(itens: T[], chaveReset: string, padrao: number = POR_PAGINA[0]) {
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState<number>(padrao);
  useEffect(() => { setPagina(1); }, [chaveReset, porPagina]);
  const totalPaginas = Math.max(1, Math.ceil(itens.length / porPagina));
  const atual = Math.min(pagina, totalPaginas);
  const inicio = (atual - 1) * porPagina;
  return {
    pagina: atual, setPagina, porPagina, setPorPagina, totalPaginas,
    recorte: itens.slice(inicio, inicio + porPagina),
    faixa: { de: itens.length ? inicio + 1 : 0, ate: Math.min(inicio + porPagina, itens.length) },
  };
}

/** Controles da paginação: quantos por página (30, 50 ou 100) e anterior/próxima. Some quando a lista cabe numa página do menor tamanho. */
export function PaginacaoLista({ pagina, totalPaginas, porPagina, total, onPagina, onPorPagina, unidade = 'clientes' }: {
  pagina: number; totalPaginas: number; porPagina: number; total: number; unidade?: string;
  onPagina: (p: number) => void; onPorPagina: (n: number) => void;
}) {
  if (total <= POR_PAGINA[0]) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label className="flex items-center gap-2 text-meta text-muted-ink">
        Mostrar
        <Select value={String(porPagina)} onValueChange={(v) => { if (v) onPorPagina(Number(v)); }}>
          <SelectTrigger className="h-9 w-[76px]" aria-label={`${unidade} por página`}><SelectValue /></SelectTrigger>
          <SelectContent>
            {POR_PAGINA.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
        por página
      </label>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => onPagina(pagina - 1)}>Anterior</Button>
        <span className="whitespace-nowrap text-meta text-muted-ink">Página {pagina} de {totalPaginas}</span>
        <Button variant="outline" size="sm" disabled={pagina >= totalPaginas} onClick={() => onPagina(pagina + 1)}>Próxima</Button>
      </div>
    </div>
  );
}

/**
 * Tipo da situação, sem datas e números: "DAS vence 20/10" e "DAS vence 22/10" são o mesmo tipo ("DAS vence"),
 * "Em falta: 07/2026" vira "Em falta". É o que o filtro por situação enumera.
 */
export const tipoDoSelo = (s: Selo | null): string =>
  (s ? s.motivo.replace(/:.*$/, '').replace(/\s+(até\s+)?\d{1,2}\/\d{2}.*$/, '').trim() : '');

const GRAVIDADE: EstadoMonitor[] = ['atencao', 'pendencia', 'processando', 'nao_verificado', 'em_dia'];
const SEM_SELO = '__sem__';

/**
 * Filtro por situação de UMA coluna: lista só os tipos de situação que existem na lista, com quantos clientes tem cada um
 * (do mais grave ao menos grave). `selos` é o selo de cada cliente da lista antes deste filtro; `valor` null = todos.
 * `chave` troca o que conta como "mesmo tipo" (padrão: `tipoDoSelo`).
 */
export function FiltroSelo({ rotulo, selos, valor, onChange, chave = tipoDoSelo, semSelo = 'Sem informação' }: {
  rotulo: string;
  selos: (Selo | null)[];
  valor: string | null;
  onChange: (v: string | null) => void;
  chave?: (s: Selo | null) => string;
  semSelo?: string;
}) {
  const opcoes = useMemo(() => {
    const m = new Map<string, { n: number; estado: EstadoMonitor | null }>();
    for (const s of selos) {
      const k = s ? chave(s) : SEM_SELO;
      const atual = m.get(k);
      m.set(k, { n: (atual?.n ?? 0) + 1, estado: s?.estado ?? null });
    }
    return [...m.entries()]
      .map(([k, v]) => ({ k, n: v.n, estado: v.estado, texto: k === SEM_SELO ? semSelo : k }))
      .sort((a, b) => (a.estado ? GRAVIDADE.indexOf(a.estado) : 99) - (b.estado ? GRAVIDADE.indexOf(b.estado) : 99) || a.texto.localeCompare(b.texto, 'pt-BR'));
  }, [selos, chave, semSelo]);
  // Se o tipo escolhido sumiu da lista (ex.: mudou a competência), o filtro volta para "todas" sozinho.
  useEffect(() => { if (valor !== null && !opcoes.some((o) => o.k === valor)) onChange(null); }, [opcoes, valor, onChange]);
  return (
    <Select value={valor ?? 'todas'} onValueChange={(v) => { if (v) onChange(v === 'todas' ? null : v); }}>
      <SelectTrigger className="w-[230px]" aria-label={`Filtrar por ${rotulo}`}>
        <span className="mr-1.5 shrink-0 text-muted-ink">{rotulo}:</span>
        <span className="min-w-0 flex-1 truncate text-left"><SelectValue /></span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="todas">Todas ({selos.length})</SelectItem>
        {opcoes.map((o) => <SelectItem key={o.k} value={o.k}>{o.texto} ({o.n})</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** Aplica o valor de um `FiltroSelo` a um selo. */
export const passaFiltroSelo = (s: Selo | null, valor: string | null, chave: (s: Selo | null) => string = tipoDoSelo) =>
  valor === null || (s ? chave(s) === valor : valor === SEM_SELO);
