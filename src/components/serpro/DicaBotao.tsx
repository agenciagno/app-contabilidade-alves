import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Explica o botão depois de 1 segundo com o mouse em cima. O `span` faz a dica aparecer também em botão desabilitado
 * (botão desabilitado não recebe o mouse). Não repetir `title` no botão: apareceriam duas dicas.
 */
export function DicaBotao({ texto, children }: { texto: string; children: ReactNode }) {
  return (
    <Tooltip delayDuration={1000}>
      <TooltipTrigger asChild><span className="inline-flex">{children}</span></TooltipTrigger>
      <TooltipContent className="max-w-[300px] text-meta leading-snug">{texto}</TooltipContent>
    </Tooltip>
  );
}
