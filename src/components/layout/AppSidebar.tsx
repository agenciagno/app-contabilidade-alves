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
  UserPlus,
  Shield,
  BookOpen,
  Gauge,
  ShieldCheck,
  Contact,
  TrendingUp,
  Landmark,
  BellRing,
  Target,
  ListChecks,

  type LucideIcon,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { usePinnedShortcuts, PinnedShortcut } from '@/hooks/usePinnedShortcuts';
import { useUserRole } from '@/hooks/useUserRole';
import { usePendingApprovals } from '@/hooks/usePendingApprovals';

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

interface SubMenuItem extends MenuItem {
  subKey?: string;
  /** Rótulo de um mini-divisor visual exibido ANTES deste item, dentro do mesmo menu. */
  sectionBreak?: string;
}

interface CollapsibleModuleExt {
  kind: 'collapsible';
  title: string;
  icon: LucideIcon;
  moduleKey: string;
  defaultOpen?: boolean;
  items: SubMenuItem[];
}

const menuEntries: (SimpleModule | CollapsibleModuleExt)[] = [
  {
    kind: 'simple',
    title: 'Home',
    url: '/',
    icon: Home,
    iconName: 'home',
    moduleKey: 'home',
  },
  {
    kind: 'collapsible',
    title: 'Tech',
    icon: Send,
    moduleKey: 'tech',
    items: [
      { title: 'Disparos', url: '/disparos', icon: Send, iconName: 'send', subKey: 'tech_disparos' },
      { title: 'Operação Interna', url: '/tech/operacao', icon: Gauge, iconName: 'gauge' },
      { title: 'LGPD', url: '/tech/lgpd', icon: ShieldCheck, iconName: 'shield-check' },
      { title: 'Cadastrar Cliente', url: '/admin/provisionar-cliente', icon: UserPlus, iconName: 'user-plus' },
      { title: 'Central de Notificações', url: '/central-notificacoes', icon: BellRing, iconName: 'bell-ring' },
    ],
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
    title: 'Tarefas',
    icon: ListChecks,
    moduleKey: 'fiscal',
    items: [
      { title: 'Dashboard', url: '/fiscal/dashboard', icon: LayoutDashboard, iconName: 'layout-dashboard', subKey: 'fiscal_dashboard' },
      { title: 'Tarefas', url: '/fiscal/tarefas', icon: CalendarClock, iconName: 'calendar-clock', subKey: 'fiscal_tarefas' },
      { title: 'Colaboradores', url: '/fiscal/colaboradores', icon: UsersRound, iconName: 'users-round', subKey: 'fiscal_colaboradores' },
      { title: 'Obrigações e Declarações', url: '/fiscal/obrigacoes', icon: BookOpen, iconName: 'book-open', subKey: 'fiscal_calendario' },
      { title: 'Calendário Fiscal', url: '/fiscal/calendario', icon: CalendarClock, iconName: 'calendar-clock', subKey: 'fiscal_calendario' },
    ],
  },
  {
    kind: 'collapsible',
    title: 'Fiscal',
    icon: FileCheck,
    moduleKey: 'fiscal',
    items: [
      { title: 'Monitor CNPJ', url: '/fiscal/monitor-cnpj', icon: Shield, iconName: 'shield', subKey: 'fiscal_monitor_cnpj' },
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
      { title: 'Dashboard', url: '/painel-financeiro', icon: LayoutDashboard, iconName: 'layout-dashboard', subKey: 'financeiro_dashboard' },
      { title: 'Lançamentos', url: '/movimentacoes', icon: ArrowLeftRight, iconName: 'arrow-left-right', subKey: 'financeiro_lancamentos' },
      { title: 'Pagar/Receber', url: '/financeiro/pagar-receber', icon: ArrowUpDown, iconName: 'arrow-up-down', subKey: 'financeiro_pagar_receber' },
      { title: 'Fluxo de Caixa', url: '/financeiro/fluxo-caixa', icon: TrendingUp, iconName: 'trending-up', subKey: 'financeiro_fluxo_caixa' },
      { title: 'Boletos', url: '/boletos', icon: FileCheck, iconName: 'file-check', subKey: 'financeiro_boletos' },
      { title: 'Conta Corrente', url: '/bancos', icon: Building2, iconName: 'building-2', subKey: 'financeiro_conta_corrente' },
      { title: 'Conciliação Sicoob', url: '/financeiro/conciliacao-sicoob', icon: Landmark, iconName: 'landmark', subKey: 'financeiro_conciliacao_sicoob' },
      { title: 'Eventos Contábeis', url: '/categorias', icon: Tags, iconName: 'tags', subKey: 'financeiro_eventos_contabeis' },
      { title: 'DRE', url: '/dre', icon: FileBarChart, iconName: 'file-bar-chart', subKey: 'financeiro_dre' },
      { title: 'Clientes & Fornecedores', url: '/financeiro/clientes-fornecedores', icon: Contact, iconName: 'contact', sectionBreak: 'Módulo vendido a clientes', subKey: 'financeiro_clientes_fornecedores' },
      { title: 'Categorias', url: '/financeiro/categorias-clientes', icon: Tags, iconName: 'tags', subKey: 'financeiro_categorias' },
      { title: 'Metas & Orçamentos', url: '/financeiro/metas-orcamentos', icon: Target, iconName: 'target', subKey: 'financeiro_metas_orcamentos' },
    ],
  },
  {
    kind: 'simple',
    title: 'Contatos',
    url: '/contatos',
    icon: Users,
    iconName: 'users',
    moduleKey: 'contatos',
  },
  {
    kind: 'simple',
    title: 'Acessos',
    url: '/acessos',
    icon: LockKeyhole,
    iconName: 'lock-keyhole',
    moduleKey: 'acessos',
  },
];

