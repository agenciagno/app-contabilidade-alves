import { useNavigate } from 'react-router-dom';
import { LogOut, UserCog, LifeBuoy, Languages, Receipt } from 'lucide-react';
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
 * Menu de conta no topo — substitui o bloco de perfil que ficava no rodapé do sidebar.
 */
export function UserMenu() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { fullName, email, avatarUrl, isAdmin, isSuperAdmin } = useUserRole();
  const { company } = useCompany();

  // Faturas é da empresa que assina o sistema. Equipe interna da CA e
  // colaboradores não veem.
  const isInternalCompany = (company as any)?.is_internal === true;
  const showFaturas = !isInternalCompany && (isAdmin || isSuperAdmin);

  const initials = (fullName || 'U').substring(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="rounded-full ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Menu da conta"
        >
          <Avatar className="w-8 h-8">
            {avatarUrl && <AvatarImage src={avatarUrl} alt="Avatar" />}
            <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
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
