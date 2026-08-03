import { useCompany } from '@/hooks/useCompany';
import { useUserRole } from '@/hooks/useUserRole';
import {
  DEFAULT_PLAN_MODULES,
  LEGACY_MODULE_ALIASES,
  LEGACY_SUBMODULE_ALIASES,
  SUB_MODULES_BY_PARENT,
} from '@/constants/modules';

export interface RoleGated {
  requireAdmin?: boolean;
  requireSuperAdmin?: boolean;
  /**
   * Esconde de cliente externo (empresa com `is_internal = false`).
   * É regra de produto — o que o cliente que assina não enxerga —, e não permissão
   * por tenant. Por isso não sai de `plan_modules`: religar é trocar esta flag.
   */
  internalOnly?: boolean;
}

/**
 * Regras de visibilidade de módulo, em um lugar só.
 *
 * Vale para plano da empresa (`companies.plan_modules`) × permissão do usuário
 * (`profiles.allowed_modules`) × papel. Usado pelo menu e pela busca do header —
 * sem isso a busca mostraria rota que o usuário não pode abrir.
 */
export function useModuleAccess() {
  const { isSuperAdmin, isAdmin, allowedModules } = useUserRole();
  const { company } = useCompany();

  const planModules: string[] = (company as any)?.plan_modules ?? DEFAULT_PLAN_MODULES;
  const isExternalCompany = (company as any)?.is_internal === false;

  const isModuleVisible = (moduleKey: string) => {
    if (isSuperAdmin) return true;
    const keys = [moduleKey, ...(LEGACY_MODULE_ALIASES[moduleKey] ?? [])];
    const planOk = keys.some((k) => planModules.includes(k));
    const userOk = keys.some((k) => allowedModules.includes(k));
    return planOk && userOk;
  };

  // Plano "grosso" (sem nenhum submódulo explícito, caso da CA) habilita todos;
  // plano com recorte só libera os submódulos contratados.
  const subEnabledByPlan = (parentKey: string, subKey?: string) => {
    if (!subKey) return true;
    const siblings = SUB_MODULES_BY_PARENT[parentKey] ?? [];
    const explicit = siblings.filter((k) => planModules.includes(k));
    if (explicit.length === 0) return true;
    return planModules.includes(subKey);
  };

  /**
   * Compatibilidade: usuário que tem o módulo pai mas nenhum submódulo gravado
   * mantém acesso a todos — só quem já tem recorte salvo é filtrado.
   */
  const isSubItemVisible = (parentKey: string, subKey?: string) => {
    if (isSuperAdmin) return true;
    if (!subEnabledByPlan(parentKey, subKey)) return false;
    if (isAdmin) return true;
    if (!subKey) return true;
    const siblings = SUB_MODULES_BY_PARENT[parentKey] ?? [];
    const hasAnySibling = siblings.some((k) => allowedModules.includes(k));
    if (!hasAnySibling) return true;
    const keys = [subKey, ...(LEGACY_SUBMODULE_ALIASES[subKey] ?? [])];
    return keys.some((k) => allowedModules.includes(k));
  };

  const passesRoleGate = (item: RoleGated) => {
    if (item.requireSuperAdmin && !isSuperAdmin) return false;
    if (item.requireAdmin && !isAdmin && !isSuperAdmin) return false;
    if (item.internalOnly && isExternalCompany && !isSuperAdmin) return false;
    return true;
  };

  return { isModuleVisible, isSubItemVisible, passesRoleGate, isExternalCompany };
}
