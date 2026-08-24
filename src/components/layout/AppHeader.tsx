import { useNavigate } from 'react-router-dom';
import { Moon, Sun, Bot } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useUserRole } from '@/hooks/useUserRole';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Logo } from '@/components/brand/Logo';
import { isDevEnvironment } from '@/lib/environment';

/**
 * Header — Shell/Topbar do redesign (24/08/2026, frame "Shell — Navegação
 * Global v6", 571:1502 claro / 582:1574 escuro).
 *
 * Fundo passa a --nav-surface (era --paper) — a marca+empresa que morava
 * aqui desde a rodada anterior (§6.2.1) volta a se dividir: o Logo fica
 * (só ele, sem o bloco de empresa — confirmado no node tree do Figma, não
 * no texto do brief que pedia os dois saírem), o cartão de empresa migra
 * pro topo da sidebar (agora também no desktop, não só no drawer mobile).
 * SidebarTrigger sai daqui e vai pro rodapé da sidebar.
 *
 * HeaderSearch foi removida (decisão de 24/08/2026, confirmada com Gabriel
 * — o node tree do Figma não tem campo de busca nenhum no header) — o
 * componente foi deletado, não só desmontado, já que não tinha mais
 * nenhum outro consumidor.
 */
export function AppHeader() {
  const { resolvedTheme, setTheme } = useTheme();
  const { isAdmin, isSuperAdmin } = useUserRole();
  const navigate = useNavigate();
  const isDev = isDevEnvironment();
  const isLight = resolvedTheme !== 'dark';

  return (
    <header className="sticky top-0 z-50 h-16 shrink-0 rounded-tl-[20px] bg-nav-surface pt-[env(safe-area-inset-top)]">
      <div className="flex h-16 items-center gap-3 px-4">
        <div className="flex shrink-0 items-center gap-3">
          <Logo variant="white" className="h-6" />
          {isDev && (
            <span className="rounded-sm border border-warn/30 bg-warn-soft px-1.5 py-0.5 text-badge font-bold uppercase text-warn">
              dev
            </span>
          )}
        </div>

        <div className="flex-1" />

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Tema e Agente IA são exclusivos do Topbar desktop — o Mobile Topbar
              do Figma (62:7897) só tem busca + notificações. */}
          <button
            onClick={() => setTheme(isLight ? 'dark' : 'light')}
            className="hidden h-[30px] items-center gap-1.5 rounded-pill px-2.5 text-meta text-nav-on-surface transition-colors hover:bg-white/10 md:flex"
            title={isLight ? 'Mudar para o tema escuro' : 'Mudar para o tema claro'}
          >
            {isLight ? <Sun className="h-[15px] w-[15px]" strokeWidth={1.75} /> : <Moon className="h-[15px] w-[15px]" strokeWidth={1.75} />}
            <span>{isLight ? 'claro' : 'escuro'}</span>
          </button>

          <NotificationBell />

          {(isAdmin || isSuperAdmin) && (
            <button
              onClick={() => navigate('/tech/agente-ia')}
              className="hidden h-9 w-9 items-center justify-center rounded-md text-nav-on-surface transition-colors hover:bg-white/10 md:flex"
              title="Agente IA"
            >
              <Bot className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
