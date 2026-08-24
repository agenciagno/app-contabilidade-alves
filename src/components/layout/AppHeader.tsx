import { Moon, Sun, LifeBuoy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { UserMenu } from './UserMenu';
import { AccountSwitcher } from './AccountSwitcher';
import { Logo } from '@/components/brand/Logo';
import { isDevEnvironment } from '@/lib/environment';

/**
 * Header — Shell/Topbar do redesign (24/08/2026, frame "Shell — Navegação
 * Global v6", 571:1502 claro / 582:1574 escuro; ajustes pós-entrega no
 * mesmo dia).
 *
 * Fundo --nav-surface, sem canto arredondado próprio (o único raio do shell
 * agora vive no conteúdo, ver AppLayout.tsx). Logo + AccountSwitcher (o
 * cartão de conta, que morava na sidebar) ficam à esquerda; à direita:
 * tema, notificações, Suporte e Perfil (avatar só, mais perto da borda) —
 * Agente IA saiu daqui e voltou a existir só como sub-item de Tech no menu
 * (decisão Gabriel: não precisa de atalho dedicado no header).
 *
 * HeaderSearch foi removida (24/08/2026 — o node tree do Figma não tem
 * campo de busca nenhum no header) — componente deletado, não só
 * desmontado, já que não tinha mais nenhum outro consumidor.
 */
export function AppHeader() {
  const { resolvedTheme, setTheme } = useTheme();
  const navigate = useNavigate();
  const isDev = isDevEnvironment();
  const isLight = resolvedTheme !== 'dark';

  return (
    <header className="sticky top-0 z-50 h-16 shrink-0 bg-nav-surface pt-[env(safe-area-inset-top)]">
      <div className="flex h-16 items-center gap-3 px-4">
        <div className="flex shrink-0 items-center gap-3">
          <Logo variant="white" className="h-6" />
          {isDev && (
            <span className="rounded-sm border border-warn/30 bg-warn-soft px-1.5 py-0.5 text-badge font-bold uppercase text-warn">
              dev
            </span>
          )}
          <AccountSwitcher />
        </div>

        <div className="flex-1" />

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => setTheme(isLight ? 'dark' : 'light')}
            className="hidden h-[30px] items-center gap-1.5 rounded-pill px-2.5 text-meta text-nav-on-surface transition-colors hover:bg-white/10 md:flex"
            title={isLight ? 'Mudar para o tema escuro' : 'Mudar para o tema claro'}
          >
            {isLight ? <Sun className="h-[15px] w-[15px]" strokeWidth={1.75} /> : <Moon className="h-[15px] w-[15px]" strokeWidth={1.75} />}
            <span>{isLight ? 'claro' : 'escuro'}</span>
          </button>

          <NotificationBell />

          <button
            onClick={() => navigate('/suporte')}
            className="hidden h-9 w-9 items-center justify-center rounded-md text-nav-on-surface transition-colors hover:bg-white/10 md:flex"
            title="Suporte"
          >
            <LifeBuoy className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </button>

          <UserMenu />
        </div>
      </div>
    </header>
  );
}
