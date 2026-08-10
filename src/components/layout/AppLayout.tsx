import { ReactNode, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { DevEnvironmentBanner } from './DevEnvironmentBanner';
import { ViewAsClientBanner } from './ViewAsClientBanner';
import { MobileBottomNav } from './MobileBottomNav';

import { ForcePasswordChange } from '@/components/auth/ForcePasswordChange';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { NotificationPopupModal } from '@/components/notifications/NotificationPopupModal';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, loading } = useAuth();
  const { forcePasswordChange, isLoading: roleLoading } = useUserRole();
  const navigate = useNavigate();

  // Auto-register current session + heartbeat
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const ensureSession = async () => {
      let sessionUuid = localStorage.getItem('session_uuid');
      if (!sessionUuid) {
        sessionUuid = crypto.randomUUID();
        localStorage.setItem('session_uuid', sessionUuid);
      }
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (profileError) {
        console.error('[active_sessions] erro ao buscar profile', profileError);
        return;
      }
      if (cancelled) return;
      if (!profile?.company_id) {
        console.warn('[active_sessions] profile sem company_id', { userId: user.id });
        return;
      }

      const { error: upsertError } = await supabase
        .from('active_sessions')
        .upsert(
          {
            user_id: user.id,
            session_uuid: sessionUuid,
            metadata: { device_info: navigator.userAgent },
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'session_uuid', ignoreDuplicates: false }
        );
      if (upsertError) {
        console.error('[active_sessions:upsert] falhou', upsertError, {
          user_id: user.id,
          session_uuid: sessionUuid,
        });
        return;
      }
      console.info('[active_sessions:registered]', sessionUuid);

      heartbeat = setInterval(async () => {
        const { error: hbError } = await supabase
          .from('active_sessions')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('session_uuid', sessionUuid!);
        if (hbError) {
          console.error('[active_sessions:heartbeat] falhou', hbError);
        }
      }, 60_000);
    };

    ensureSession();
    return () => {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
    };
  }, [user]);

  // Realtime session revocation listener
  useEffect(() => {
    const sessionUuid = localStorage.getItem('session_uuid');
    if (!user || !sessionUuid) return;

    const channel = supabase
      .channel('session-control')
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'active_sessions',
          filter: `session_uuid=eq.${sessionUuid}`,
        },
        async () => {
          localStorage.removeItem('session_uuid');
          await supabase.auth.signOut();
          window.location.href = '/auth?reason=session_revoked';
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, navigate]);

  if (loading || (user && roleLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (forcePasswordChange) {
    return <ForcePasswordChange />;
  }

  return (
    <SidebarProvider>
      <NotificationPopupModal />
      {/*
        No desktop o shell tem altura fixa e quem rola é o conteúdo — é isso que
        faz o header `sticky` realmente fixar. Antes o `overflow-x-hidden` do
        wrapper virava contexto de rolagem e o header subia junto com a página.
        No mobile segue rolando a página inteira.
      */}
      <div className="min-h-screen md:h-svh flex w-full max-w-[100vw] overflow-x-hidden md:overflow-hidden">
        <AppSidebar />
        <SidebarInset className="flex-1 min-w-0 md:h-svh md:overflow-y-auto md:overflow-x-hidden">
          <DevEnvironmentBanner />
          <ViewAsClientBanner />
          <AppHeader />
          {/* pb extra no mobile: a bottom nav é fixa e cobriria o fim da página */}
          <main className="min-w-0 max-w-full flex-1 p-3 pb-24 sm:p-4 sm:pb-24 md:p-6 md:pb-6 lg:p-8 lg:pb-8">
            {children}
          </main>
        </SidebarInset>
        <MobileBottomNav />
      </div>
    </SidebarProvider>
  );
}
