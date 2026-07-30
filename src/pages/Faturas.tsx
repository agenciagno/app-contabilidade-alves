import { Navigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { useCompany } from '@/hooks/useCompany';
import { EmBreve } from '@/components/EmBreve';

/**
 * Faturas da assinatura do sistema. Só o admin da empresa que assina vê —
 * equipe interna da CA e colaboradores não. O gate vive aqui também (e não só
 * no menu) porque a rota pode ser digitada na barra de endereço.
 */
export default function Faturas() {
  const { isAdmin, isSuperAdmin, isLoading } = useUserRole();
  const { company, isLoading: loadingCompany } = useCompany();

  if (isLoading || loadingCompany) return null;

  const isInternalCompany = (company as any)?.is_internal === true;
  const canSee = !isInternalCompany && (isAdmin || isSuperAdmin);

  if (!canSee) return <Navigate to="/" replace />;

  return <EmBreve moduleKey="faturas" />;
}
