import { AlertTriangle } from 'lucide-react';
import { isDevEnvironment } from '@/lib/environment';

export function DevEnvironmentBanner() {
  if (!isDevEnvironment()) return null;

  return (
    <div className="w-full bg-yellow-500/15 border-b border-yellow-500/30 text-yellow-700 dark:text-yellow-400">
      <div className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span className="text-center">
          Ambiente de Desenvolvimento — os dados exibidos aqui não refletem o app publicado.
        </span>
      </div>
    </div>
  );
}
