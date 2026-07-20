import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface SicoobSaldo {
  saldo: number;
  saldoLimite: number;
  saldoBloqueado: number;
}

// Campos observados no swagger da API Conta Corrente (LancamentoSpuOpenBankingRestDTO).
export interface SicoobLancamento {
  transactionId: string;
  tipo: string;
  valor: number;
  data: string;
  dataMovimento?: string;
  descricao: string;
  numeroDocumento?: string;
  cpfCnpj?: string;
  descricaoComplementar?: string;
}

export interface SicoobExtrato {
  saldoAtual?: number;
  saldoBloqueado?: number;
  saldoLimite?: number;
  transacoes: SicoobLancamento[];
}

// Boleto local reduzido, só os campos usados pra cruzar com o extrato (Comparativo).
export interface BoletoParaMatch {
  id: string;
  nosso_numero: string | null;
  valor: number | null;
  status: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  contact_name: string;
}

async function invoke<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('sicoob-boletos', { body: { action, ...body } });
  if (error) throw new Error(error.message || `Falha na ação ${action}`);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

// mes: 1-12
export function useSicoobConciliacao(mes: number, ano: number) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const saldoQuery = useQuery({
    queryKey: ['sicoob-saldo'],
    queryFn: () => invoke<SicoobSaldo>('saldo'),
    staleTime: 1000 * 60,
    retry: false,
  });

  const extratoQuery = useQuery({
    queryKey: ['sicoob-extrato', mes, ano],
    queryFn: () => invoke<SicoobExtrato>('extrato', { mes, ano }),
    staleTime: 1000 * 60,
    retry: false,
  });

  // Boletos com nosso_numero (todos, sem filtro de período) — base pro cruzamento do Comparativo.
  // Tabela é pequena (algumas centenas de linhas); não vale a pena filtrar por mês aqui e correr
  // risco de perder boleto pago fora do mês de vencimento.
  const boletosQuery = useQuery({
    queryKey: ['boleto-controls-para-match'],
    queryFn: async (): Promise<BoletoParaMatch[]> => {
      const { data, error } = await (supabase as any)
        .from('boleto_controls')
        .select('id, nosso_numero, valor, status, data_vencimento, data_pagamento, contacts:contact_id ( name )')
        .not('nosso_numero', 'is', null);
      if (error) throw error;
      return (data || []).map((b: any) => ({
        id: b.id,
        nosso_numero: b.nosso_numero,
        valor: b.valor,
        status: b.status,
        data_vencimento: b.data_vencimento,
        data_pagamento: b.data_pagamento,
        contact_name: b.contacts?.name ?? '—',
      }));
    },
    staleTime: 1000 * 30,
  });

  // Confirma a baixa de um boleto a partir de um lançamento do extrato já conferido pelo usuário
  // (ação humana explícita — nunca automática). Mesmo padrão de update de useBoletoControls.
  const confirmarBaixa = useMutation({
    mutationFn: async (params: { boletoId: string; dataPagamento: string; valorPago: number }) => {
      const { error } = await (supabase as any)
        .from('boleto_controls')
        .update({
          status: 'PAGO',
          data_pagamento: params.dataPagamento,
          valor_pago: params.valorPago,
          origem_baixa: 'conciliacao_manual',
        })
        .eq('id', params.boletoId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boleto-controls-v2'] });
      toast({ title: 'Baixa confirmada' });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao confirmar baixa', description: e.message, variant: 'destructive' });
    },
  });

  return {
    saldo: saldoQuery.data ?? null,
    saldoLoading: saldoQuery.isLoading,
    saldoError: saldoQuery.error as Error | null,
    extrato: extratoQuery.data ?? null,
    extratoLoading: extratoQuery.isLoading,
    extratoError: extratoQuery.error as Error | null,
    refetchExtrato: extratoQuery.refetch,
    boletos: boletosQuery.data ?? [],
    boletosLoading: boletosQuery.isLoading,
    confirmarBaixa,
  };
}
