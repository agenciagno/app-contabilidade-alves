import { useCompany } from '@/hooks/useCompany';
import { useUserRole } from '@/hooks/useUserRole';
import { useAudience, type Audience } from '@/hooks/useAudience';
import { useViewMode } from '@/contexts/ViewModeContext';
import {
  DEFAULT_PLAN_MODULES,
  LEGACY_MODULE_ALIASES,
  LEGACY_SUBMODULE_ALIASES,
  SUB_MODULES_BY_PARENT,
  moduleAllowsAudience,
  type ModuleAudience,
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
  /**
   * Audiência do item de menu que NÃO tem chave de módulo/submódulo própria
   * (ex.: Clientes Externos, LGPD, Agente IA no grupo Tech). Itens com chave
   * usam MODULE_AUDIENCE; ausente = visível nas duas visões.
   */
  audience?: ModuleAudience;
}

/**
 * Regras de visibilidade de módulo, em um lugar só.
 *
 * Vale para plano da empresa (`companies.plan_modules`) × permissão do usuário
 * (`profiles.allowed_modules`) × papel × audiência (interno×externo). Usado pelo
 * menu e pela busca do header — sem isso a busca mostraria rota que o usuário
 * não pode abrir.
 *
 * "Ver como cliente" (previewTenant): super admin no modo externo simula o
 * plano de um tenant — visibilidade calculada como se fosse um ADMIN daquele
 * tenant (plano dele, sem recorte de usuário). Preview é visual: não muda
 * permissão nem dado.
 */
export function useModuleAccess() {
  const { isSuperAdmin, isAdmin, allowedModules } = useUserRole();
  const { company } = useCompany();
  const audience = useAudience();
  const { previewTenant } = useViewMode();

  // Preview só vale para super admin em modo externo (setado só lá, mas o
  // guard duplo aqui evita estado fantasma).
  const preview = isSuperAdmin && audience === 'external' ? previewTenant : null;

  const planModules: string[] = preview
    ? preview.planModules
    : ((company as any)?.plan_modules ?? DEFAULT_PLAN_MODULES);
  const isExternalCompany = (company as any)?.is_internal === false;

  // Papéis "atuando": durante o preview o super admin vira um admin do tenant.
  const actingSuperAdmin = isSuperAdmin && !preview;
  const actingAdmin = preview ? true : isAdmin;

  const isModuleVisible = (moduleKey: string) => {
    // Audiência vem ANTES do papel: vale até para super admin — é o que faz o
    // seletor Interno/Externo filtrar o menu de verdade.
    if (!moduleAllowsAudience(moduleKey, audience)) return false;
    if (actingSuperAdmin) return true;
    const keys = [moduleKey, ...(LEGACY_MODULE_ALIASES[moduleKey] ?? [])];
    const planOk = keys.some((k) => planModules.includes(k));
    if (preview) return planOk; // preview simula admin do tenant: plano decide
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
    // Submódulo também tem lado: Boletos/DRE/Sicoob/Eventos são internos;
    // C&F/Categorias são do produto. Vale para super admin (é o switch).
    if (subKey && !moduleAllowsAudience(subKey, audience)) return false;
    if (actingSuperAdmin) return true;
    if (!subEnabledByPlan(parentKey, subKey)) return false;
    if (actingAdmin) return true;
    if (!subKey) return true;
    const siblings = SUB_MODULES_BY_PARENT[parentKey] ?? [];
    const hasAnySibling = siblings.some((k) => allowedModules.includes(k));
    if (!hasAnySibling) return true;
    const keys = [subKey, ...(LEGACY_SUBMODULE_ALIASES[subKey] ?? [])];
    return keys.some((k) => allowedModules.includes(k));
  };

  const passesRoleGate = (item: RoleGated) => {
    // Audiência primeiro — um item 'internal' some no modo externo até para
    // super admin; durante o preview, itens de super admin também somem.
    if (item.audience && item.audience !== 'both' && item.audience !== audience) return false;
    if (item.requireSuperAdmin && !actingSuperAdmin) return false;
    if (item.requireAdmin && !actingAdmin && !actingSuperAdmin) return false;
    // Audiência efetiva no lugar de is_internal cru: pro usuário comum dá no
    // mesmo; pro super admin faz o item sumir também no modo Sistema Externo.
    if (item.internalOnly && audience === 'external') return false;
    return true;
  };

  return { isModuleVisible, isSubItemVisible, passesRoleGate, isExternalCompany };
}
