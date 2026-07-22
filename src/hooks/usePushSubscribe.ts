import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveCompany } from '@/contexts/CompanyContext';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

/**
 * Estados possíveis do opt-in de push:
 * - unsupported: navegador sem service worker / Push API.
 * - ios-needs-install: iPhone/iPad no Safari fora do modo "app instalado".
 *   No iOS o push só existe depois de "Adicionar à Tela de Início" (iOS 16.4+).
 * - denied: usuário bloqueou notificações no navegador.
 * - default: pode ativar.
 * - subscribed: já ativado neste dispositivo.
 */
export type PushState =
  | 'loading'
  | 'unsupported'
  | 'ios-needs-install'
  | 'denied'
  | 'default'
  | 'subscribed';

function isIos() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ se identifica como Mac com toque
    (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)
  );
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function usePushSubscribe() {
  const { ownCompanyId } = useActiveCompany();
  const [state, setState] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  const evaluate = useCallback(async () => {
    if (!supported) {
      // iOS fora do modo instalado não expõe PushManager — orientar instalação.
      if (typeof window !== 'undefined' && isIos() && !isStandalone()) {
        setState('ios-needs-install');
      } else {
        setState('unsupported');
      }
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      setState(existing ? 'subscribed' : 'default');
    } catch {
      setState('default');
    }
  }, [supported]);

  useEffect(() => {
    evaluate();
  }, [evaluate]);

  const subscribe = useCallback(async () => {
    if (!supported || !VAPID_PUBLIC_KEY) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'default');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;

      const json = sub.toJSON();
      const platform = isIos() ? 'ios' : /android/i.test(navigator.userAgent) ? 'android' : 'web';

      const { error } = await supabase.from('push_tokens').upsert(
        {
          user_id: userId,
          company_id: ownCompanyId ?? null,
          endpoint: sub.endpoint,
          subscription: json as any,
          platform,
          user_agent: navigator.userAgent.slice(0, 300),
          last_used_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' },
      );
      if (error) throw error;
      setState('subscribed');
    } catch (e) {
      console.error('Falha ao ativar notificações:', e);
      await evaluate();
    } finally {
      setBusy(false);
    }
  }, [supported, ownCompanyId, evaluate]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.from('push_tokens').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      setState('default');
    } catch (e) {
      console.error('Falha ao desativar notificações:', e);
    } finally {
      setBusy(false);
    }
  }, [supported]);

  return { state, busy, subscribe, unsubscribe, configured: !!VAPID_PUBLIC_KEY };
}
