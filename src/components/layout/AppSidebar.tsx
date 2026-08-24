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
  BookOpen,
  Users,
  LifeBuoy,
  type LucideIcon,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { usePinnedShortcuts, PinnedShortcut } from '@/hooks/usePinnedShortcuts';
import { useModuleAccess, type RoleGated } from '@/hooks/useModuleAccess';
import { useAudience } from '@/hooks/useAudience';
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
  SidebarFooter,
  SidebarTrigger,
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
  /** Audiência do divisor — ausente = aparece nas duas visões. */
  audience?: 'internal' | 'external' | 'both';
}

interface SimpleModule extends RoleGated {
  kind: 'simple';
  title: string;
  url: string;
  icon: LucideIcon;
  iconName: string;
  /** Ausente = sem gate de módulo (rota já é aberta a qualquer usuário logado, ex. Suporte). */
  moduleKey?: string;
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
      // Audiência por item (decisão Gabriel 10/08): Disparos e Agente IA são da
      // operação interna; Clientes Externos e LGPD vivem na visão do produto;
      // Central de Notificações existe nas duas.
      { title: 'Disparos', url: '/disparos', icon: Send, iconName: 'send', subKey: 'tech_disparos', audience: 'internal' },
      { title: 'Clientes Externos', url: '/tech/clientes-externos', icon: Building2, iconName: 'building-2', requireSuperAdmin: true, audience: 'external' },
      { title: 'Canais de Suporte', url: '/tech/suporte-canais', icon: MessageSquare, iconName: 'message-square', requireSuperAdmin: true, audience: 'external' },
      { title: 'LGPD', url: '/tech/lgpd', icon: ShieldCheck, iconName: 'shield-check', requireAdmin: true, audience: 'external' },
      { title: 'Agente IA', url: '/tech/agente-ia', icon: Bot, iconName: 'bot', requireAdmin: true, audience: 'internal' },
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
      { title: 'Obrigações e Declarações', url: '/fiscal/obrigacoes', icon: BookOpen, iconName: 'book-open', subKey: 'fiscal_obrigacoes_declaracoes', requireAdmin: true },
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

