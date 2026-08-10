import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { useCompany } from '@/hooks/useCompany';
import { useAudience } from '@/hooks/useAudience';

// Chaves, rótulos e agrupamentos vivem em src/constants/modules.ts — fonte única
// compartilhada com o menu e o cadastro de usuário.
import {
  DEFAULT_PLAN_MODULES,
  LEGACY_MODULE_ALIASES,
  LEGACY_SUBMODULE_ALIASES,
  MODULE_PRIORITY,
  MODULE_ROUTE_MAP,
  SUB_MODULES_BY_PARENT,
  moduleAllowsAudience,
} from '@/constants/modules';

interface ModuleGuardProps {
  moduleName: string;
  subModule?: string;
  children: ReactNode;
  requireAdmin?: boolean;
  /** Rota que cliente externo não acessa, mesmo tendo o módulo no plano. */
  internalOnly?: boolean;
}

export function ModuleGuard({
  moduleName, subModule, children, requireAdmin = false, internalOnly = false,
}: ModuleGuardProps) {
  const { isSuperAdmin, isAdmin, allowedModules, isLoading } = useUserRole();
  const { company, isLoading: loadingCompany } = useCompany();
  const audience = useAudience();

  if (isLoading || loadingCompany) return null;

  // Fronteira estrutural interno×externo, antes de papel/plano: rota de módulo
  // interno não abre em audiência externa — nem por deep link, nem pro super
  // admin no modo Sistema Externo (o seletor redireciona pra Home, que é 'both').
  if (!moduleAllowsAudience(moduleName, audience)) {
    return <Navigate to="/" replace />;
  }

  if (isSuperAdmin) return <>{children}</>;

  // Antes de qualquer checagem de plano: a regra de produto vale mesmo com o
  // módulo contratado. Minha Conta é o destino porque é onde o dado foi parar.
  if (internalOnly && (company as any)?.is_internal === false) {
    return <Navigate to="/minha-conta" replace />;
  }

  const planModules: string[] = (company as any)?.plan_modules ?? DEFAULT_PLAN_MODULES;

  const moduleKeysToCheck = [moduleName, ...(LEGACY_MODULE_ALIASES[moduleName] ?? [])];
  const userHasModule = moduleKeysToCheck.some((k) => allowedModules.includes(k));
  const planHasModule = moduleKeysToCheck.some((k) => planModules.includes(k));
  let hasAccess = planHasModule && userHasModule;

  // Sub-module gating — mirror AppSidebar's subEnabledByPlan + user allowed check.
  if (hasAccess && subModule) {
    const siblings = SUB_MODULES_BY_PARENT[moduleName] ?? [];
    const explicitInPlan = siblings.filter((k) => planModules.includes(k));
    const subKeysToCheck = [subModule, ...(LEGACY_SUBMODULE_ALIASES[subModule] ?? [])];

    // Plan-level: if parent has explicit submodules in plan, require this one.
    // If none are explicit ("grosso", e.g. CA), all submodules are enabled.
    const subEnabledByPlan =
      explicitInPlan.length === 0 || subKeysToCheck.some((k) => planModules.includes(k));
    if (!subEnabledByPlan) hasAccess = false;

    // User-level: for non-admin users, if any sibling sub-key is set on the user,
    // require this specific sub-key too. Otherwise (no siblings set) keep legacy full access.
    if (hasAccess && !isAdmin) {
      const hasAnySibling = siblings.some((k) => allowedModules.includes(k));
      if (hasAnySibling && !subKeysToCheck.some((k) => allowedModules.includes(k))) {
        hasAccess = false;
      }
    }
  }



  if (!hasAccess) {
    const firstAccessible = MODULE_PRIORITY.find(
      (m) => m !== moduleName && planModules.includes(m) && allowedModules.includes(m)
    );

    if (firstAccessible) {
      return <Navigate to={MODULE_ROUTE_MAP[firstAccessible]} replace />;
    }

    return <Navigate to="/sem-acesso" replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/fiscal/tarefas" replace />;
  }

  return <>{children}</>;
}

