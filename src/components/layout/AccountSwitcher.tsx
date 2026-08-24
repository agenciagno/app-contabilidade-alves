import { useNavigate } from 'react-router-dom';
import { ChevronDown, Check, Building, Rocket } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';
import { useUserRole } from '@/hooks/useUserRole';
import { useViewMode, type ViewMode } from '@/contexts/ViewModeContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * Switch de conta — ajuste 24/08/2026: morava no topo da sidebar, migrou pro
 * header (ao lado do Logo) e ganhou o switch Sistema Interno/Externo que
 * antes vivia dentro do menu de Perfil (UserMenu) — os dois eram "qual
 * conta/visão eu estou usando", fez sentido juntar num só lugar.
 *
 * Troca de conta real (multi-tenant) não existe ainda — só a affordance
 * visual (empresa atual marcada + "em breve" desabilitado). "Ver como
 * cliente" (preview de tenant específico) continua no UserMenu — é outra
 * feature, só relacionada por também depender de viewMode.
 */
export function AccountSwitcher() {
  const navigate = useNavigate();
  const { companyName, companyCnpj, company } = useCompany();
  const { isSuperAdmin } = useUserRole();
  const { viewMode, setViewMode } = useViewMode();

  const logoUrl: string | null = (company as any)?.logo_url ?? null;
  const companyInitial = (companyName || 'C').charAt(0).toUpperCase();

  const handleViewModeChange = (value: ViewMode) => {
    setViewMode(value);
    navigate('/');
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-xl bg-nav-surface-strong px-2.5 py-1.5 text-left transition-colors hover:brightness-110"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-paper">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
            ) : (
              <span className="text-ui-strong text-action">{companyInitial}</span>
            )}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="max-w-[160px] truncate text-ui-strong text-nav-on-surface">{companyName}</span>
            <span className="max-w-[160px] truncate font-mono text-meta text-nav-on-surface">
              {companyCnpj || 'CNPJ não informado'}
            </span>
          </div>
          <ChevronDown className="h-3 w-3 shrink-0 text-nav-on-surface" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <p className="px-2 pb-1.5 text-kicker uppercase text-muted-ink-2">Conta ativa</p>
        <div className="flex items-center gap-2 rounded-sm bg-action-tint px-2 py-2 text-ui-strong text-ink">
          <Check className="h-4 w-4 shrink-0 text-action" />
          <span className="truncate">{companyName}</span>
        </div>
        <div className="my-1.5 border-t border-line" />
        <div className="cursor-not-allowed px-2 py-1.5 text-ui text-muted-ink-2">
          Trocar de conta — em breve
        </div>

        {isSuperAdmin && (
          <>
            <div className="my-1.5 border-t border-line" />
            <p className="px-2 pb-1.5 text-kicker uppercase text-muted-ink-2">Visualização</p>
            <button
              type="button"
              onClick={() => handleViewModeChange('internal')}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-ui transition-colors',
                viewMode === 'internal' ? 'bg-action-tint text-ink' : 'text-muted-ink hover:bg-bg-2',
              )}
            >
              <Building className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              Sistema Interno
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange('external')}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-ui transition-colors',
                viewMode === 'external' ? 'bg-action-tint text-ink' : 'text-muted-ink hover:bg-bg-2',
              )}
            >
              <Rocket className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              Sistema Externo
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
