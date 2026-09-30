import type { ReactNode } from 'react';
import { LinhaCusto } from '@/components/serpro/CustoSerpro';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Rodapé de diálogo: no celular o botão ocupa a largura toda (como antes da dica); no desktop, o tamanho do texto. */
export const DICA_RODAPE = 'flex sm:inline-flex [&>button]:w-full sm:[&>button]:w-auto';
/** Botão que preenche a célula/linha onde está (grade de botões, "carregar mais"). */
export const DICA_LARGURA_TOTAL = 'flex [&>button]:w-full';

/**
 * Explica o botão depois de 1 segundo com o mouse em cima. O `span` faz a dica aparecer também em botão desabilitado
 * (botão desabilitado não recebe o mouse). Não repetir `title` no botão: apareceriam duas dicas.
 * `custo`: quando o clique gera cobrança no Serpro, a dica mostra o valor, mas só para administrador e super administrador.
 */
export function DicaBotao({ texto, custo, className = 'inline-flex', children }: { texto: string; custo?: 'Consultar' | 'Emitir'; className?: string; children: ReactNode }) {
  return (
    <Tooltip delayDuration={1000}>
      <TooltipTrigger asChild><span className={className}>{children}</span></TooltipTrigger>
      <TooltipContent className="max-w-[300px] text-meta leading-snug">
        <p>{texto}</p>
        {custo && <LinhaCusto tipo={custo} />}
      </TooltipContent>
    </Tooltip>
  );
}
