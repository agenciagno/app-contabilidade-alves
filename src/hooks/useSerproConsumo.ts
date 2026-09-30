import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useProfile } from '@/hooks/useProfile';

export interface ChamadaSerpro {
  created_at: string;
  ambiente: 'trial' | 'producao';
  tipo_chamada: 'Apoiar' | 'Consultar' | 'Declarar' | 'Emitir' | 'Monitorar';
  id_sistema: string;
  id_servico: string;
  status_http: number | null;
  cobravel: boolean | null;
  acionado_por: string | null;
  origem: string;
}

export interface SerproConfig {
  alerta_gasto_mensal: number;
  volume_declarado_mes: number | null;
  /** Conclui sozinha a tarefa fiscal "DAS - Simples Nacional" quando a Receita mostra DAS pago ou declaração zerada. */
  auto_concluir_tarefas: boolean;
}

// Tabela de preços do contrato Serpro nº 599032 (Anexo I, 28/09/2026). Cada faixa: quantidade máxima na faixa e valor por requisição.
// Estimativa por faixas acumuladas (não confirmado se o Serpro cobra acumulado ou pelo total do mês): a ordem de grandeza não muda.
type Faixa = { ate: number; valor: number };
const FAIXAS: Record<'Consultar' | 'Emitir' | 'Declarar', Faixa[]> = {
  Consultar: [
    { ate: 300, valor: 0.24 }, { ate: 1000, valor: 0.21 }, { ate: 3000, valor: 0.18 }, { ate: 7000, valor: 0.16 },
    { ate: 15000, valor: 0.14 }, { ate: 23000, valor: 0.11 }, { ate: 30000, valor: 0.09 }, { ate: Infinity, valor: 0.06 },
  ],
  Emitir: [
    { ate: 500, valor: 0.32 }, { ate: 5000, valor: 0.29 }, { ate: 10000, valor: 0.26 }, { ate: 15000, valor: 0.22 },
    { ate: 25000, valor: 0.19 }, { ate: 35000, valor: 0.16 }, { ate: 50000, valor: 0.12 }, { ate: Infinity, valor: 0.08 },
  ],
  Declarar: [
    { ate: 100, valor: 0.4 }, { ate: 500, valor: 0.36 }, { ate: 1000, valor: 0.32 }, { ate: 3000, valor: 0.28 },
    { ate: 5000, valor: 0.24 }, { ate: 8000, valor: 0.2 }, { ate: 10000, valor: 0.16 }, { ate: Infinity, valor: 0.12 },
  ],
};

export function custoEstimado(tipo: 'Consultar' | 'Emitir' | 'Declarar', quantidade: number): number {
  let restante = quantidade;
  let anterior = 0;
  let total = 0;
  for (const f of FAIXAS[tipo]) {
    if (restante <= 0) break;
    const naFaixa = Math.min(restante, f.ate - anterior);
    total += naFaixa * f.valor;
    restante -= naFaixa;
    anterior = f.ate;
  }
  return total;
}

/** Ciclo de cobrança do Serpro: dia 21 do mês anterior ao dia 20 do mês de referência. */
export function cicloAtual(hoje = new Date()): { inicio: Date; fim: Date; rotulo: string } {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const inicio = hoje.getDate() >= 21 ? new Date(ano, mes, 21) : new Date(ano, mes - 1, 21);
  const fim = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 20, 23, 59, 59);
  const f = (d: Date) => d.toLocaleDateString('pt-BR');
  return { inicio, fim, rotulo: `${f(inicio)} a ${f(fim)}` };
}

export function useConsumoSerpro(enabled = true) {
  const ciclo = cicloAtual();
  return useQuery({
    queryKey: ['serpro-consumo', ciclo.inicio.toISOString()],
    enabled,
    queryFn: async (): Promise<ChamadaSerpro[]> => {
      const linhas: ChamadaSerpro[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase
          .from('serpro_call_log')
          .select('created_at, ambiente, tipo_chamada, id_sistema, id_servico, status_http, cobravel, acionado_por, origem')
          .gte('created_at', ciclo.inicio.toISOString())
          .order('created_at', { ascending: false })
          .range(de, de + 999);
        if (error) throw error;
        linhas.push(...((data ?? []) as unknown as ChamadaSerpro[]));
        if (!data || data.length < 1000) break; // PostgREST corta em 1000 linhas por página
      }
      return linhas;
    },
  });
}

export function useSerproConfig() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['serpro-config', company?.id],
    enabled: !!company?.id,
    queryFn: async (): Promise<SerproConfig> => {
      const { data, error } = await supabase.from('serpro_config').select('alerta_gasto_mensal, volume_declarado_mes, auto_concluir_tarefas').eq('company_id', company!.id).maybeSingle();
      if (error) throw error;
      return {
        alerta_gasto_mensal: Number(data?.alerta_gasto_mensal ?? 100),
        volume_declarado_mes: data?.volume_declarado_mes ?? null,
        auto_concluir_tarefas: data?.auto_concluir_tarefas ?? true,
      };
    },
  });
}

export function useSalvarSerproConfig() {
  const qc = useQueryClient();
  const { company } = useCompany();
  return useMutation({
    mutationFn: async (v: Partial<SerproConfig>) => {
      const { error } = await supabase.from('serpro_config').update(v).eq('company_id', company!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['serpro-config'] }),
  });
}

/** Valor da PRÓXIMA chamada cobrada: o da faixa em que ela cai, dado quantas já foram cobradas no ciclo (mesma estimativa de `custoEstimado`). */
export function precoProxima(tipo: 'Consultar' | 'Emitir', jaCobradas: number): number {
  const faixas = FAIXAS[tipo];
  for (const f of faixas) if (jaCobradas < f.ate) return f.valor;
  return faixas[faixas.length - 1].valor;
}

/**
 * Valores só para administrador e super administrador: para os demais, `preco()` devolve null e nenhuma tela mostra custo
 * (a consulta do consumo nem é feita). Os botões que geram cobrança no Serpro usam isto para mostrar quanto custa o clique.
 */
export function useCustoSerpro() {
  const { profile } = useProfile();
  const admin = profile?.is_super_admin === true || profile?.role === 'admin';
  const { data: chamadas } = useConsumoSerpro(admin);
  const cobradas = useMemo(() => {
    const n = { Consultar: 0, Emitir: 0 };
    for (const c of chamadas ?? []) {
      if (c.ambiente !== 'producao' || c.cobravel !== true) continue;
      if (c.tipo_chamada === 'Consultar') n.Consultar++;
      else if (c.tipo_chamada === 'Emitir') n.Emitir++;
    }
    return n;
  }, [chamadas]);
  return { admin, preco: (tipo: 'Consultar' | 'Emitir'): number | null => (admin ? precoProxima(tipo, cobradas[tipo]) : null) };
}
