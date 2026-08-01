import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { FALLBACK_CBS, FALLBACK_IBS } from '@/lib/rt/tabelas';

export interface RtAliquotas {
  /** Em %, como a API devolve (8.4 = 8,4%). */
  cbs: number;
  ibs: number;
  fonte: 'api_oficial' | 'teto_legal';
  aviso: string;
  consultadoEm?: string;
}

const FALLBACK: RtAliquotas = {
  cbs: FALLBACK_CBS * 100,
  ibs: FALLBACK_IBS * 100,
  fonte: 'teto_legal',
  aviso:
    'Não foi possível consultar a API oficial. Usando o teto legal de 26,5% da LC 214/2025 como cenário.',
};

/**
 * Alíquotas de referência CBS/IBS. Nunca fica travado esperando o piloto da Receita:
 * qualquer falha cai no teto legal, que é o número que está em lei.
 */
export function useRtAliquotas(data = '2027-01-01') {
  const query = useQuery({
    queryKey: ['rt-aliquotas', data],
    staleTime: 6 * 60 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<RtAliquotas> => {
      const { data: res, error } = await supabase.functions.invoke('rt-aliquotas', {
        body: { data },
      });
      if (error || !res) return FALLBACK;
      return res as RtAliquotas;
    },
  });

  return { aliquotas: query.data ?? FALLBACK, ...query };
}
