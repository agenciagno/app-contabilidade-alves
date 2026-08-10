import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAudience, type Audience } from '@/hooks/useAudience';

/**
 * Guard de rota por audiência, para rotas SEM chave de módulo (Tech: Clientes
 * Externos, LGPD, Agente IA). Rotas com módulo usam o ModuleGuard, que já
 * checa audiência via MODULE_AUDIENCE.
 *
 * Não substitui checagem de papel — as telas continuam se defendendo
 * (super admin/admin); isto só garante que a rota vive no "sistema" certo.
 */
export function AudienceGuard({ audience, children }: { audience: Audience; children: ReactNode }) {
  const effective = useAudience();
  if (effective !== audience) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
