import { useState } from 'react';
import { Calendar, Scale, Sparkles, Target, TrendingUp, type LucideIcon } from 'lucide-react';
import { ETAPAS_TRANSICAO } from '@/lib/rt/trajetoria';

const ICONES: Record<string, LucideIcon> = {
  '2026': Sparkles,
  '2027': Calendar,
  '2028': Scale,
  '2029-2032': TrendingUp,
  '2033': Target,
};

/**
 * Linha do tempo da transição: clicar numa etapa abre o detalhe embaixo.
 * Mostrar as cinco explicações de uma vez vira parede de texto e ninguém lê.
 */
export function LinhaDoTempo() {
  const [ativa, setAtiva] = useState(ETAPAS_TRANSICAO[0].id);
  const etapa = ETAPAS_TRANSICAO.find((e) => e.id === ativa) ?? ETAPAS_TRANSICAO[0];
  const IconeAtivo = ICONES[etapa.id] ?? Sparkles;

  return (
    <div className="space-y-5">
      {/* Trilha */}
      <div className="flex items-start">
        {ETAPAS_TRANSICAO.map((e, i) => {
          const Icone = ICONES[e.id] ?? Sparkles;
          const selecionada = e.id === ativa;
          return (
            <div key={e.id} className="flex flex-1 items-start">
              <button
                type="button"
                onClick={() => setAtiva(e.id)}
                aria-pressed={selecionada}
                className={`relative flex flex-1 flex-col items-center gap-2 rounded-xl px-1 py-3 transition-colors ${
                  selecionada ? 'bg-muted/60 ring-1 ring-primary/40' : 'hover:bg-muted/40'
                }`}
              >
                {e.destaque && (
                  <span className="absolute -top-2 whitespace-nowrap rounded-full bg-warn px-2 py-0.5 text-[10px] font-semibold text-white">
                    maior virada
                  </span>
                )}
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                    selecionada
                      ? 'border-transparent bg-primary text-primary-foreground'
                      : e.destaque
                        ? 'border-warn/60 text-warn'
                        : 'border-border text-muted-foreground'
                  }`}
                >
                  <Icone className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <span
                  className={`whitespace-nowrap text-[11px] font-medium tabular-nums sm:text-xs ${
                    selecionada ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {e.rotulo}
                </span>
              </button>
              {i < ETAPAS_TRANSICAO.length - 1 && (
                <span className="mt-[30px] h-px w-2 shrink-0 bg-border sm:w-4" />
              )}
            </div>
          );
        })}
      </div>

      {/* Detalhe da etapa escolhida */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <IconeAtivo className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-xs font-semibold text-primary">{etapa.rotulo}</p>
            <p className="text-base font-semibold">{etapa.titulo}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{etapa.texto}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
