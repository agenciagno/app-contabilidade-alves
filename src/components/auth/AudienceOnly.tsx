import { ReactNode } from 'react';
import { useAudience } from '@/hooks/useAudience';

/**
 * Primitivos de audiência para VARIAÇÃO DENTRO DA MESMA TELA — o nível abaixo
 * do módulo (MODULE_AUDIENCE) e da rota (ModuleGuard/AudienceGuard).
 *
 * - Pedaço pequeno (card, aba, botão, campo): embrulhar em <InternalOnly> /
 *   <ExternalOnly>. Greppável — buscar "InternalOnly" lista tudo que é interno.
 * - Tela que diverge de verdade (>~30% diferente): NÃO encher de if/else —
 *   dividir em dois componentes e escolher com <AudienceSwitch>.
 */
export function InternalOnly({ children }: { children: ReactNode }) {
  return useAudience() === 'internal' ? <>{children}</> : null;
}

export function ExternalOnly({ children }: { children: ReactNode }) {
  return useAudience() === 'external' ? <>{children}</> : null;
}

export function AudienceSwitch({ internal, external }: { internal: ReactNode; external: ReactNode }) {
  return useAudience() === 'internal' ? <>{internal}</> : <>{external}</>;
}
