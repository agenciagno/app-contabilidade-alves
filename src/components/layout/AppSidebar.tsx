import { useState } from 'react';
import { 
  LayoutDashboard, 
  ArrowLeftRight, 
  ArrowUpDown,
  CalendarClock, 
  Users, 
  Building2, 
  Tags, 
  FileBarChart, 
  Settings,
  LogOut,
  Home,
  Pin,
  PinOff,
  ChevronDown,
  Send,
  UserCircle,
  FileCheck,
  Wallet,
  Scale,
  UsersRound,
  LockKeyhole,
  Bell,
  Shield,
  type LucideIcon,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { usePinnedShortcuts, PinnedShortcut } from '@/hooks/usePinnedShortcuts';
import { useUserRole } from '@/hooks/useUserRole';
import { usePendingApprovals } from '@/hooks/usePendingApprovals';
import { useNotifications } from '@/hooks/useNotifications';
import { ProfileModal } from '@/components/profile/ProfileModal';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

const iconMap: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard,
  'arrow-left-right': ArrowLeftRight,
  'arrow-up-down': ArrowUpDown,
  'calendar-clock': CalendarClock,
  'users': Users,
  'building-2': Building2,
  'tags': Tags,
  'file-bar-chart': FileBarChart,
  'send': Send,
  'user-circle': UserCircle,
  'file-check': FileCheck,
};

interface MenuItem {
  title: string;
  url: string;
  icon: LucideIcon;
  iconName: string;
}

// Simple items (no sub-items)
interface SimpleModule {
  kind: 'simple';
  title: string;
  url: string;
  icon: LucideIcon;
  iconName: string;
  moduleKey: string;
}

// Collapsible items (with sub-items)
interface CollapsibleModule {
  kind: 'collapsible';
  title: string;
  icon: LucideIcon;
  moduleKey: string;
  defaultOpen?: boolean;
  items: MenuItem[];
}

type MenuEntry = SimpleModule | CollapsibleModule;

const menuEntries: MenuEntry[] = [
  {
    kind: 'simple',
    title: 'Home',
    url: '/',
    icon: Home,
    iconName: 'home',
    moduleKey: 'home',
  },
  {
    kind: 'simple',
    title: 'Legalização',
    url: '/legalizacao',
    icon: Scale,
    iconName: 'scale',
    moduleKey: 'legalizacao',
  },
  {
    kind: 'collapsible',
    title: 'Fiscal',
    icon: FileCheck,
    moduleKey: 'fiscal',
    items: [
      { title: 'Dashboard', url: '/fiscal/dashboard', icon: LayoutDashboard, iconName: 'layout-dashboard' },
      { title: 'Tarefas Fiscais', url: '/fiscal/tarefas', icon: CalendarClock, iconName: 'calendar-clock' },
      { title: 'Calendário Fiscal', url: '/fiscal/calendario', icon: CalendarClock, iconName: 'calendar-clock' },
      { title: 'Colaboradores', url: '/fiscal/colaboradores', icon: UsersRound, iconName: 'users-round' },
      { title: 'Notificações', url: '/fiscal/notificacoes', icon: Bell, iconName: 'bell' },
      { title: 'Monitor CNPJ', url: '/fiscal/monitor-cnpj', icon: Shield, iconName: 'shield' },
    ],

  },
  {
    kind: 'simple',
    title: 'Pessoal / RH',
    url: '/pessoal-rh',
    icon: UsersRound,
    iconName: 'users-round',
    moduleKey: 'pessoal_rh',
  },
  {
    kind: 'collapsible',
    title: 'Financeiro',
    icon: Wallet,
    moduleKey: 'financeiro',
    defaultOpen: true,
    items: [
      { title: 'Dashboard', url: '/painel-financeiro', icon: LayoutDashboard, iconName: 'layout-dashboard' },
      { title: 'Lançamentos', url: '/movimentacoes', icon: ArrowLeftRight, iconName: 'arrow-left-right' },
      { title: 'Pagar/Receber', url: '/financeiro/pagar-receber', icon: ArrowUpDown, iconName: 'arrow-up-down' },
      { title: 'Boletos', url: '/boletos', icon: FileCheck, iconName: 'file-check' },
      { title: 'Conta Corrente', url: '/bancos', icon: Building2, iconName: 'building-2' },
      { title: 'Eventos Contábeis', url: '/categorias', icon: Tags, iconName: 'tags' },
      { title: 'DRE', url: '/dre', icon: FileBarChart, iconName: 'file-bar-chart' },
    ],
  },
  {
    kind: 'collapsible',
    title: 'Clientes',
    icon: Users,
    moduleKey: 'clientes',
    items: [
      { title: 'Cliente/Fornecedor', url: '/contatos', icon: UserCircle, iconName: 'user-circle' },
      { title: 'Disparos', url: '/disparos', icon: Send, iconName: 'send' },
    ],
  },
];

