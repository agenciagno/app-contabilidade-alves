import { useNavigate } from 'react-router-dom';
import { LogOut, UserCog, LifeBuoy, Languages, Receipt, Eye } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useAudience } from '@/hooks/useAudience';
import { useTenants } from '@/hooks/useTenants';
import { useViewMode } from '@/contexts/ViewModeContext';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Menu de conta — gatilho é só o avatar (o bloco "conta" do rodapé antigo
 * da sidebar foi descontinuado; hoje o menu vive no header, ver
 * AppHeader.tsx). O switch Sistema Interno/Externo saiu daqui e foi pro
 * AccountSwitcher (24/08/2026) — junto do cartão de conta, faz mais sentido
 * lá. "Ver como cliente" (preview de tenant) continua aqui: é outra
 * feature, só relacionada por também depender de viewMode.
 */
export function UserMenu() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { fullName, email, avatarUrl, isAdmin, isSuperAdmin } = useUserRole();
  const { viewMode, previewTenant, setPreviewTenant } = useViewMode();
  const audience = useAudience();
  // Lista de tenants pro "Ver como cliente" — a query já é gated por super admin.
  const { data: tenants = [] } = useTenants();
  const externalTenants = tenants.filter((t) => !t.is_internal);

  // Faturas é do mundo do produto: tenant admin vê sempre; super admin só na
  // visão Sistema Externo (audiência efetiva já resolve os dois casos).
  const showFaturas = audience === 'external' && (isAdmin || isSuperAdmin);

  const initials = (fullName || 'U').substring(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="rounded-pill ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Menu da conta"
        >
          <Avatar className="h-8 w-8">
            {avatarUrl && <AvatarImage src={avatarUrl} alt="Avatar" />}
            <AvatarFallback className="bg-brand-tint text-badge text-brand">{initials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center gap-3">
            <Avatar className="w-9 h-9 shrink-0">
              {avatarUrl && <AvatarImage src={avatarUrl} alt="Avatar" />}
              <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-foreground truncate">
                {fullName || 'Usuário'}
              </span>
              <span className="text-xs text-muted-foreground truncate">{email}</span>
            </div>
          </div>
        </DropdownMenuLabel>

        {isSuperAdmin && viewMode === 'external' && externalTenants.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2">
                <Eye className="w-4 h-4" strokeWidth={1.75} />
                {previewTenant ? `Vendo: ${previewTenant.name}` : 'Ver como cliente'}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-w-72">
                {/* Preview VISUAL do plano do tenant no menu — dados continuam
                    sendo os da CA (RLS). Sair pelo banner ou por "Visão padrão". */}
                {previewTenant && (
                  <DropdownMenuItem onClick={() => setPreviewTenant(null)}>
                    Visão padrão (sair do preview)
                  </DropdownMenuItem>
                )}
                {externalTenants.map((t) => (
                  <DropdownMenuItem
                    key={t.id}
                    onClick={() =>
                      setPreviewTenant({ id: t.id, name: t.name, planModules: t.plan_modules ?? [] })
                    }
                    className="truncate"
                  >
                    {t.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => navigate('/minha-conta')} className="gap-2">
          <UserCog className="w-4 h-4" strokeWidth={1.75} />
          Minha Conta
        </DropdownMenuItem>

        {showFaturas && (
          <DropdownMenuItem onClick={() => navigate('/faturas')} className="gap-2">
            <Receipt className="w-4 h-4" strokeWidth={1.75} />
            Faturas
          </DropdownMenuItem>
        )}

        <DropdownMenuItem onClick={() => navigate('/suporte')} className="gap-2">
          <LifeBuoy className="w-4 h-4" strokeWidth={1.75} />
          Suporte
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <Languages className="w-4 h-4" strokeWidth={1.75} />
            Idioma
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {/* O sistema é só em português hoje. Quando houver mais idiomas,
                este grupo passa a controlar a preferência de verdade. */}
            <DropdownMenuRadioGroup value="pt-BR">
              <DropdownMenuRadioItem value="pt-BR">Português (Brasil)</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={signOut} className="gap-2 text-destructive focus:text-destructive">
          <LogOut className="w-4 h-4" strokeWidth={1.75} />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