const SUB_MODULES_BY_PARENT: Record<string, string[]> = {
  fiscal: ['fiscal_dashboard', 'fiscal_tarefas', 'fiscal_calendario', 'fiscal_colaboradores', 'fiscal_monitor_cnpj'],
  financeiro: ['financeiro_dashboard', 'financeiro_lancamentos', 'financeiro_pagar_receber', 'financeiro_fluxo_caixa', 'financeiro_boletos', 'financeiro_conta_corrente', 'financeiro_conciliacao_sicoob', 'financeiro_eventos_contabeis', 'financeiro_dre', 'financeiro_clientes_fornecedores', 'financeiro_metas_orcamentos', 'financeiro_categorias'],
  tech: ['tech_disparos'],
};

// Legacy aliases — keep old saved keys working until users are re-saved.
const LEGACY_MODULE_ALIASES: Record<string, string[]> = {
  contatos: ['clientes'],
};
const LEGACY_SUBMODULE_ALIASES: Record<string, string[]> = {
  tech_disparos: ['clientes_disparos'],
};



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
  

  const planModules: string[] = (company as any)?.plan_modules ?? ['home', 'tech', 'legalizacao', 'fiscal', 'pessoal_rh', 'financeiro', 'contatos', 'acessos', 'configuracoes'];
  const logoUrl: string | null = (company as any)?.logo_url ?? null;

  const isModuleVisible = (moduleKey: string) => {
    if (isSuperAdmin) return true;
    const keys = [moduleKey, ...(LEGACY_MODULE_ALIASES[moduleKey] ?? [])];
    const planOk = keys.some((k) => planModules.includes(k));
    const userOk = keys.some((k) => allowedModules.includes(k));
    return planOk && userOk;
  };

  // For collaborators, hide sub-items they don't have permission for.
  // Backward compat: if the user has the parent module but no sub-keys at all,
  // show every sub-item (legacy users keep full access until the admin re-saves them).
  const subEnabledByPlan = (parentKey: string, subKey?: string) => {
    if (!subKey) return true;
    const siblings = SUB_MODULES_BY_PARENT[parentKey] ?? [];
    const explicit = siblings.filter((k) => planModules.includes(k));
    if (explicit.length === 0) return true; // plano "grosso" (ex.: CA) => todos os submódulos habilitados
    return planModules.includes(subKey);    // plano com recorte => só os submódulos contratados
  };

  const isSubItemVisible = (parentKey: string, subKey?: string) => {
    if (isSuperAdmin) return true;
    if (!subEnabledByPlan(parentKey, subKey)) return false;
    if (isAdmin) return true;
    if (!subKey) return true;
    const siblings = SUB_MODULES_BY_PARENT[parentKey] ?? [];
    const hasAnySibling = siblings.some((k) => allowedModules.includes(k));
    if (!hasAnySibling) return true;
    const keys = [subKey, ...(LEGACY_SUBMODULE_ALIASES[subKey] ?? [])];
    return keys.some((k) => allowedModules.includes(k));
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
            className="flex items-center gap-2 pl-8 pr-3 py-1.5 rounded-lg text-[13px] text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-[background,color] duration-[120ms] group"
            activeClassName="bg-accent text-primary font-medium"
          >
            <IconComponent className="w-[16px] h-[16px] shrink-0 opacity-60" strokeWidth={1.75} />
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
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] text-muted-foreground hover:bg-accent hover:text-foreground transition-[background,color] duration-[120ms]"
                activeClassName="bg-accent text-foreground font-semibold [&_svg]:opacity-100"
              >
                <entry.icon className="w-[18px] h-[18px] shrink-0 opacity-60" strokeWidth={1.75} />
                {showLabels && <span>{entry.title}</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  const renderCollapsibleEntry = (entry: CollapsibleModuleExt) => (
    <SidebarGroup key={entry.title}>
      <Collapsible open={openModules[entry.title]} onOpenChange={() => handleToggleModule(entry.title)}>
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="flex items-center justify-between cursor-pointer hover:bg-accent rounded-lg px-3 py-2 transition-[background,color] duration-[120ms] h-auto">
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <entry.icon className="w-[18px] h-[18px] opacity-60" strokeWidth={1.75} />
              {showLabels && <span className="text-[13.5px] font-medium text-foreground">{entry.title}</span>}
            </div>
            {showLabels && (
              <ChevronDown className={cn("w-4 h-4 text-muted-foreground/60 transition-transform duration-[120ms]", openModules[entry.title] && "rotate-180")} />
            )}
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {entry.items
                .filter((item) => item.url !== '/tech/operacao' || isSuperAdmin)
                .filter((item) => item.url !== '/tech/lgpd' || isAdmin || isSuperAdmin)
                .filter((item) => item.url !== '/admin/provisionar-cliente' || isSuperAdmin)
                .filter((item) => item.url !== '/central-notificacoes' || isSuperAdmin)
                .filter((item) => (!['/fiscal/calendario', '/fiscal/dashboard', '/fiscal/colaboradores', '/fiscal/monitor-cnpj'].includes(item.url)) || isAdmin || isSuperAdmin)
                .filter((item) => isSubItemVisible(entry.moduleKey, item.subKey))
                .map((item) => (

                <SidebarMenuItem key={item.title}>
                  {item.sectionBreak && showLabels && (
                    <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-[0.05em] text-muted-foreground/50 border-t border-sidebar-border/60 mt-1">
                      {item.sectionBreak}
                    </div>
                  )}
                  {item.sectionBreak && !showLabels && (
                    <Separator className="my-1.5 mx-2 w-auto bg-sidebar-border/60" />
                  )}
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink onClick={handleMobileNav}
                      to={item.url}
                      className="flex items-center gap-2 pl-8 pr-3 py-1.5 rounded-lg text-[13px] text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-[background,color] duration-[120ms] group"
                      activeClassName="bg-accent text-primary font-medium"
                    >
                      <item.icon className="w-[16px] h-[16px] shrink-0 opacity-60" strokeWidth={1.75} />
                      {showLabels && (
                        <>
                          <span className="flex-1 truncate">{item.title}</span>
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
      <Sidebar collapsible="icon" className="border-r border-border">
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
              <SidebarGroupLabel className="text-muted-foreground text-[11px] uppercase tracking-[0.05em] px-3 py-2 font-medium">
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

          {visibleEntries.map(entry =>
            entry.kind === 'simple' ? renderSimpleEntry(entry) : renderCollapsibleEntry(entry)
          )}

        </SidebarContent>

        <SidebarFooter className="p-4">
          <SidebarMenu>
            {showSettings && (
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Configurações">
                  <NavLink onClick={handleMobileNav}
                    to="/configuracoes"
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] text-muted-foreground hover:bg-accent hover:text-foreground transition-[background,color] duration-[120ms]"
                    activeClassName="bg-accent text-foreground font-semibold"

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
