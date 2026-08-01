import { useState } from 'react';
import {
  LayoutDashboard,
  ArrowLeftRight,
  ArrowUpDown,
  CalendarClock,
  Building2,
  Tags,
  FileBarChart,
  Settings,
  Home,
  Pin,
  PinOff,
  ChevronDown,
  Send,
  FileCheck,
  Wallet,
  Scale,
  UsersRound,
  LockKeyhole,
  UserPlus,
  ShieldCheck,
  Contact,
  TrendingUp,
  Landmark,
  BellRing,
  Target,
  ListChecks,
  Bot,
  Gauge,
  Compass,
  MessageSquare,
  CreditCard,
  ScrollText,
  Gavel,
  FileSearch,
  Calculator,
  Stethoscope,
  FolderOpen,
  FileSignature,
  BadgeCheck,
  FileText,
  LifeBuoy,
  BookOpen,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { UserMenu } from './UserMenu';
import { useCompany } from '@/hooks/useCompany';
import { usePinnedShortcuts, PinnedShortcut } from '@/hooks/usePinnedShortcuts';
import { useModuleAccess, type RoleGated } from '@/hooks/useModuleAccess';
import { usePendingApprovals } from '@/hooks/usePendingApprovals';

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
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

/**
 * Ícone dos atalhos fixados, resolvido pelo `iconName` gravado no atalho.
 * Todo item do menu precisa ter o `iconName` dele aqui, senão o atalho fixado
 * aparece com o ícone genérico de fallback.
 */
const iconMap: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard,
  'arrow-left-right': ArrowLeftRight,
  'arrow-up-down': ArrowUpDown,
  'calendar-clock': CalendarClock,
  'users': Users,
  'users-round': UsersRound,
  'building-2': Building2,
  'tags': Tags,
  'file-bar-chart': FileBarChart,
  'send': Send,
  'file-check': FileCheck,
  'home': Home,
  'gauge': Gauge,
  'shield-check': ShieldCheck,
  'bot': Bot,
  'user-plus': UserPlus,
  'bell-ring': BellRing,
  'scale': Scale,
  'compass': Compass,
  'stethoscope': Stethoscope,
  'trending-up': TrendingUp,
  'book-open': BookOpen,
  'message-square': MessageSquare,
  'landmark': Landmark,
  'credit-card': CreditCard,
  'scroll-text': ScrollText,
  'gavel': Gavel,
  'file-search': FileSearch,
  'calculator': Calculator,
  'contact': Contact,
  'target': Target,
  'folder-open': FolderOpen,
  'file-signature': FileSignature,
  'badge-check': BadgeCheck,
  'file-text': FileText,
  'lock-keyhole': LockKeyhole,
  'settings': Settings,
  'wallet': Wallet,
  'list-checks': ListChecks,
  'life-buoy': LifeBuoy,
};

interface MenuItem {
  title: string;
  url: string;
  icon: LucideIcon;
  iconName: string;
}

interface SubMenuItem extends MenuItem, RoleGated {
  /** Chave de submódulo, checada contra o módulo pai. */
  subKey?: string;
  /**
   * Chave de módulo de topo própria. Usada em Cadastros, que é grupo visual:
   * cada item guarda a permissão dele em vez de herdar a do grupo.
   */
  moduleKey?: string;
  /** Rótulo de um mini-divisor visual exibido ANTES deste item, dentro do mesmo menu. */
  sectionBreak?: string;
}

/** Divisor com rótulo, separando categorias do menu. */
interface SectionDivider {
  kind: 'section';
  label: string;
}

interface SimpleModule extends RoleGated {
  kind: 'simple';
  title: string;
  url: string;
  icon: LucideIcon;
  iconName: string;
  moduleKey: string;
}

interface CollapsibleModule extends RoleGated {
  kind: 'collapsible';
  title: string;
  icon: LucideIcon;
  /** Ausente = grupo puramente visual; a visibilidade vem dos itens. */
  moduleKey?: string;
  defaultOpen?: boolean;
  items: SubMenuItem[];
}

export type MenuEntry = SectionDivider | SimpleModule | CollapsibleModule;

