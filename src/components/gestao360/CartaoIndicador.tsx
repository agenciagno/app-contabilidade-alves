import { ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { DsBadge, IconBox } from '@/components/ds';
import { cn } from '@/lib/utils';

export type Tom = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

/** Cinza enquanto não há dado, vermelho/laranja quando há problema, verde quando há dado e está tudo certo. */
export const tomPor = (problemas: number, comDado: number, gravidade: Tom = 'danger'): Tom => (comDado === 0 ? 'neutral' : problemas > 0 ? gravidade : 'ok');

interface Props {
  titulo: string;
  icone: LucideIcon;
  valor: string;
  hint: string;
  tom: Tom;
  /** Cobertura da fonte: abaixo de 50% o cartão avisa que o número ainda é parcial. */
  cobertura?: { n: number; total: number };
  onClick: () => void;
}

/** Cartão clicável de indicador (Portal 360° e CA · Ausências): mesmo desenho dos cartões do Dashboard Federal. */
export function CartaoIndicador({ titulo, icone: Icone, valor, hint, tom, cobertura, onClick }: Props) {
  const parcial = !!cobertura && cobertura.total > 0 && cobertura.n / cobertura.total < 0.5;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('group flex min-h-[150px] flex-col gap-3 rounded-lg border border-line bg-paper p-5 text-left transition-colors hover:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40')}
    >
      <div className="flex items-center justify-between">
        <IconBox tone={tom} icon={<Icone className="h-5 w-5" />} />
        {parcial ? <DsBadge tone="neutral" dot={false}>Dados parciais</DsBadge> : <ArrowRight className="h-4 w-4 text-muted-ink-2 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />}
      </div>
      <div>
        <p className="text-kicker uppercase text-muted-ink">{titulo}</p>
        <p className="text-metric-xl text-ink">{valor}</p>
      </div>
      <p className="text-meta text-muted-ink">{hint}</p>
    </button>
  );
}
