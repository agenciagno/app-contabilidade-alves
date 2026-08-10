import { useUserRole } from '@/hooks/useUserRole';
import { useCompany } from '@/hooks/useCompany';
import { useViewMode } from '@/contexts/ViewModeContext';

/**
 * Audiência efetiva da sessão — a resposta única para "estou no sistema
 * interno ou no produto externo?".
 *
 * - Usuário comum: deriva da empresa (`companies.is_internal`). Imutável na sessão.
 * - Super admin: segue o seletor Interno/Externo do menu de conta (ViewModeContext),
 *   que permite enxergar o app como cada lado o vê.
 *
 * Distinção que organiza tudo: PLANO (`plan_modules`) é o que o tenant contratou
 * (comercial, por cliente); AUDIÊNCIA é o que é estruturalmente interno da CA e
 * não se vende (declarado em MODULE_AUDIENCE, `src/constants/modules.ts`).
 */
export type Audience = 'internal' | 'external';

export function useAudience(): Audience {
  const { isSuperAdmin } = useUserRole();
  const { company } = useCompany();
  const { viewMode } = useViewMode();

  if (isSuperAdmin) return viewMode;
  return (company as any)?.is_internal === false ? 'external' : 'internal';
}
