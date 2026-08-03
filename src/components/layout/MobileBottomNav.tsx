import { NavLink, useLocation } from 'react-router-dom';
import { Home, ListChecks, Wallet, Building2, FolderOpen } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { cn } from '@/lib/utils';

/**
 * Shell/Mobile BottomNav do Figma — 5 destinos, 76px de altura.
 * Só aparece no mobile; no desktop a sidebar continua sendo a navegação.
 * "Mais" abre a sidebar em sheet, que é onde vivem os outros 13 módulos.
 */
const DESTINOS = [
  { title: 'Início', url: '/', icon: Home, moduleKey: 'home' },
  { title: 'Tarefas', url: '/fiscal/tarefas', icon: ListChecks, moduleKey: 'fiscal' },
  { title: 'Financeiro', url: '/painel-financeiro', icon: Wallet, moduleKey: 'financeiro' },
  // Empresas é filha de "cadastro" — precisa checar o par pai/filho, não a chave solta.
  { title: 'Empresas', url: '/contatos', icon: Building2, parentKey: 'cadastro', subKey: 'contatos' },
] as const;

export function MobileBottomNav() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  const { isModuleVisible, isSubItemVisible } = useModuleAccess();

  const visiveis = DESTINOS.filter((d) =>
    'subKey' in d
      ? isModuleVisible(d.parentKey) && isSubItemVisible(d.parentKey, d.subKey)
      : isModuleVisible(d.moduleKey)
  );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Navegação principal"
    >
      {visiveis.map((d) => {
        const ativo = d.url === '/' ? pathname === '/' : pathname.startsWith(d.url);
        return (
          <NavLink
            key={d.url}
            to={d.url}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-3 text-badge transition-colors',
              ativo ? 'font-semibold text-brand' : 'text-muted-ink',
            )}
          >
            <d.icon className="h-[21px] w-[21px] shrink-0" strokeWidth={1.75} />
            <span className="truncate">{d.title}</span>
          </NavLink>
        );
      })}

      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-3 text-badge text-muted-ink transition-colors"
      >
        <FolderOpen className="h-[21px] w-[21px] shrink-0" strokeWidth={1.75} />
        <span className="truncate">Mais</span>
      </button>
    </nav>
  );
}
