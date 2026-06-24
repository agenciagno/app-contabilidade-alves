import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { useCompany } from '@/hooks/useCompany';

const MODULE_ROUTE_MAP: Record<string, string> = {
  home: '/',
  financeiro: '/painel-financeiro',
  fiscal: '/fiscal/tarefas',
  clientes: '/contatos',
  legalizacao: '/legalizacao',
  pessoal_rh: '/pessoal-rh',
  acessos: '/acessos',
  configuracoes: '/configuracoes',
};

const MODULE_PRIORITY = ['home', 'financeiro', 'fiscal', 'clientes', 'legalizacao', 'pessoal_rh', 'acessos', 'configuracoes'];

// Sub-module keys grouped by parent module — used for backward compatibility:
// users that have the parent module but no sub-keys at all keep full access.
const SUB_MODULES_BY_PARENT: Record<string, string[]> = {
  fiscal: ['fiscal_dashboard', 'fiscal_tarefas', 'fiscal_calendario', 'fiscal_colaboradores', 'fiscal_monitor_cnpj'],
  financeiro: ['financeiro_dashboard', 'financeiro_lancamentos', 'financeiro_pagar_receber', 'financeiro_boletos', 'financeiro_conta_corrente', 'financeiro_eventos_contabeis', 'financeiro_dre'],
  clientes: ['clientes_cliente_fornecedor', 'clientes_disparos'],
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
    'home', 'legalizacao', 'fiscal', 'pessoal_rh', 'financeiro', 'clientes', 'acessos', 'configuracoes',
  ];

  let hasAccess = planModules.includes(moduleName) && allowedModules.includes(moduleName);

  // Sub-module check with backward compatibility: if the user has the parent
  // but none of its sub-keys, treat as full access (pre-migration users).
  if (hasAccess && subModule) {
    const siblings = SUB_MODULES_BY_PARENT[moduleName] ?? [];
    const hasAnySibling = siblings.some((k) => allowedModules.includes(k));
    if (hasAnySibling && !allowedModules.includes(subModule)) {
      hasAccess = false;
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

