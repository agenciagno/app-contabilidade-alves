import { AlertTriangle } from 'lucide-react';
import { isDevEnvironment } from '@/lib/environment';

export function DevEnvironmentBanner() {
  if (!isDevEnvironment()) return null;

  return (
    <div className="w-full bg-warn/15 border-b border-warn/30 text-warn dark:text-warn">
      <div className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span className="text-center">
          Ambiente de Desenvolvimento — os dados exibidos aqui não refletem o app publicado.
        </span>
      </div>
    </div>
  );
}