  // Divisor só da visão interna — no Sistema Externo o menu é curto e o rótulo
  // seria ruído (pedido de Gabriel, 10/08).
  { kind: 'section', label: 'Administração', audience: 'internal' },
  {
    kind: 'collapsible',
    title: 'Financeiro',
    icon: Wallet,
    moduleKey: 'financeiro',
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
      // Clientes & Fornecedores mudou de casa: na visão externa vive no grupo
      // Cadastro (decisão Gabriel 10/08). Categorias segue aqui, só no externo.
      { title: 'Categorias', url: '/financeiro/categorias-clientes', icon: Tags, iconName: 'tags', subKey: 'financeiro_categorias' },
      { title: 'Metas & Orçamentos', url: '/financeiro/metas-orcamentos', icon: Target, iconName: 'target', subKey: 'financeiro_metas_orcamentos' },
    ],
  },
  {
    kind: 'collapsible',
    title: 'Cadastro',
    icon: FolderOpen,
    moduleKey: 'cadastro',
    items: [
      { title: 'Empresas', url: '/contatos', icon: Building2, iconName: 'building-2', subKey: 'contatos' },
      { title: 'Procurações', url: '/cadastros/procuracoes', icon: FileSignature, iconName: 'file-signature', subKey: 'cadastros_procuracoes' },
      { title: 'Certificados', url: '/cadastros/certificados', icon: BadgeCheck, iconName: 'badge-check', subKey: 'cadastros_certificados' },
      { title: 'Alvarás', url: '/cadastros/alvaras', icon: FileText, iconName: 'file-text', subKey: 'cadastros_alvaras' },
      { title: 'Acessos', url: '/acessos', icon: LockKeyhole, iconName: 'lock-keyhole', subKey: 'acessos' },
      { title: 'Equipe', url: '/cadastros/equipe', icon: UsersRound, iconName: 'users-round', subKey: 'equipe' },
      // Veio do grupo Financeiro: no Cadastro da visão externa (audiência
      // 'external' via MODULE_AUDIENCE); permissão continua a do Financeiro.
      { title: 'Clientes & Fornecedores', url: '/financeiro/clientes-fornecedores', icon: Contact, iconName: 'contact', moduleKey: 'financeiro', subKey: 'financeiro_clientes_fornecedores' },
    ],
  },
  {
    kind: 'simple',
    title: 'Configurações',
    url: '/configuracoes',
    icon: Settings,
    iconName: 'settings',
    moduleKey: 'configuracoes',
    // Cliente externo não tem Configurações por enquanto — os dados da empresa
    // dele vivem em Minha Conta.
    internalOnly: true,
  },
  // Suporte saiu daqui (ajuste 24/08/2026) — agora é um ícone dedicado no
  // header, ao lado de Notificações. iconName 'life-buoy' segue em iconMap
  // acima só pra não quebrar atalho já fixado por alguém antes desta troca.
];

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === 'collapsed';
  const showLabels = isMobile || !collapsed;

  // Close sidebar sheet on mobile when navigating
  const handleMobileNav = () => {
    if (isMobile) setOpenMobile(false);
  };
  const { pinnedShortcuts, isPinned, togglePin } = usePinnedShortcuts();
  const { isModuleVisible, isSubItemVisible, passesRoleGate } = useModuleAccess();
  const audience = useAudience();
  const { pendingCount } = usePendingApprovals();

  /** Itens visíveis de um grupo — respeita permissão própria do item, do pai e papel. */
  const visibleItems = (entry: CollapsibleModule) =>
    entry.items.filter((item) => {
      if (!passesRoleGate(item)) return false;
      // Item com módulo próprio (ex.: C&F no grupo Cadastro, que pertence ao
      // Financeiro): checa o módulo dele E o submódulo dele, não os do grupo.
      if (item.moduleKey) {
        if (!isModuleVisible(item.moduleKey)) return false;
        return isSubItemVisible(item.moduleKey, item.subKey);
      }
      return isSubItemVisible(entry.moduleKey ?? '', item.subKey);
    });

  const isEntryVisible = (entry: MenuEntry): boolean => {
    if (entry.kind === 'section') return false; // resolvido na montagem da lista
    if (!passesRoleGate(entry)) return false;
    if (entry.kind === 'simple') return entry.moduleKey ? isModuleVisible(entry.moduleKey) : true;
    // Grupo sem moduleKey (Cadastros) depende só dos itens.
    if (entry.moduleKey && !isModuleVisible(entry.moduleKey)) return false;
    return visibleItems(entry).length > 0;
  };

  // Divisor só aparece se existir ao menos um item visível abaixo dele,
  // antes do próximo divisor — senão sobra um rótulo órfão no menu.
  // Divisor com audiência declarada também respeita a visão ativa.
  const visibleEntries = menuEntries.filter((entry, index) => {
    if (entry.kind !== 'section') return isEntryVisible(entry);
    if (entry.audience && entry.audience !== 'both' && entry.audience !== audience) return false;
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

  // Ativo/hover unificado (redesign 24/08/2026): item simples e sub-item de
  // grupo usavam 2 tratamentos diferentes (action-tint/brand-tint) — agora os
  // dois (e o trigger do grupo colapsável) usam o mesmo par de tokens
  // --nav-surface-strong/--nav-on-surface, já que tudo vive sobre --nav-surface.
  const navActiveClass = 'bg-nav-surface-strong font-semibold text-nav-on-surface';
  const navHoverClass = 'hover:bg-nav-surface-strong hover:font-semibold hover:text-nav-on-surface';

  // Ajuste 24/08/2026 (print de produção): texto/ícone sempre branco cheio
  // (era /80, /70, /60... — ficava "apagado" contra o fundo). Ícone
  // centralizado quando colapsado (px-0 + justify-center) — antes ficava
  // grudado à esquerda porque o px-3 sobrava mesmo sem rótulo pra preencher.
  // mx-auto é o que de fato centraliza: o botão vira largura fixa 32px no
  // colapsado (group-data-[collapsible=icon]:!size-8, !important, vem do
  // componente base) — justify-center sozinho só centraliza o ÍCONE dentro
  // desse box de 32px, não o box em si dentro da coluna de 64px (achado
  // 24/08/2026, ícone ficava "grudado" à esquerda mesmo com justify-center).
  const collapsedCenterClass = 'mx-auto justify-center px-0';

  const renderPinnedItem = (shortcut: PinnedShortcut) => {
    const IconComponent = iconMap[shortcut.icon] || Tags;
    return (
      <SidebarMenuItem key={shortcut.url}>
        <SidebarMenuButton asChild tooltip={shortcut.title}>
          <NavLink onClick={handleMobileNav}
            to={shortcut.url}
            className={cn(
              'group flex h-8 items-center gap-[9px] rounded-sm py-1.5 text-ui text-nav-on-surface transition-[background,color] duration-[120ms]',
              showLabels ? 'pl-[34px] pr-3' : collapsedCenterClass,
              navHoverClass,
            )}
            activeClassName={navActiveClass}
          >
            <IconComponent className="h-[15px] w-[15px] shrink-0" strokeWidth={1.75} />
            {showLabels && (
              <>
                <span className="flex-1 truncate">{shortcut.title}</span>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin(shortcut); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <PinOff className="w-3 h-3 text-nav-on-surface" />
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
        <Separator key={`sec-${entry.label}`} className="my-2 mx-3 w-auto bg-nav-on-surface/15" />
      );
    }
    // Kicker de grupo (decisão 07): a CA tem 17 módulos e precisa escanear por
    // seção. Sem borda — o próprio kicker separa.
    return (
      <div
        key={`sec-${entry.label}`}
        className="px-3 pb-1.5 pt-5 text-kicker uppercase text-nav-on-surface"
      >
        {entry.label}
      </div>
    );
  };

  const renderSimpleEntry = (entry: SimpleModule) => (
    <SidebarMenuItem key={entry.title}>
      <SidebarMenuButton asChild tooltip={entry.title}>
        {/* NavItem do DS: 32px, raio 8, ícone 18, SC/nav (densidade 24/08/2026) */}
        <NavLink onClick={handleMobileNav}
          to={entry.url}
          end={entry.url === '/'}
          className={cn(
            'flex h-8 items-center gap-2.5 rounded-sm text-nav text-nav-on-surface transition-[background,color] duration-[120ms]',
            showLabels ? 'px-3' : collapsedCenterClass,
            navHoverClass,
          )}
          activeClassName={navActiveClass}
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
  );

  const renderCollapsibleEntry = (entry: CollapsibleModule) => (
    <SidebarMenuItem key={entry.title}>
      {/* open força fechado quando colapsado — senão os sub-itens tentam
          renderizar indentados numa coluna de ícone só (24/08/2026). */}
      <Collapsible open={showLabels && !!openModules[entry.title]} onOpenChange={() => handleToggleModule(entry.title)}>
        <CollapsibleTrigger asChild>
          {/* NavGroup do DS: aberto ganha o mesmo par ativo/hover dos itens */}
          <SidebarGroupLabel
            className={cn(
              'flex h-8 cursor-pointer items-center justify-between rounded-sm py-0 text-nav-on-surface transition-[background,color] duration-[120ms]',
              showLabels ? 'pl-3 pr-2.5' : collapsedCenterClass,
              openModules[entry.title] ? navActiveClass : navHoverClass,
            )}
          >
            <div className="flex items-center gap-2.5">
              <entry.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              {showLabels && (
                <span className={cn('text-nav', openModules[entry.title] && 'font-semibold')}>
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
          {/* mt-2 dá respiro entre o item principal e o 1º sub-item (estava
              embolado); a linha vertical azul sutil identifica o grupo de
              sub-itens (pedido 24/08/2026, exemplo do Cloudflare). */}
          <div className="relative mt-2">
            <div aria-hidden className="pointer-events-none absolute bottom-1 left-[19px] top-1 w-px bg-[#8ec2fb]/40" />
            <SidebarMenu className="gap-0.5">
              {visibleItems(entry).map((item) => (
                <SidebarMenuItem key={item.title}>
                  {item.sectionBreak && showLabels && (
                    <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-[0.05em] text-nav-on-surface border-t border-nav-on-surface/15 mt-1">
                      {item.sectionBreak}
                    </div>
                  )}
                  {item.sectionBreak && !showLabels && (
                    <Separator className="my-1.5 mx-2 w-auto bg-nav-on-surface/15" />
                  )}
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink onClick={handleMobileNav}
                      to={item.url}
                      className={cn('group flex h-8 items-center gap-[9px] rounded-sm py-1.5 pl-[34px] pr-3 text-ui text-nav-on-surface transition-[background,color] duration-[120ms]', navHoverClass)}
                      activeClassName={navActiveClass}
                    >
                      <item.icon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.75} />
                      {showLabels && (
                        <>
                          <span className="flex-1 truncate">{item.title}</span>
                          <button onClick={(e) => handlePinClick(e, item)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                            {isPinned(item.url) ? <PinOff className="w-3 h-3 text-nav-on-surface" /> : <Pin className="w-3 h-3 text-nav-on-surface" />}
                          </button>
                        </>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );

  // Agrupa entradas visíveis em "corridas" contínuas entre divisores de seção —
  // cada corrida é UMA SidebarMenu. gap-[2.8px] = 2px * 1.4 (pedido de +40% no
  // espaçamento entre itens PRINCIPAIS, 24/08/2026 — sub-itens continuam
  // gap-0.5/2px, não fazem parte do pedido). Espaço entre seções diferentes
  // vem do padding do kicker, não precisa de gap extra.
  const renderMenuRuns = () => {
    const output: JSX.Element[] = [];
    let run: MenuEntry[] = [];
    const flushRun = () => {
      if (run.length === 0) return;
      output.push(
        <SidebarMenu key={`run-${output.length}`} className="gap-[2.8px]">
          {run.map((e) => (e.kind === 'simple' ? renderSimpleEntry(e) : renderCollapsibleEntry(e as CollapsibleModule)))}
        </SidebarMenu>,
      );
      run = [];
    };
    visibleEntries.forEach((entry) => {
      if (entry.kind === 'section') {
        flushRun();
        output.push(renderSectionDivider(entry));
      } else {
        run.push(entry);
      }
    });
    flushRun();
    return output;
  };

  return (
    <Sidebar collapsible="icon">
      {/* Ajuste 24/08/2026: o cartão de conta que morava aqui migrou pro
          header (ao lado do Logo, ver AccountSwitcher.tsx) — pt-4 no lugar
          dele mantém o respiro antes do 1º item, já que não sobra mais
          nenhum bloco aqui pra abrir esse espaço sozinho. */}
      <SidebarContent className="px-2 pt-4">
        {/* Atalhos Fixados */}
        {pinnedShortcuts.length > 0 && (
          <SidebarGroup className="p-0">
            <SidebarGroupLabel className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.05em] text-nav-on-surface">
              <Pin className="w-3 h-3 inline mr-1.5" />
              Atalhos
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-[2.8px]">
                {pinnedShortcuts.map(renderPinnedItem)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {renderMenuRuns()}
      </SidebarContent>

      {/*
        Rodapé (ajuste 24/08/2026): o menu de Perfil (UserMenu) e o item
        Suporte subiram pro header, alinhados à direita — só sobra aqui o
        toggle de colapsar/expandir, centralizado.
      */}
      <SidebarFooter className="border-t border-nav-on-surface/15 p-3">
        <div className="flex justify-center">
          <SidebarTrigger className="h-8 w-8 shrink-0 text-nav-on-surface hover:bg-nav-surface-strong hover:text-nav-on-surface" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
