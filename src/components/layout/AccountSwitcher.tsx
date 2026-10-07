import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronsUpDown, Check, Building, Building2, Loader2, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { useCompany } from '@/hooks/useCompany';
import { useUserRole } from '@/hooks/useUserRole';
import { useAcessos, trocarConta, CONTA_TROCADA_KEY, PAPEL_LABEL } from '@/hooks/useAcessos';
import { useViewMode, type ViewMode } from '@/contexts/ViewModeContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn, maskCPFCNPJ } from '@/lib/utils';

/**
 * Switch de conta — ajuste 24/08/2026: morava no topo da sidebar, migrou pro
 * header (ao lado do Logo) e ganhou o switch Sistema Interno/Externo que
 * antes vivia dentro do menu de Perfil (UserMenu) — os dois eram "qual
 * conta/visão eu estou usando", fez sentido juntar num só lugar.
 *
 * Troca de conta (07/10/2026): um login pode ter vários acessos (um por
 * empresa). A lista vem de `meus_acessos`; trocar grava a conta na sessão
 * (`trocar_conta`) e recarrega o app. "Visualização" é outra coisa: preview
 * do super admin, sem trocar de conta nem de dados. "Ver como cliente" segue
 * no UserMenu.
 *
 * Ajuste 24/08/2026 (print de referência: Staycloud): sem chip de fundo
 * escuro próprio — só o hover sutil, igual aos outros botões do header.
 * O divisor vertical entre Logo e este switch vive no AppHeader.tsx (é a
 * "barrinha" do print), não aqui.
 */
export function AccountSwitcher() {
  const navigate = useNavigate();
  const { companyName, companyCnpj, company } = useCompany();
  const { isSuperAdmin } = useUserRole();
  const { viewMode, setViewMode } = useViewMode();
  const { data: acessos } = useAcessos();
  const [trocando, setTrocando] = useState<string | null>(null);
  const outrasContas = (acessos ?? []).filter((a) => !a.atual && a.tipo === 'empresa');

  // A sessão de login é a mesma em todas as abas: se a conta mudou em outra
  // aba, esta recarrega para não mostrar dados de uma conta e gravar em outra.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CONTA_TROCADA_KEY) window.location.reload();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handleTrocarConta = async (companyId: string) => {
    setTrocando(companyId);
    try {
      await trocarConta(companyId);
    } catch (err) {
      setTrocando(null);
      toast.error(err instanceof Error ? err.message : 'Não foi possível trocar de conta.');
    }
  };

  const logoUrl: string | null = (company as any)?.logo_url ?? null;
  const companyInitial = (companyName || 'C').charAt(0).toUpperCase();

  const handleViewModeChange = (value: ViewMode) => {
    setViewMode(value);
    navigate('/');
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/10"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-paper">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
            ) : (
              <span className="text-ui-strong text-action">{companyInitial}</span>
            )}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="max-w-[160px] truncate text-ui-strong text-nav-on-surface">{companyName}</span>
            <span className="max-w-[160px] truncate font-mono text-meta text-nav-on-surface">
              {(company as any)?.cnpj ? maskCPFCNPJ((company as any).cnpj) : companyCnpj || 'CNPJ não informado'}
            </span>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-nav-on-surface" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <p className="px-2 pb-1.5 text-kicker uppercase text-muted-ink-2">Conta ativa</p>
        <div className="flex items-center gap-2 rounded-sm bg-action-tint px-2 py-2 text-ui-strong text-ink">
          <Check className="h-4 w-4 shrink-0 text-action" />
          <span className="truncate">{companyName}</span>
        </div>
        {outrasContas.length > 0 && (
          <>
            <div className="my-1.5 border-t border-line" />
            <p className="px-2 pb-1.5 text-kicker uppercase text-muted-ink-2">Trocar de conta</p>
            {outrasContas.map((a) => (
              <button
                key={a.company_id}
                type="button"
                disabled={!!trocando}
                onClick={() => handleTrocarConta(a.company_id)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-ui text-muted-ink transition-colors hover:bg-bg-2 disabled:opacity-60"
              >
                {trocando === a.company_id
                  ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  : <Building2 className="h-4 w-4 shrink-0" strokeWidth={1.75} />}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-ink">{a.nome}</span>
                  <span className="truncate text-meta text-muted-ink-2">
                    {a.documento ? `${maskCPFCNPJ(a.documento)} · ` : ''}{PAPEL_LABEL[a.papel] ?? a.papel}
                  </span>
                </span>
              </button>
            ))}
          </>
        )}

        {isSuperAdmin && (
          <>
            <div className="my-1.5 border-t border-line" />
            <p className="px-2 pb-1.5 text-kicker uppercase text-muted-ink-2">Visualização</p>
            <button
              type="button"
              onClick={() => handleViewModeChange('internal')}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-ui transition-colors',
                viewMode === 'internal' ? 'bg-action-tint text-ink' : 'text-muted-ink hover:bg-bg-2',
              )}
            >
              <Building className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              Sistema Interno
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange('external')}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-ui transition-colors',
                viewMode === 'external' ? 'bg-action-tint text-ink' : 'text-muted-ink hover:bg-bg-2',
              )}
            >
              <Rocket className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              Sistema Externo
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
