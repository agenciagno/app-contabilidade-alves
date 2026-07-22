import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Building2, Users } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import { useActiveCompany } from '@/contexts/CompanyContext';

/**
 * Protege a seção "Financeiro dos Clientes":
 * - Só super admin entra (mesma regra que o RLS/start_support_session já exige).
 * - Sem cliente selecionado → mostra o convite pra escolher na barra lateral,
 *   em vez de renderizar telas do Financeiro sem empresa em contexto.
 */
export function ClientesFinanceiroGuard({ children }: { children: ReactNode }) {
  const { isSuperAdmin, isLoading } = useUserRole();
  const { selectedClient } = useActiveCompany();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  if (!isSuperAdmin) {
    return <Navigate to="/sem-acesso" replace />;
  }

  if (!selectedClient) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
          <Users className="w-7 h-7 text-primary" strokeWidth={1.75} />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Selecione um cliente
        </h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Escolha uma empresa no seletor <span className="font-medium">Financeiro dos Clientes</span>,
          na barra lateral, para ver o Financeiro dela.
        </p>
        <div className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground/70">
          <Building2 className="w-3.5 h-3.5" />
          O acesso é registrado e temporário (sessão de suporte).
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
