import { Building2, ArrowUpRight } from 'lucide-react';
import { IconBox, DsBadge, type BadgeTone } from '@/components/ds';
import { cn } from '@/lib/utils';

/**
 * Card de empresa — frame "empresa/*" da tela R6 (Cadastros › Empresas) do Figma,
 * medido nó a nó: 207px de altura, raio 14, em três blocos.
 *
 *   corpo     IconBox 44 + nome + razão social + CNPJ, selo de Status no canto superior direito
 *   métricas  faixa de 3 colunas divididas por hairline (regime/porte/responsável)
 *   rodapé    barra em --bg com a ação de abrir
 *
 * O tom do IconBox e do selo segue a situação (status_cliente) do cliente, não a identidade dele:
 * é o que dá para varrer a grade e achar quem está Suspenso/Inativo sem ler nome por nome.
 */

const STATUS_TONE: Record<string, BadgeTone> = {
  Ativo: 'ok',
  Suspenso: 'warn',
  Inativo: 'danger',
  Encerrado: 'neutral',
  'Ex-cliente': 'neutral',
};

export interface EmpresaCardProps {
  nome: string;
  razaoSocial?: string | null;
  documento?: string | null;
  regime?: string | null;
  porte?: string | null;
  responsavel?: string | null;
  /** Status do cliente (Ativo/Inativo/Suspenso/Encerrado/Ex-cliente). */
  status?: string | null;
  inativo?: boolean;
  onAbrir: () => void;
  /** Ação opcional no nome (copiar, por exemplo). */
  onNomeClick?: (e: React.MouseEvent) => void;
  className?: string;
}

const VAZIO = '—';

export function EmpresaCard({
  nome,
  razaoSocial,
  documento,
  regime,
  porte,
  responsavel,
  status,
  inativo,
  onAbrir,
  onNomeClick,
  className,
}: EmpresaCardProps) {
  const tom: BadgeTone = (status && STATUS_TONE[status]) || 'neutral';
  const selo = status || 'Sem status';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAbrir();
        }
      }}
      className={cn(
        'relative flex cursor-pointer flex-col overflow-hidden rounded-lg border border-line bg-paper text-left transition-colors',
        'hover:border-ink/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        inativo && 'opacity-60',
        className,
      )}
    >
      <DsBadge tone={tom} className="absolute right-3 top-3 z-10 shrink-0">{selo}</DsBadge>

      <div className="flex gap-3 px-[18px] pb-4 pt-[18px]">
        <IconBox tone={tom} icon={<Building2 strokeWidth={1.75} />} />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px] pr-24">
          <p
            onClick={onNomeClick}
            className={cn('truncate text-h4-card text-ink', onNomeClick && 'hover:text-brand')}
          >
            {nome}
          </p>
          <p className="truncate text-meta uppercase text-muted-ink-2">{razaoSocial || VAZIO}</p>
          <span className="truncate font-mono text-mono-sm text-muted-ink">{documento || VAZIO}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 border-t border-line-2">
        <Metrica label="Regime" valor={regime} />
        <Metrica label="Porte" valor={porte} className="border-l border-line-2" />
        <Metrica label="Responsável" valor={responsavel} className="border-l border-line-2" />
      </div>

      <div className="mt-auto flex items-center gap-2.5 border-t border-line-2 bg-bg px-[18px] py-[11px]">
        <span className="flex-1 truncate text-meta text-muted-ink-2">ver super perfil</span>
        <span className="flex shrink-0 items-center gap-1 text-link text-brand">
          Abrir
          <ArrowUpRight className="h-[13px] w-[13px]" strokeWidth={2} />
        </span>
      </div>
    </div>
  );
}

function Metrica({ label, valor, className }: { label: string; valor?: string | null; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-[3px] py-3 pl-3.5 pr-2.5', className)}>
      <span className="truncate text-kicker uppercase text-muted-ink-2">{label}</span>
      <span className="truncate text-meta text-ink-2">{valor || VAZIO}</span>
    </div>
  );
}
