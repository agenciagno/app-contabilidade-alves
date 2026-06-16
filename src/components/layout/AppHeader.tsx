import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { HeaderCalculator } from './HeaderCalculator';
import { HeaderCalendar } from './HeaderCalendar';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { isDevEnvironment } from '@/lib/environment';

export function AppHeader() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDev = isDevEnvironment();

  return (
    <header className="h-14 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 shadow-[0_1px_0_0_hsl(var(--border)/0.5)]">
      <div className="flex items-center justify-between h-full px-4">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
          {isDev && (
            <span className="ml-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30">
              DEV
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <HeaderCalculator />
          <HeaderCalendar />
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="text-muted-foreground hover:text-foreground"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </Button>

          <NotificationBell />
        </div>
      </div>
    </header>
  );
}
