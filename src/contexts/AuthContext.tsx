import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, companyName: string, cnpj: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (emailOrUsername: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, companyName: string, cnpj: string, fullName: string) => {
    try {
      // 1. Criar empresa primeiro (sem auth)
      // Importante: não usamos `.select()` aqui para evitar RLS no RETURNING.
      // Geramos o UUID no client para ter o `company_id` sem precisar ler a linha recém-criada.
      const companyId = crypto.randomUUID();

      const { error: companyError } = await supabase
        .from('companies')
        .insert({ id: companyId, name: companyName, cnpj });

      if (companyError) {
        if (companyError.message.includes('duplicate')) {
          return { error: new Error('Este CNPJ já está cadastrado') };
        }
        return { error: companyError };
      }

      // 2. Criar usuário
      const redirectUrl = `${window.location.origin}/`;
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            company_id: companyId,
            full_name: fullName,
          }
        }
      });

      if (signUpError) {
        // Se signup falhou, tentamos apagar a empresa criada (pode falhar por permissão/RLS, então ignoramos).
        await supabase.from('companies').delete().eq('id', companyId);
        return { error: signUpError };
      }

      // 3. Criar perfil e role
      if (authData.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            user_id: authData.user.id,
            company_id: companyId,
            full_name: fullName,
            email: email,
          });

        if (profileError) {
          console.error('Profile creation error:', profileError);
        }

        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({
            user_id: authData.user.id,
            role: 'admin',
          });

        if (roleError) {
          console.error('Role creation error:', roleError);
        }
      }

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signIn = async (emailOrUsername: string, password: string) => {
    try {
      let email = emailOrUsername;

      // Check if it's a username (no @ symbol)
      if (!emailOrUsername.includes('@')) {
        // Try to find email by username
        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('username', emailOrUsername.toLowerCase())
          .maybeSingle();

        if (profile?.email) {
          email = profile.email;
        } else {
          // Try internal email format
          email = `${emailOrUsername.toLowerCase()}@internal.local`;
        }
      } else {
        // Check if it's a CNPJ format
        const cnpjRegex = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$|^\d{14}$/;
        if (cnpjRegex.test(emailOrUsername.replace(/\D/g, ''))) {
          // Buscar email pelo CNPJ
          const { data: company } = await supabase
            .from('companies')
            .select('id')
            .eq('cnpj', emailOrUsername)
            .maybeSingle();

          if (company) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('email')
              .eq('company_id', company.id)
              .maybeSingle();

            if (profile?.email) {
              email = profile.email;
            }
          }
        }
      }

      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          return { error: new Error('Usuário ou senha incorretos') };
        }
        return { error };
      }

      // Check profile status
      if (authData?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('status, company_id')
          .eq('user_id', authData.user.id)
          .single();

        if (profile?.status === 'blocked') {
          await supabase.auth.signOut();
          const err = new Error('Seu acesso foi bloqueado. Entre em contato com o administrador.');
          (err as any).code = 'STATUS_BLOCKED';
          return { error: err };
        }

        if (profile?.company_id) {
          const { data: companyRow } = await supabase
            .from('companies')
            .select('status')
            .eq('id', profile.company_id)
            .maybeSingle();
          if ((companyRow as any)?.status === 'suspended') {
            await supabase.auth.signOut();
            const err = new Error('O acesso desta empresa está suspenso. Fale com o suporte.');
            (err as any).code = 'COMPANY_SUSPENDED';
            return { error: err };
          }
        }


        // Register active session
        if (profile?.company_id) {
          const sessionUuid = crypto.randomUUID();
          localStorage.setItem('session_uuid', sessionUuid);

          await (supabase as any).from('active_sessions').insert({
            user_id: authData.user.id,
            company_id: profile.company_id,
            session_uuid: sessionUuid,
            device_info: navigator.userAgent,
            logged_in_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
          });
        }
      }

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    const sessionUuid = localStorage.getItem('session_uuid');
    if (sessionUuid) {
      await supabase
        .from('active_sessions')
        .delete()
        .eq('session_uuid', sessionUuid);
      localStorage.removeItem('session_uuid');
    }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
