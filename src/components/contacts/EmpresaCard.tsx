import { Building2, ArrowUpRight } from 'lucide-react';
import { IconBox, DsBadge, type BadgeTone } from '@/components/ds';
import { cn } from '@/lib/utils';

/**
 * Card de empresa — frame "empresa/*" da tela R6 (Cadastros › Empresas) do Figma,
 * medido nó a nó: 207px de altura, raio 14, em três blocos.
 *
 *   corpo     IconBox 44 + nome + razão social + CNPJ com selo de situação
 *   métricas  faixa de 3 colunas divididas por hairline (regime/porte/responsável)
 *   rodapé    barra em --bg com a ação de abrir
 *
 * O tom do IconBox e do selo segue a situação do cliente, não a identidade dele:
 * é o que dá para varrer a grade e achar quem está devendo sem ler nome por nome.
 */

export interface EmpresaCardProps {
  nome: string;
  razaoSocial?: string | null;
  documento?: string | null;
  regime?: string | null;
  porte?: string | null;
  responsavel?: string | null;
  /** Títulos vencidos em aberto. 0 = adimplente. */
  titulosVencidos: number;
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
  titulosVencidos,
  inativo,
  onAbrir,
  onNomeClick,
  className,
}: EmpresaCardProps) {
  const devendo = titulosVencidos > 0;
  const tom: BadgeTone = devendo ? 'danger' : 'ok';
  const selo = devendo
    ? `${titulosVencidos} ${titulosVencidos === 1 ? 'título vencido' : 'títulos vencidos'}`
    : 'adimplente';

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
        'flex cursor-pointer flex-col overflow-hidden rounded-lg border border-line bg-paper text-left transition-colors',
        'hover:border-ink/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        inativo && 'opacity-60',
        className,
      )}
    >
      <div className="flex gap-3 px-[18px] pb-4 pt-[18px]">
        <IconBox tone={tom} icon={<Building2 strokeWidth={1.75} />} />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <p
            onClick={onNomeClick}
            className={cn('truncate text-h4-card text-ink', onNomeClick && 'hover:text-brand')}
          >
            {nome}
          </p>
          <p className="truncate text-meta uppercase text-muted-ink-2">{razaoSocial || VAZIO}</p>
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-mono-sm text-muted-ink">{documento || VAZIO}</span>
            <DsBadge tone={tom} className="shrink-0">{selo}</DsBadge>
          </div>
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