export function AppSidebar() {
  const { signOut } = useAuth();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === 'collapsed';
  const showLabels = isMobile || !collapsed;

  // Close sidebar sheet on mobile when navigating
  const handleMobileNav = () => {
    if (isMobile) setOpenMobile(false);
  };
  const { companyName, companyCnpj, company } = useCompany();
  const { pinnedShortcuts, isPinned, togglePin } = usePinnedShortcuts();
  const { isSuperAdmin, isAdmin, isColaborador, allowedModules, fullName, avatarUrl } = useUserRole();
  const [profileOpen, setProfileOpen] = useState(false);
  const { pendingCount } = usePendingApprovals();
  const { unreadCount } = useNotifications();

  const planModules: string[] = (company as any)?.plan_modules ?? ['home', 'legalizacao', 'fiscal', 'pessoal_rh', 'financeiro', 'clientes', 'configuracoes'];
  const logoUrl: string | null = (company as any)?.logo_url ?? null;

  const isModuleVisible = (moduleKey: string) => {
    if (isSuperAdmin) return true;
    return planModules.includes(moduleKey) && allowedModules.includes(moduleKey);
  };

  const visibleEntries = menuEntries.filter(e => isModuleVisible(e.moduleKey));
  const showSettings = isSuperAdmin || (!isColaborador && isModuleVisible('configuracoes'));

  const [openModules, setOpenModules] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    menuEntries.forEach(entry => {
      if (entry.kind === 'collapsible') {
        initial[entry.title] = entry.defaultOpen ?? false;
      }
    });
    return initial;
  });

  const handleToggleModule = (title: string) => {
    setOpenModules(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const handlePinClick = (e: React.MouseEvent, item: MenuItem) => {
    e.preventDefault();
    e.stopPropagation();
    togglePin({ title: item.title, url: item.url, icon: item.iconName });
  };

  const initials = (fullName || 'U').substring(0, 2).toUpperCase();

  const renderPinnedItem = (shortcut: PinnedShortcut) => {
    const IconComponent = iconMap[shortcut.icon] || Tags;
    return (
      <SidebarMenuItem key={shortcut.url}>
        <SidebarMenuButton asChild tooltip={shortcut.title}>
          <NavLink onClick={handleMobileNav}
            to={shortcut.url}
            className="flex items-center gap-2 pl-8 pr-3 py-1.5 rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors group text-sm"
            activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
          >
            <IconComponent className="w-4 h-4 shrink-0" strokeWidth={1.5} />
            {showLabels && (
              <>
                <span className="flex-1 truncate">{shortcut.title}</span>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin(shortcut); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <PinOff className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                </button>
              </>
            )}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const renderSimpleEntry = (entry: SimpleModule) => (
    <SidebarGroup key={entry.title}>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={entry.title}>
              <NavLink onClick={handleMobileNav}
                to={entry.url}
                end={entry.url === '/'}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
              >
                <entry.icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.5} />
                {showLabels && <span>{entry.title}</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  const renderCollapsibleEntry = (entry: CollapsibleModule) => (
    <SidebarGroup key={entry.title}>
      <Collapsible open={openModules[entry.title]} onOpenChange={() => handleToggleModule(entry.title)}>
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="flex items-center justify-between cursor-pointer hover:bg-sidebar-accent rounded-lg px-3 py-2.5 transition-colors">
            <div className="flex items-center gap-3 text-sidebar-foreground">
              <entry.icon className="w-[18px] h-[18px]" strokeWidth={1.5} />
              {showLabels && <span className="text-sm font-semibold">{entry.title}</span>}
            </div>
            {showLabels && (
              <ChevronDown className={cn("w-4 h-4 text-sidebar-foreground/50 transition-transform duration-200", openModules[entry.title] && "rotate-180")} />
            )}
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {entry.items
                .filter((item) => (!['/fiscal/calendario', '/fiscal/dashboard', '/fiscal/colaboradores', '/fiscal/notificacoes'].includes(item.url)) || isAdmin || isSuperAdmin)
                .map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink onClick={handleMobileNav}
                      to={item.url}
                      className="flex items-center gap-2 pl-8 pr-3 py-1.5 rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors group text-sm"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                      {showLabels && (
                        <>
                          <span className="flex-1 truncate">{item.title}</span>
                          {item.url === '/fiscal/notificacoes' && unreadCount > 0 && (
                            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold leading-none">
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                          )}
                          <button onClick={(e) => handlePinClick(e, item)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                            {isPinned(item.url) ? <PinOff className="w-3 h-3 text-primary" /> : <Pin className="w-3 h-3 text-muted-foreground hover:text-primary" />}
                          </button>
                        </>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  );

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border/40">
        <SidebarHeader className="p-3">
          <div className="flex items-center gap-3 justify-center">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary shrink-0 overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <Building2 className="w-4 h-4 text-primary-foreground" strokeWidth={1.5} />
              )}
            </div>
            {showLabels && (
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-sidebar-foreground truncate">{companyName}</span>
                <span className="text-xs text-sidebar-foreground/60 truncate">{companyCnpj || 'CNPJ não informado'}</span>
              </div>
            )}
          </div>
        </SidebarHeader>

        <Separator className="bg-sidebar-border" />

        <SidebarContent className="px-2">
          {/* Atalhos Fixados */}
          {pinnedShortcuts.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider px-3 py-2">
                <Pin className="w-3 h-3 inline mr-1.5" />
                Atalhos
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {pinnedShortcuts.map(renderPinnedItem)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* Menu entries */}
          {/* Menu entries */}
          {visibleEntries.map(entry =>
            entry.kind === 'simple' ? renderSimpleEntry(entry) : renderCollapsibleEntry(entry)
          )}

          {/* Acessos (somente admin/super_admin) */}
          {(isAdmin || isSuperAdmin) && (
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Acessos">
                      <NavLink
                        onClick={handleMobileNav}
                        to="/acessos"
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <LockKeyhole className="w-[18px] h-[18px] shrink-0" strokeWidth={1.5} />
                        {showLabels && <span>Acessos</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter className="p-4">
          <SidebarMenu>
            {showSettings && (
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Configurações">
                  <NavLink onClick={handleMobileNav}
                    to="/configuracoes"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                    activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                  >
                    <Settings className="w-[18px] h-[18px] shrink-0" strokeWidth={1.5} />
                    {showLabels && (
                      <span className="flex-1">Configurações</span>
                    )}
                    {pendingCount > 0 && (
                      <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-medium text-destructive-foreground">
                        {pendingCount}
                      </span>
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>

          {/* Profile + Logout */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setProfileOpen(true)}
              className="flex items-center gap-2 flex-1 min-w-0 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent transition-colors"
            >
              <Avatar className="w-8 h-8 shrink-0">
                {avatarUrl && <AvatarImage src={avatarUrl} alt="Avatar" />}
                <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
              </Avatar>
              {showLabels && (
                <span className="text-sm text-sidebar-foreground truncate">{fullName || 'Usuário'}</span>
              )}
            </button>
            <Button 
              variant="ghost" 
              size="icon"
              className="shrink-0 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={signOut}
              title="Sair"
            >
              <LogOut className="w-[18px] h-[18px]" strokeWidth={1.5} />
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}