/** Fonte única do menu. A busca do header também consome esta lista. */
export const menuEntries: MenuEntry[] = [
  {
    kind: 'simple',
    title: 'Início',
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
      { title: 'Clientes Externos', url: '/tech/clientes-externos', icon: Building2, iconName: 'building-2', requireSuperAdmin: true },
      { title: 'LGPD', url: '/tech/lgpd', icon: ShieldCheck, iconName: 'shield-check', requireAdmin: true },
      { title: 'Agente IA', url: '/tech/agente-ia', icon: Bot, iconName: 'bot', requireAdmin: true },
      { title: 'Central de Notificações', url: '/central-notificacoes', icon: BellRing, iconName: 'bell-ring', requireSuperAdmin: true },
    ],
  },
  {
    kind: 'collapsible',
    title: 'Reforma Tributária',
    icon: Scale,
    moduleKey: 'reforma_tributaria',
    items: [
      { title: 'Painel RT', url: '/reforma-tributaria', icon: Scale, iconName: 'scale', subKey: 'reforma_tributaria_painel' },
      { title: 'Calculadora RT', url: '/reforma-tributaria/calculadora', icon: Calculator, iconName: 'calculator', subKey: 'reforma_tributaria_calculadora' },
    ],
  },
  {
    kind: 'collapsible',
    title: 'Gestão 360°',
    icon: Compass,
    moduleKey: 'gestao360',
    items: [
      { title: 'Portal 360°', url: '/gestao-360/portal', icon: Compass, iconName: 'compass', subKey: 'gestao360_portal' },
      { title: 'CA · Ausências', url: '/gestao-360/ausencias', icon: CalendarClock, iconName: 'calendar-clock', subKey: 'gestao360_ausencias' },
      { title: 'CA · Diagnósticos', url: '/gestao-360/diagnosticos', icon: Stethoscope, iconName: 'stethoscope', subKey: 'gestao360_diagnosticos' },
      { title: 'CA · Indicadores', url: '/gestao-360/indicadores', icon: TrendingUp, iconName: 'trending-up', subKey: 'gestao360_indicadores' },
    ],
  },
  {
    kind: 'collapsible',
    title: 'Tarefas',
    icon: ListChecks,
    moduleKey: 'fiscal',
    items: [
      { title: 'Dashboard', url: '/fiscal/dashboard', icon: LayoutDashboard, iconName: 'layout-dashboard', subKey: 'fiscal_dashboard', requireAdmin: true },
      { title: 'Tarefas', url: '/fiscal/tarefas', icon: CalendarClock, iconName: 'calendar-clock', subKey: 'fiscal_tarefas' },
      { title: 'Colaboradores', url: '/fiscal/colaboradores', icon: UsersRound, iconName: 'users-round', subKey: 'fiscal_colaboradores', requireAdmin: true },
      { title: 'Obrigações e Declarações', url: '/fiscal/obrigacoes', icon: BookOpen, iconName: 'book-open', subKey: 'fiscal_calendario', requireAdmin: true },
      { title: 'Calendário Fiscal', url: '/fiscal/calendario', icon: CalendarClock, iconName: 'calendar-clock', subKey: 'fiscal_calendario', requireAdmin: true },
      { title: 'Obrigações Fiscais', url: '/fiscal/obrigacoes-fiscais', icon: FileCheck, iconName: 'file-check', subKey: 'fiscal_obrigacoes', requireAdmin: true },
      { title: 'Agenda', url: '/fiscal/agenda', icon: CalendarClock, iconName: 'calendar-clock', subKey: 'fiscal_agenda', requireAdmin: true },
    ],
  },

  { kind: 'section', label: 'Monitoramento' },
  {
    kind: 'simple',
    title: 'Mensagens',
    url: '/mensagens',
    icon: MessageSquare,
    iconName: 'message-square',
    moduleKey: 'mensagens',
  },
  {
    kind: 'simple',
    title: 'Dashboard Federal',
    url: '/dashboard-federal',
    icon: Landmark,
    iconName: 'landmark',
    moduleKey: 'dashboard_federal',
  },
  {
    kind: 'simple',
    title: 'Parcelamentos',
    url: '/parcelamentos',
    icon: CreditCard,
    iconName: 'credit-card',
    moduleKey: 'parcelamentos',
  },
  {
    kind: 'simple',
    title: 'Certidões',
    url: '/certidoes',
    icon: ScrollText,
    iconName: 'scroll-text',
    moduleKey: 'certidoes',
  },
  {
    kind: 'simple',
    title: 'Processos',
    url: '/processos',
    icon: Gavel,
    iconName: 'gavel',
    moduleKey: 'processos',
  },

  { kind: 'section', label: 'Diagnóstico Fiscal' },
  {
    kind: 'simple',
    title: 'Score Fiscal',
    url: '/score-fiscal',
    icon: Gauge,
    iconName: 'gauge',
    moduleKey: 'score_fiscal',
  },
  {
    kind: 'simple',
    title: 'Análise Fiscal',
    url: '/analise-fiscal',
    icon: FileSearch,
    iconName: 'file-search',
    moduleKey: 'analise_fiscal',
  },
  {
    kind: 'simple',
    title: 'Simulador Tributário',
    url: '/simulador-tributario',
    icon: Calculator,
    iconName: 'calculator',
    moduleKey: 'simulador_tributario',
  },
  {
    kind: 'simple',
    title: 'Diagnóstico CA',
    url: '/diagnostico-ca',
    icon: Stethoscope,
    iconName: 'stethoscope',
    moduleKey: 'diagnostico_ca',
  },

  { kind: 'section', label: 'Administração' },
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
    // Grupo visual: cada item carrega a própria chave de módulo, porque `contatos`
    // e `acessos` já existem como permissão de topo desde antes do agrupamento.
    kind: 'collapsible',
    title: 'Cadastros',
    icon: FolderOpen,
    items: [
      { title: 'Empresas', url: '/contatos', icon: Building2, iconName: 'building-2', moduleKey: 'contatos' },
      { title: 'Procurações', url: '/cadastros/procuracoes', icon: FileSignature, iconName: 'file-signature', moduleKey: 'cadastros_procuracoes' },
      { title: 'Certificados', url: '/cadastros/certificados', icon: BadgeCheck, iconName: 'badge-check', moduleKey: 'cadastros_certificados' },
      { title: 'Alvarás', url: '/cadastros/alvaras', icon: FileText, iconName: 'file-text', moduleKey: 'cadastros_alvaras' },
      { title: 'Acessos', url: '/acessos', icon: LockKeyhole, iconName: 'lock-keyhole', moduleKey: 'acessos' },
      { title: 'Equipe', url: '/cadastros/equipe', icon: UsersRound, iconName: 'users-round', moduleKey: 'equipe', hideFromColaborador: true },
    ],
  },
  {
    kind: 'simple',
    title: 'Configurações',
    url: '/configuracoes',
    icon: Settings,
    iconName: 'settings',
    moduleKey: 'configuracoes',
    hideFromColaborador: true,
    // Cliente externo não tem Configurações por enquanto — os dados da empresa
    // dele vivem em Minha Conta.
    internalOnly: true,
  },
];

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === 'collapsed';
  const showLabels = isMobile || !collapsed;

  // Close sidebar sheet on mobile when navigating
  const handleMobileNav = () => {
    if (isMobile) setOpenMobile(false);
  };
  const { companyName, companyCnpj, company } = useCompany();
  const { pinnedShortcuts, isPinned, togglePin } = usePinnedShortcuts();
  const { isModuleVisible, isSubItemVisible, passesRoleGate } = useModuleAccess();
  const { pendingCount } = usePendingApprovals();

  const logoUrl: string | null = (company as any)?.logo_url ?? null;

  /** Itens visíveis de um grupo — respeita permissão própria do item, do pai e papel. */
  const visibleItems = (entry: CollapsibleModule) =>
    entry.items.filter((item) => {
      if (!passesRoleGate(item)) return false;
      if (item.moduleKey) return isModuleVisible(item.moduleKey);
      return isSubItemVisible(entry.moduleKey ?? '', item.subKey);
    });

  const isEntryVisible = (entry: MenuEntry): boolean => {
    if (entry.kind === 'section') return false; // resolvido na montagem da lista
    if (!passesRoleGate(entry)) return false;
    if (entry.kind === 'simple') return isModuleVisible(entry.moduleKey);
    // Grupo sem moduleKey (Cadastros) depende só dos itens.
    if (entry.moduleKey && !isModuleVisible(entry.moduleKey)) return false;
    return visibleItems(entry).length > 0;
  };

  // Divisor só aparece se existir ao menos um item visível abaixo dele,
  // antes do próximo divisor — senão sobra um rótulo órfão no menu.
  const visibleEntries = menuEntries.filter((entry, index) => {
    if (entry.kind !== 'section') return isEntryVisible(entry);
    for (let i = index + 1; i < menuEntries.length; i++) {
      const next = menuEntries[i];
      if (next.kind === 'section') break;
      if (isEntryVisible(next)) return true;
    }
    return false;
  });

  const [openModules, setOpenModules] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    menuEntries.forEach((entry) => {
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

  const renderPinnedItem = (shortcut: PinnedShortcut) => {
    const IconComponent = iconMap[shortcut.icon] || Tags;
    return (
      <SidebarMenuItem key={shortcut.url}>
        <SidebarMenuButton asChild tooltip={shortcut.title}>
          <NavLink onClick={handleMobileNav}
            to={shortcut.url}
            className="group flex h-8 items-center gap-[9px] rounded-sm py-1.5 pl-[34px] pr-3 text-ui text-muted-ink transition-[background,color] duration-[120ms] hover:bg-bg-2 hover:text-ink"
            activeClassName="bg-brand-tint font-semibold text-brand"
          >
            <IconComponent className="h-[15px] w-[15px] shrink-0" strokeWidth={1.75} />
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

  const renderSectionDivider = (entry: SectionDivider) => {
    if (!showLabels) {
      return (
        <Separator key={`sec-${entry.label}`} className="my-2 mx-3 w-auto bg-sidebar-border" />
      );
    }
    // Kicker de grupo (decisão 07): a CA tem 17 módulos e precisa escanear por
    // seção. Sem borda — o próprio kicker separa.
    return (
      <div
        key={`sec-${entry.label}`}
        className="px-3 pb-1.5 pt-5 text-kicker uppercase text-muted-ink-2"
      >
        {entry.label}
      </div>
    );
  };

  const renderSimpleEntry = (entry: SimpleModule) => (
    <SidebarGroup key={entry.title}>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={entry.title}>
              {/* NavItem do DS: 36px, raio 8, ícone 18, SC/nav */}
              <NavLink onClick={handleMobileNav}
                to={entry.url}
                end={entry.url === '/'}
                className="flex h-9 items-center gap-2.5 rounded-sm px-3 text-nav text-muted-ink transition-[background,color] duration-[120ms] hover:bg-bg-2 hover:text-ink"
                activeClassName="bg-bg-2 font-semibold text-ink"
              >
                <entry.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                {showLabels && <span className="flex-1 truncate">{entry.title}</span>}
                {entry.moduleKey === 'configuracoes' && pendingCount > 0 && (
                  <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-pill bg-danger px-1.5 text-badge font-medium text-white">
                    {pendingCount}
                  </span>
                )}
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
          {/* NavGroup do DS: aberto ganha fundo --bg e texto em tinta cheia */}
          <SidebarGroupLabel
            className={cn(
              'flex h-9 cursor-pointer items-center justify-between rounded-sm py-0 pl-3 pr-2.5 transition-[background,color] duration-[120ms]',
              openModules[entry.title] ? 'bg-bg text-ink' : 'text-muted-ink hover:bg-bg-2 hover:text-ink',
            )}
          >
            <div className="flex items-center gap-2.5">
              <entry.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              {showLabels && (
                <span className={cn('text-nav', openModules[entry.title] ? 'font-semibold' : 'font-medium')}>
                  {entry.title}
                </span>
              )}
            </div>
            {showLabels && (
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-[120ms]", openModules[entry.title] && "rotate-180")} />
            )}
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems(entry).map((item) => (
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
                      className="group flex h-8 items-center gap-[9px] rounded-sm py-1.5 pl-[34px] pr-3 text-ui text-muted-ink transition-[background,color] duration-[120ms] hover:bg-bg-2 hover:text-ink"
                      activeClassName="bg-brand-tint font-semibold text-brand"
                    >
                      <item.icon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.75} />
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
    <Sidebar collapsible="icon" className="border-r border-border">
      {/* Marca: símbolo 28px + nome + CNPJ em mono, como no Shell/Sidebar do Figma */}
      <SidebarHeader className="p-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-brand">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
            ) : (
              <Building2 className="h-4 w-4 text-on-brand" strokeWidth={1.5} />
            )}
          </div>
          {showLabels && (
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-ui-strong text-ink">{companyName}</span>
              <span className="truncate font-mono text-meta text-muted-ink-2">
                {companyCnpj || 'CNPJ não informado'}
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <Separator className="bg-line" />

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

        {visibleEntries.map((entry) => {
          if (entry.kind === 'section') return renderSectionDivider(entry);
          if (entry.kind === 'simple') return renderSimpleEntry(entry);
          return renderCollapsibleEntry(entry);
        })}
      </SidebarContent>

      {/*
        Bloco "conta" (decisão 05): o perfil volta para o rodapé da sidebar e sai
        do topo. Suporte não some — já existe como item do grupo Administração,
        aqui era duplicata.
      */}
      <SidebarFooter className="border-t border-line p-3">
        {showLabels ? <UserMenu variant="bar" /> : <div className="flex justify-center"><UserMenu /></div>}
      </SidebarFooter>
    </Sidebar>
  );
}
