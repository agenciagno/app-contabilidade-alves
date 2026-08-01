/**
 * Componentes do Design System — medidos no Figma
 * "Contabilidade Alves — Design System", página 01 · Design System.
 *
 * Regra: nenhum valor de cor, raio ou espaçamento literal aqui.
 * Tudo sai dos tokens de index.css via classes do Tailwind.
 */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─────────────────────────── Badge ───────────────────────────
   Pill 22px · pad 3/8 · dot 6px · texto SC/badge (10.5 Medium) */

const badgeTone = {
  ok: { wrap: 'bg-ok-soft text-ok', dot: 'bg-ok' },
  warn: { wrap: 'bg-warn-soft text-warn', dot: 'bg-warn' },
  danger: { wrap: 'bg-danger-soft text-danger', dot: 'bg-danger' },
  info: { wrap: 'bg-brand-soft text-brand', dot: 'bg-brand' },
  neutral: { wrap: 'bg-bg-2 text-muted-ink', dot: 'bg-muted-ink' },
} as const;

export type BadgeTone = keyof typeof badgeTone;

export interface DsBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Ponto colorido à esquerda. Ligado por padrão, como no component set. */
  dot?: boolean;
}

export function DsBadge({ tone = 'neutral', dot = true, className, children, ...props }: DsBadgeProps) {
  const t = badgeTone[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[5px] rounded-pill px-2 py-[3px] text-badge font-medium',
        t.wrap,
        className,
      )}
      {...props}
    >
      {dot && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-pill', t.dot)} aria-hidden />}
      {children}
    </span>
  );
}

/* ────────────────────────── IconBox ──────────────────────────
   44×44 · raio 10 (--r-md) · ícone 20 · fundo tinted */

const iconBoxTone = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-brand-tint text-brand',
  neutral: 'bg-bg-2 text-muted-ink',
} as const;

export interface IconBoxProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: keyof typeof iconBoxTone;
  icon: React.ReactNode;
}

export function IconBox({ tone = 'neutral', icon, className, ...props }: IconBoxProps) {
  return (
    <div
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-md [&_svg]:h-5 [&_svg]:w-5',
        iconBoxTone[tone],
        className,
      )}
      {...props}
    >
      {icon}
    </div>
  );
}

/* ──────────────────────────── Tab ────────────────────────────
   Underline 2px no ativo · sem fundo · h44 */

export interface DsTabProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  icon?: React.ReactNode;
}

