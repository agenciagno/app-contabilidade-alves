import { X, Eye } from 'lucide-react';
import { useViewMode } from '@/contexts/ViewModeContext';

/**
 * Faixa fixa exibida enquanto o super admin está em "Ver como cliente".
 * Deixa explícito que é um preview VISUAL: o menu simula o plano do tenant,
 * mas os dados na tela continuam sendo os da própria CA (RLS não deixa — e
 * não deve deixar — ver dado do cliente).
 */
export function ViewAsClientBanner() {
  const { previewTenant, setPreviewTenant } = useViewMode();

  if (!previewTenant) return null;

  return (
    <div className="flex items-center justify-between gap-3 bg-brand px-4 py-2 text-sm text-white">
      <span className="flex min-w-0 items-center gap-2">
        <Eye className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        <span className="truncate">
          Vendo como <strong>{previewTenant.name}</strong> — preview do plano; os dados exibidos não são os do cliente.
        </span>
      </span>
      <button
        onClick={() => setPreviewTenant(null)}
        className="flex shrink-0 items-center gap-1 rounded-sm px-2 py-1 transition-colors hover:bg-white/10"
        aria-label="Sair do modo Ver como cliente"
      >
        <X className="h-4 w-4" strokeWidth={1.75} />
        Sair
      </button>
    </div>
  );
}
