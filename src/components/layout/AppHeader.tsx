import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { HeaderCalculator } from './HeaderCalculator';
import { HeaderCalendar } from './HeaderCalendar';
import { HeaderSearch } from './HeaderSearch';
import { UserMenu } from './UserMenu';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { isDevEnvironment } from '@/lib/environment';

export function AppHeader() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDev = isDevEnvironment();

  return (
    <header className="bg-card sticky top-0 z-50 border-b border-border pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between gap-3 h-14 px-4">
        <div className="flex items-center gap-2 shrink-0">
          <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
          {isDev && (
            <span className="ml-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30">
              DEV
            </span>
          )}
        </div>

        <div className="flex flex-1 justify-center min-w-0">
          <HeaderSearch />
        </div>

        {/* Ordem: Calculadora · Calendário · Notificações · Tema · Perfil */}
        <div className="flex items-center gap-2 shrink-0">
          <HeaderCalculator />
          <HeaderCalendar />
          <NotificationBell />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="text-muted-foreground hover:text-foreground"
            title={resolvedTheme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </Button>

          <UserMenu />
        </div>
      </div>
    </header>
  );
}
