import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import UsersTab from '@/components/users/UsersTab';
import { PageHeader } from '@/components/ds';

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
      <PageHeader
        kicker="~/cadastros · equipe"
        title="Equipe."
        subtitle="Usuários do sistema e permissões por módulo."
      />

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
