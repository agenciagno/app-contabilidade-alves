import { useNavigate } from 'react-router-dom';
import { LogOut, UserCog, LifeBuoy, Languages, Receipt, ChevronsUpDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useCompany } from '@/hooks/useCompany';
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
 * Menu de conta. O gatilho tem duas formas:
 * - `avatar`: só o avatar (usado quando o menu vive no topo).
 * - `bar`: avatar + nome + papel + chevrons, ocupando a largura — é o bloco
 *   "conta" do rodapé da sidebar no Figma (decisão 05, que traz o perfil de
 *   volta para o rodapé).
 */
export function UserMenu({ variant = 'avatar' }: { variant?: 'avatar' | 'bar' }) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { fullName, email, avatarUrl, isAdmin, isSuperAdmin, role } = useUserRole();
  const { company } = useCompany();

  // Faturas é da empresa que assina o sistema. Equipe interna da CA e
  // colaboradores não veem.
  const isInternalCompany = (company as any)?.is_internal === true;
  const showFaturas = !isInternalCompany && (isAdmin || isSuperAdmin);

  const initials = (fullName || 'U').substring(0, 2).toUpperCase();

  // O Figma mostra "Sócio · Tech" no rodapé, mas cargo não existe no banco —
  // uso o papel real em vez de inventar um dado.
  const roleLabel =
    role === 'super_admin' ? 'Super admin' : role === 'admin' ? 'Administrador' : 'Colaborador';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === 'bar' ? (
          <button
            className="flex w-full items-center gap-2.5 rounded-sm border border-line bg-paper px-3 py-2 text-left ring-offset-background transition-colors hover:bg-bg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Menu da conta"
          >
            <Avatar className="h-[26px] w-[26px] shrink-0">
              {avatarUrl && <AvatarImage src={avatarUrl} alt="Avatar" />}
              <AvatarFallback className="bg-brand-tint text-badge text-brand">{initials}</AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-ui-strong text-ink">{fullName || 'Usuário'}</span>
              <span className="truncate text-meta text-muted-ink">{roleLabel}</span>
            </span>
            <ChevronsUpDown className="h-[15px] w-[15px] shrink-0 text-muted-ink-2" strokeWidth={1.75} />
          </button>
        ) : (
          <button
            className="rounded-pill ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Menu da conta"
          >
            <Avatar className="h-8 w-8">
              {avatarUrl && <AvatarImage src={avatarUrl} alt="Avatar" />}
              <AvatarFallback className="bg-brand-tint text-badge text-brand">{initials}</AvatarFallback>
            </Avatar>
          </button>
        )}
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
