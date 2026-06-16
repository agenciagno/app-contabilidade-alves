import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useUserRole() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['user-role-profile', user?.id],
    queryFn: async () => {
      // Main profile query with stable fields
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, is_super_admin, allowed_modules, avatar_url, status_active, full_name, email, force_password_change')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;

      // Separate resilient read for password_changed_at
      let passwordChangedAt: string | null | undefined = undefined;
      try {
        const { data: pwData, error: pwError } = await supabase
          .from('profiles')
          .select('password_changed_at')
          .eq('user_id', user!.id)
          .single();
        if (!pwError && pwData) {
          // Preserve null explicitly — don't coalesce to undefined
          passwordChangedAt = (pwData as any).password_changed_at !== undefined
            ? (pwData as any).password_changed_at
            : undefined;
        }
      } catch {
        // If this fails (schema cache, missing column, etc.), treat as already changed
        passwordChangedAt = undefined;
      }

      return { ...profile, passwordChangedAt };
    },
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const role = data?.role ?? 'colaborador';
  const isSuperAdmin = role === 'super_admin' || (data?.is_super_admin ?? false);

  // Determine if password change is required:
  // - Super admins are always exempt
  // - If passwordChangedAt is undefined (query failed or field missing), treat as already changed (resilience)
  // - Force if passwordChangedAt is explicitly null OR force_password_change is true
  const forcePasswordChange = false;

  return {
    role,
    isSuperAdmin,
    isAdmin: role === 'admin',
    isColaborador: role === 'colaborador',
    allowedModules: (data?.allowed_modules as string[]) ?? ['home', 'financeiro', 'clientes'],
    forcePasswordChange,
    avatarUrl: data?.avatar_url ?? null,
    statusActive: data?.status_active ?? true,
    fullName: data?.full_name ?? null,
    email: data?.email ?? null,
    isLoading,
  };
}
