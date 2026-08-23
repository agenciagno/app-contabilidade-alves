import { Users, Pencil } from 'lucide-react';
import { IconBox, DsBadge } from '@/components/ds';
import { cn } from '@/lib/utils';
import type { Party, PartyTipo } from '@/hooks/useParties';

/**
 * Card de contraparte — mesma estrutura de 3 blocos do EmpresaCard
 * (src/components/contacts/EmpresaCard.tsx), campos trocados pro que faz
 * sentido pra cliente/fornecedor em vez de empresa cadastrada internamente
 * (23/08/2026):
 *
 *   corpo     IconBox + nome de exibição + nome + documento
 *   métricas  faixa de 3 colunas (tipo/email/telefone)
 *   rodapé    subtítulo + ação de editar (Party não tem "super perfil",
 *             é edição inline via dialog)
 */

const tipoLabel: Record<PartyTipo, string> = {
  cliente: 'Cliente',
  fornecedor: 'Fornecedor',
  ambos: 'Ambos',
};

export interface PartyCardProps {
  party: Party;
  subtitle: string;
  onEdit: () => void;
  onToggleActive: () => void;
  className?: string;
}

const VAZIO = '—';

export function PartyCard({ party, subtitle, onEdit, onToggleActive, className }: PartyCardProps) {
  const titulo = party.display_name || party.nome;
  const mostraNomeSecundario = !!party.display_name && party.display_name !== party.nome;

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-lg border border-line bg-paper text-left transition-colors',
        'hover:border-ink/20',
        !party.is_active && 'opacity-60',
        className,
      )}
    >
      <button
        type="button"
        onClick={onToggleActive}
        title={party.is_active ? 'Clique para desativar' : 'Clique para ativar'}
        className="absolute right-3 top-3 z-10 shrink-0 cursor-pointer"
      >
        <DsBadge tone={party.is_active ? 'ok' : 'neutral'}>{party.is_active ? 'ativo' : 'inativo'}</DsBadge>
      </button>

      <div className="flex gap-3 px-[18px] pb-4 pt-[18px]">
        <IconBox tone={party.is_active ? 'ok' : 'neutral'} icon={<Users strokeWidth={1.75} />} />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px] pr-24">
          <p className="truncate text-h4-card text-ink">{titulo}</p>
          {mostraNomeSecundario && (
            <p className="truncate text-meta uppercase text-muted-ink-2">{party.nome}</p>
          )}
          <span className="truncate font-mono text-mono-sm text-muted-ink">{party.documento || VAZIO}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 border-t border-line-2">
        <Metrica label="Tipo" valor={tipoLabel[party.tipo]} />
        <Metrica label="Email" valor={party.email} className="border-l border-line-2" />
        <Metrica label="Telefone" valor={party.telefone} className="border-l border-line-2" />
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="mt-auto flex items-center gap-2.5 border-t border-line-2 bg-bg px-[18px] py-[11px] text-left hover:bg-bg-2"
      >
        <span className="flex-1 truncate text-meta text-muted-ink-2">{subtitle}</span>
        <span className="flex shrink-0 items-center gap-1 text-link text-action">
          Editar
          <Pencil className="h-[13px] w-[13px]" strokeWidth={2} />
        </span>
      </button>
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
