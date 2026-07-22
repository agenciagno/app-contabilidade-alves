import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ClientCompany {
  id: string;
  name: string;
  cnpj: string | null;
}

type Mode = 'interno' | 'clientes';

interface CompanyContextType {
  /** Empresa do usuário logado (a CA). Alvo fixo das telas internas e das notificações. */
  ownCompanyId: string | undefined;
  /** 'clientes' quando a rota está sob /clientes/*, senão 'interno'. */
  mode: Mode;
  isClientMode: boolean;
  /** Empresa-cliente selecionada na seção "Financeiro dos Clientes". */
  selectedClient: ClientCompany | null;
  /**
   * Empresa cujos dados as telas do Financeiro devem ler/gravar:
   * a CA no modo interno, o cliente selecionado no modo clientes.
   * `undefined` enquanto carrega ou quando está em /clientes sem cliente escolhido.
   */
  activeCompanyId: string | undefined;
  /** Sessão de suporte (crachá de visita) ativa para o cliente selecionado. */
  supportSessionActive: boolean;
  selectClient: (client: ClientCompany) => void;
  clearClient: () => void;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

const STORAGE_KEY = 'ca_selected_client';
// Sessão de suporte expira em 30min no banco; renovamos a cada 20min enquanto navega.
const RENEW_MS = 20 * 60 * 1000;

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const mode: Mode = location.pathname.startsWith('/clientes') ? 'clientes' : 'interno';

  const { data: ownCompanyId } = useQuery({
    queryKey: ['own-company-id', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return (data?.company_id as string) ?? null;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const [selectedClient, setSelectedClient] = useState<ClientCompany | null>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as ClientCompany) : null;
    } catch {
      return null;
    }
  });

  const sessionIdRef = useRef<string | null>(null);
  const [supportSessionActive, setSupportSessionActive] = useState(false);

  const openSession = useCallback(async (companyId: string) => {
    try {
      const { data, error } = await supabase.rpc('start_support_session', {
        _target_company_id: companyId,
        _motivo: 'Operação Financeiro dos Clientes (BPO)',
      });
      if (error) throw error;
      sessionIdRef.current = (data as unknown as string) ?? null;
      setSupportSessionActive(!!sessionIdRef.current);
    } catch (e) {
      console.error('Falha ao abrir sessão de suporte:', e);
      sessionIdRef.current = null;
      setSupportSessionActive(false);
    }
  }, []);

  const closeSession = useCallback(async () => {
    const id = sessionIdRef.current;
    sessionIdRef.current = null;
    setSupportSessionActive(false);
    if (id) {
      try {
        await supabase.rpc('end_support_session', { _session_id: id });
      } catch (e) {
        console.error('Falha ao encerrar sessão de suporte:', e);
      }
    }
  }, []);

  // Abre o crachá ao entrar em /clientes com um cliente selecionado; fecha ao sair.
  useEffect(() => {
    const target = selectedClient?.id;
    if (mode === 'clientes' && target) {
      if (!sessionIdRef.current) openSession(target);
      const iv = setInterval(() => {
        if (selectedClient?.id) openSession(selectedClient.id);
      }, RENEW_MS);
      const onFocus = () => {
        if (selectedClient?.id && !sessionIdRef.current) openSession(selectedClient.id);
      };
      window.addEventListener('focus', onFocus);
      return () => {
        clearInterval(iv);
        window.removeEventListener('focus', onFocus);
      };
    }
    if (sessionIdRef.current) closeSession();
  }, [mode, selectedClient, openSession, closeSession]);

  // Garante encerramento ao desmontar o app (logout / fechar aba controlada).
  useEffect(() => {
    return () => {
      if (sessionIdRef.current) closeSession();
    };
  }, [closeSession]);

  const selectClient = useCallback((client: ClientCompany) => {
    setSelectedClient(client);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(client));
    } catch {
      /* ignore */
    }
  }, []);

  const clearClient = useCallback(() => {
    setSelectedClient(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    closeSession();
  }, [closeSession]);

  const activeCompanyId =
    mode === 'clientes' ? selectedClient?.id : ownCompanyId ?? undefined;

  return (
    <CompanyContext.Provider
      value={{
        ownCompanyId: ownCompanyId ?? undefined,
        mode,
        isClientMode: mode === 'clientes',
        selectedClient,
        activeCompanyId,
        supportSessionActive,
        selectClient,
        clearClient,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useActiveCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) {
    throw new Error('useActiveCompany must be used within a CompanyProvider');
  }
  return ctx;
}