export function DsTab({ active = false, icon, className, children, ...props }: DsTabProps) {
  return (
    <button
      type="button"
      data-active={active}
      className={cn(
        'inline-flex h-11 items-center gap-[7px] border-b-2 px-3.5 transition-colors [&_svg]:h-4 [&_svg]:w-4',
        active
          ? 'border-ink text-ui-strong text-ink'
          : 'border-transparent text-nav text-muted-ink hover:text-ink',
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

/* ───────────────────────── SearchField ─────────────────────── */

export interface SearchFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Tecla mostrada à direita como atalho (ex.: "K"). */
  shortcut?: string;
  wrapperClassName?: string;
}

export const SearchField = React.forwardRef<HTMLInputElement, SearchFieldProps>(
  ({ className, wrapperClassName, shortcut, ...props }, ref) => (
    <div
      className={cn(
        'relative flex h-9 items-center rounded-sm border border-line bg-bg px-3',
        'focus-within:border-ink/20 focus-within:ring-2 focus-within:ring-ring/20',
        wrapperClassName,
      )}
    >
      <Search className="h-4 w-4 shrink-0 text-muted-ink-2" aria-hidden />
      <input
        ref={ref}
        className={cn(
          'ml-2 w-full bg-transparent text-ui text-ink outline-none placeholder:text-muted-ink-2',
          className,
        )}
        {...props}
      />
      {shortcut && (
        <kbd className="ml-2 hidden shrink-0 rounded-[4px] border border-line bg-paper px-1.5 py-0.5 text-meta text-muted-ink-2 sm:inline-block">
          {shortcut}
        </kbd>
      )}
    </div>
  ),
);
SearchField.displayName = 'SearchField';

/* ─────────────────────── Navegação lateral ───────────────────
   NavItem 220×36 r8 · NavGroup idem com chevron · NavSubItem 32px
   recuado 34px à esquerda, ativo em brand/tint */

const navBase =
  'flex w-full items-center rounded-sm transition-colors [&_svg]:shrink-0';

export interface NavItemProps extends React.HTMLAttributes<HTMLElement> {
  active?: boolean;
  icon?: React.ReactNode;
  asChild?: boolean;
}

export function NavItem({ active = false, icon, className, children, ...props }: NavItemProps) {
  return (
    <span
      data-nav-item
      data-active={active}
      className={cn(
        navBase,
        'h-9 gap-2.5 px-3 [&_svg]:h-[18px] [&_svg]:w-[18px]',
        active ? 'bg-bg-2 text-nav font-semibold text-ink' : 'text-nav text-muted-ink hover:bg-bg-2 hover:text-ink',
        className,
      )}
      {...props}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

export interface NavGroupProps extends NavItemProps {
  expanded?: boolean;
  chevron?: React.ReactNode;
}

export function NavGroup({ expanded = false, icon, chevron, className, children, ...props }: NavGroupProps) {
  return (
    <span
      data-nav-item
      data-active={expanded}
      className={cn(
        navBase,
        'h-9 gap-2.5 py-0 pl-3 pr-2.5 [&_svg]:h-[18px] [&_svg]:w-[18px]',
        expanded ? 'bg-bg text-nav font-semibold text-ink' : 'text-nav text-muted-ink hover:bg-bg-2 hover:text-ink',
        className,
      )}
      {...props}
    >
      {icon}
      <span className="flex-1 truncate text-left">{children}</span>
      {chevron}
    </span>
  );
}

export function NavSubItem({ active = false, icon, className, children, ...props }: NavItemProps) {
  return (
    <span
      data-nav-item
      data-active={active}
      className={cn(
        navBase,
        'h-8 gap-[9px] py-1.5 pl-[34px] pr-3 [&_svg]:h-[15px] [&_svg]:w-[15px]',
        active
          ? 'bg-brand-tint text-ui font-semibold text-brand'
          : 'text-ui text-muted-ink hover:bg-bg-2 hover:text-ink',
        className,
      )}
      {...props}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

/* ────────────────── Kicker de grupo (decisão 07) ────────────── */

export function NavGroupKicker({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <p className={cn('px-3 pb-1.5 pt-5 text-kicker uppercase text-muted-ink-2', className)}>
      {children}
    </p>
  );
}

/* ───────────────────────── StatCard ──────────────────────────
   Indicador numerado (decisão 06) · 116px · raio 14 · pad 18/22
   emphasis="warm" marca o de maior urgência */

const statCard = cva('flex flex-col gap-1.5 rounded-lg border p-[18px_22px]', {
  variants: {
    emphasis: {
      none: 'border-line bg-paper',
      warm: 'border-warn bg-warn-soft',
    },
  },
  defaultVariants: { emphasis: 'none' },
});

export interface StatCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof statCard> {
  /** Índice ordinal exibido antes do rótulo — "01", "02"… */
  index?: string;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}

export function StatCard({ index, label, value, hint, emphasis, className, ...props }: StatCardProps) {
  return (
    <div className={cn(statCard({ emphasis }), className)} {...props}>
      <div className="flex items-center gap-[7px]">
        {index && <span className="text-kicker font-bold uppercase text-ink">{index}</span>}
        <span className={cn('text-kicker uppercase', emphasis === 'warm' ? 'text-warn' : 'text-muted-ink')}>
          {label}
        </span>
      </div>
      <p className="text-metric-xl text-ink">{value}</p>
      {hint && <p className="text-meta text-muted-ink">{hint}</p>}
    </div>
  );
}

/* ───────────────────────── PageHeader ────────────────────────
   Cabeçalho de tela: kicker + título + subtítulo, ações à direita.
   Mesmo desenho em todas as telas R1–R7 do protótipo. */

export interface PageHeaderProps {
  /** Rótulo de rota, estilo terminal — "~/tarefas · competência julho 2026" */
  kicker: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ kicker, title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        <p className="text-kicker uppercase text-muted-ink-2">{kicker}</p>
        <h1 className="mt-1 text-display first-letter:uppercase text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-body text-muted-ink">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ──────────────────────── StatCardRow ────────────────────────
   Fila de indicadores numerados (decisão 06): o índice ordinal entra
   automático, então a ordem na tela é a ordem da lista. */

export interface StatItem {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  emphasis?: 'none' | 'warm';
}

export function StatCardRow({ items, className }: { items: StatItem[]; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {items.map((it, i) => (
        <StatCard
          key={it.label}
          index={String(i + 1).padStart(2, '0')}
          label={it.label}
          value={it.value}
          hint={it.hint}
          emphasis={it.emphasis}
        />
      ))}
    </div>
  );
}

/* ─────────────────────────── Alert ───────────────────────────
   Faixa contextual · borda esquerda 3px · raio 10 */

const alertTone = {
  info: 'border-brand bg-brand-tint text-brand',
  warn: 'border-warn bg-warn-soft text-warn',
  danger: 'border-danger bg-danger-soft text-danger',
} as const;

export interface DsAlertProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: keyof typeof alertTone;
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

export function DsAlert({ tone = 'info', icon, title, description, action, className, ...props }: DsAlertProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3.5 rounded-md border border-l-[3px] px-5 py-4 [&_svg]:h-[22px] [&_svg]:w-[22px]',
        alertTone[tone],
        className,
      )}
      {...props}
    >
      {icon}
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <p className="truncate text-ui-strong text-ink">{title}</p>
        {description && <p className="truncate text-meta text-muted-ink">{description}</p>}
      </div>
      {action}
    </div>
  );
}
