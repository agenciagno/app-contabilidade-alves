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
  configuracoes: '/configuracoes',
};

const MODULE_PRIORITY = ['home', 'financeiro', 'fiscal', 'clientes', 'legalizacao', 'pessoal_rh', 'configuracoes'];

interface ModuleGuardProps {
  moduleName: string;
  children: ReactNode;
  requireAdmin?: boolean;
}

export function ModuleGuard({ moduleName, children, requireAdmin = false }: ModuleGuardProps) {
  const { isSuperAdmin, isAdmin, allowedModules, isLoading } = useUserRole();
  const { company } = useCompany();

  if (isLoading) return null;

  if (isSuperAdmin) return <>{children}</>;

  const planModules: string[] = (company as any)?.plan_modules ?? [
    'home', 'legalizacao', 'fiscal', 'pessoal_rh', 'financeiro', 'clientes', 'configuracoes',
  ];

  const hasAccess = planModules.includes(moduleName) && allowedModules.includes(moduleName);

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
