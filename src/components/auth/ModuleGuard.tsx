import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { useCompany } from '@/hooks/useCompany';

// Chaves, rótulos e agrupamentos vivem em src/constants/modules.ts — fonte única
// compartilhada com o menu e o cadastro de usuário.
import {
  DEFAULT_PLAN_MODULES,
  LEGACY_MODULE_ALIASES,
  LEGACY_SUBMODULE_ALIASES,
  MODULE_PRIORITY,
  MODULE_ROUTE_MAP,
  SUB_MODULES_BY_PARENT,
} from '@/constants/modules';

interface ModuleGuardProps {
  moduleName: string;
  subModule?: string;
  children: ReactNode;
  requireAdmin?: boolean;
}

export function ModuleGuard({ moduleName, subModule, children, requireAdmin = false }: ModuleGuardProps) {
  const { isSuperAdmin, isAdmin, allowedModules, isLoading } = useUserRole();
  const { company } = useCompany();

  if (isLoading) return null;

  if (isSuperAdmin) return <>{children}</>;

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

