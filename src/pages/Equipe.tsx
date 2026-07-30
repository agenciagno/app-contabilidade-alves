import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import UsersTab from '@/components/users/UsersTab';

/**
 * Equipe — mesma tela que vivia na aba "Minha Equipe" de Configurações,
 * agora com rota própria dentro de Cadastros. Reaproveita `UsersTab` inteiro.
 */
export default function Equipe() {
  const { user } = useAuth();

  const { data: companyId, isLoading } = useQuery({
    queryKey: ['equipe-company-id', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data.company_id;
    },
    enabled: !!user?.id,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Equipe</h1>
        <p className="text-muted-foreground">Usuários, permissões e sessões ativas</p>
      </div>

      {isLoading || !companyId || !user ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <UsersTab companyId={companyId} currentUserId={user.id} />
      )}
    </div>
  );
}
