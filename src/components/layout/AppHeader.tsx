import { useNavigate } from 'react-router-dom';
import { Moon, Sun, Bot, Building2 } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useCompany } from '@/hooks/useCompany';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { HeaderSearch } from './HeaderSearch';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Logo } from '@/components/brand/Logo';
import { isDevEnvironment } from '@/lib/environment';

/**
 * Header — Shell/Topbar do Figma.
 *
 * Shell §6.2.1 do design system (10/08/2026): o header ocupa a largura
 * inteira da janela e a sidebar começa abaixo dele — a marca vive aqui, não
 * mais no topo da sidebar (essa segue com o bloco de empresa só no drawer
 * mobile, onde esse header não cabe do jeito atual).
 *
 * Decisão 05 do redesign: de 5 ações para 3. Calculadora e calendário saíram
 * daqui e passaram a viver nas telas de Financeiro, onde os números estão;
 * o perfil desceu para o rodapé da sidebar. Ficam tema, notificações e o
 * atalho do Agente IA — este só para quem já tem acesso à rota, mesmo gate
 * do item de menu.
 */
export function AppHeader() {
  const { resolvedTheme, setTheme } = useTheme();
  const { isAdmin, isSuperAdmin } = useUserRole();
  const { companyName, companyCnpj, company } = useCompany();
  const navigate = useNavigate();
  const isDev = isDevEnvironment();
  const isLight = resolvedTheme !== 'dark';
  const logoUrl: string | null = (company as any)?.logo_url ?? null;

  return (
    <header className="sticky top-0 z-50 h-16 shrink-0 border-b border-line bg-paper pt-[env(safe-area-inset-top)]">
      <div className="flex h-16 items-center gap-3 px-4">
        <div className="flex shrink-0 items-center gap-2">
          <SidebarTrigger className="text-muted-ink hover:text-ink" />
          {isDev && (
            <span className="ml-1 rounded-sm border border-warn/30 bg-warn-soft px-1.5 py-0.5 text-badge font-bold uppercase text-warn">
              dev
            </span>
          )}
        </div>

        {/* Marca + empresa ativa — só desktop, onde o header tem espaço pra
            sobrar; no mobile esse bloco vive no topo do drawer da sidebar. */}
        <div className="hidden shrink-0 items-center gap-4 md:flex">
          <Logo className="h-6" />
          <span className="h-6 w-px bg-line" aria-hidden />
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-brand">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
              ) : (
                <Building2 className="h-4 w-4 text-on-brand" strokeWidth={1.5} />
              )}
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="max-w-[180px] truncate text-ui-strong text-ink">{companyName}</span>
              <span className="truncate font-mono text-meta text-muted-ink-2">
                {companyCnpj || 'CNPJ não informado'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 justify-center">
          <HeaderSearch />
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Tema e Agente IA são exclusivos do Topbar desktop — o Mobile Topbar
              do Figma (62:7897) só tem busca + notificações. */}
          <button
            onClick={() => setTheme(isLight ? 'dark' : 'light')}
            className="hidden h-[30px] items-center gap-1.5 rounded-pill border border-line bg-paper px-2.5 text-meta text-muted-ink transition-colors hover:bg-bg-2 hover:text-ink md:flex"
            title={isLight ? 'Mudar para o tema escuro' : 'Mudar para o tema claro'}
          >
            {isLight ? <Sun className="h-[15px] w-[15px]" strokeWidth={1.75} /> : <Moon className="h-[15px] w-[15px]" strokeWidth={1.75} />}
            <span>{isLight ? 'claro' : 'escuro'}</span>
          </button>

          <NotificationBell />

          {(isAdmin || isSuperAdmin) && (
            <button
              onClick={() => navigate('/tech/agente-ia')}
              className="hidden h-9 w-9 items-center justify-center rounded-md text-muted-ink transition-colors hover:bg-bg-2 hover:text-ink md:flex"
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
