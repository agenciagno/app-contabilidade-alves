import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { useCompany } from '@/hooks/useCompany';

const MODULE_ROUTE_MAP: Record<string, string> = {
  home: '/',
  tech: '/disparos',
  financeiro: '/painel-financeiro',
  fiscal: '/fiscal/tarefas',
  contatos: '/contatos',
  legalizacao: '/legalizacao',
  pessoal_rh: '/pessoal-rh',
  acessos: '/acessos',
  configuracoes: '/configuracoes',
};

const MODULE_PRIORITY = ['home', 'tech', 'financeiro', 'fiscal', 'contatos', 'legalizacao', 'pessoal_rh', 'acessos', 'configuracoes'];

// Sub-module keys grouped by parent module — used for backward compatibility:
// users that have the parent module but no sub-keys at all keep full access.
const SUB_MODULES_BY_PARENT: Record<string, string[]> = {
  fiscal: ['fiscal_dashboard', 'fiscal_tarefas', 'fiscal_calendario', 'fiscal_colaboradores', 'fiscal_monitor_cnpj'],
  financeiro: ['financeiro_dashboard', 'financeiro_lancamentos', 'financeiro_pagar_receber', 'financeiro_fluxo_caixa', 'financeiro_boletos', 'financeiro_conta_corrente', 'financeiro_conciliacao_sicoob', 'financeiro_eventos_contabeis', 'financeiro_dre', 'financeiro_clientes_fornecedores', 'financeiro_metas_orcamentos', 'financeiro_categorias'],
  tech: ['tech_disparos'],
};

// Legacy module/sub-module aliases — keeps users with old keys working until they're re-saved.
const LEGACY_MODULE_ALIASES: Record<string, string[]> = {
  contatos: ['clientes'],
};
const LEGACY_SUBMODULE_ALIASES: Record<string, string[]> = {
  tech_disparos: ['clientes_disparos'],
};

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

  const planModules: string[] = (company as any)?.plan_modules ?? [
    'home', 'tech', 'legalizacao', 'fiscal', 'pessoal_rh', 'financeiro', 'contatos', 'acessos', 'configuracoes',
  ];

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

