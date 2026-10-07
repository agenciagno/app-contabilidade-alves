import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Building2, ChevronRight, Loader2, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAcessos, trocarConta, PAPEL_LABEL, type Acesso } from '@/hooks/useAcessos';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Logo } from '@/components/brand/Logo';
import { maskCPFCNPJ } from '@/lib/utils';
import { toast } from 'sonner';

/**
 * "Escolha a conta" — aparece logo depois do login quando a pessoa tem mais de
 * um acesso (ex.: Contabilidade Alves como ADM e a própria empresa no Sistema
 * Externo). Mesmo modelo de app de banco: um login, várias contas.
 */
export default function EscolherConta() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { data: acessos, isLoading } = useAcessos();
  const [entrando, setEntrando] = useState<string | null>(null);

  // Uma conta só: nada a escolher.
  useEffect(() => {
    if (acessos && acessos.length <= 1) navigate('/', { replace: true });
  }, [acessos, navigate]);

  if (!loading && !user) return <Navigate to="/auth" replace />;

  const entrar = async (a: Acesso) => {
    if (a.tipo !== 'empresa') return;
    setEntrando(a.company_id);
    try {
      await trocarConta(a.company_id);
    } catch (err) {
      setEntrando(null);
      toast.error(err instanceof Error ? err.message : 'Não foi possível entrar nesta conta.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <Logo className="h-12" />
        </div>

        <Card className="rounded-xl border border-line bg-paper shadow-sc-lg">
          <CardHeader className="pb-2">
            <h2 className="text-center text-h4-card text-ink">Escolha a conta</h2>
            <p className="text-center text-ui text-muted-ink">Você pode trocar depois, pelo nome da empresa no topo.</p>
          </CardHeader>

          <CardContent className="space-y-2">
            {isLoading || !acessos ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-ink" />
              </div>
            ) : (
              acessos.map((a) => {
                const emBreve = a.tipo !== 'empresa';
                return (
                  <button
                    key={`${a.tipo}-${a.company_id}-${a.contact_id ?? ''}`}
                    type="button"
                    disabled={emBreve || !!entrando}
                    onClick={() => entrar(a)}
                    className="flex w-full items-center gap-3 rounded-md border border-line px-3 py-3 text-left transition-colors hover:bg-bg-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-action-tint">
                      <Building2 className="h-4 w-4 text-action" strokeWidth={1.75} />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-ui-strong text-ink">{a.nome}</span>
                      <span className="truncate text-meta text-muted-ink">
                        {a.documento ? `${maskCPFCNPJ(a.documento)} · ` : ''}
                        {emBreve ? 'Portal do Cliente — em breve' : PAPEL_LABEL[a.papel] ?? a.papel}
                      </span>
                    </div>
                    {entrando === a.company_id ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-ink" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-ink-2" />
                    )}
                  </button>
                );
              })
            )}

            <button
              type="button"
              onClick={async () => { await signOut(); navigate('/auth', { replace: true }); }}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-ui text-muted-ink transition-colors hover:bg-bg-2"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} />
              Sair
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
