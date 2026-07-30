import { Hammer } from 'lucide-react';
import { EM_BREVE } from '@/constants/modules';

interface EmBreveProps {
  /** Chave do módulo em `EM_BREVE` (src/constants/modules.ts). */
  moduleKey: string;
}

/**
 * Casca padrão das rotas que já estão no menu mas ainda não têm tela.
 * Um componente só para todas — quando a tela real nascer, troca a rota no App.tsx
 * e remove a entrada de `EM_BREVE`.
 */
export function EmBreve({ moduleKey }: EmBreveProps) {
  const info = EM_BREVE[moduleKey];

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Hammer className="h-6 w-6 text-primary" strokeWidth={1.75} />
        </div>

        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold text-foreground">
            {info?.titulo ?? 'Em construção'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {info?.descricao ?? 'Este módulo está em construção.'}
          </p>
        </div>

        <div className="flex flex-col items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
            Em construção
          </span>
          {info?.fase && (
            <span className="text-xs text-muted-foreground/70">{info.fase}</span>
          )}
        </div>
      </div>
    </div>
  );
}
