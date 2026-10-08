/**
 * Peças do molde único das listas de Monitoramento (Rodada 1, 08/10/2026): selo em duas camadas, faixa de contadores que filtra
 * e "última busca". Toda tela de Monitoramento que adotar o molde usa estas peças, para a equipe ler todas do mesmo jeito.
 */
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';

import { DsBadge } from '@/components/ds';
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
  if (!iso) return <span className="text-meta text-muted-ink-2">Nunca</span>;
  return <span className="whitespace-nowrap rounded-sm bg-bg-2 px-2 py-1 font-mono text-meta text-ink">{format(new Date(iso), 'dd/MM/yyyy')}</span>;
}
