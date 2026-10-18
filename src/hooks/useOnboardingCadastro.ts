import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Assistente de cadastro de novo cliente (17/10/2026). As etapas são as próprias sub-abas do Super Perfil, na ordem do cadastro;
 * o progresso fica em `onboarding_steps` (uma linha por etapa e por cliente). Etapa pulada fica pendente para depois.
 */
export const ETAPAS_CADASTRO = [
  { etapa: 'cadastro', rotulo: 'Cadastro', ajuda: 'Dados gerais, endereço e contatos.' },
  { etapa: 'societario', rotulo: 'Societário', ajuda: 'Sócios da empresa.' },
  { etapa: 'fiscal', rotulo: 'Fiscal', ajuda: 'Regime, inscrições, CNAE e guias que a CA envia.' },
  { etapa: 'operacional', rotulo: 'Responsáveis e datas', ajuda: 'Responsáveis por setor, início do contrato e tarefas.' },
  { etapa: 'financeiro', rotulo: 'Cobrança', ajuda: 'Honorário, vencimento e canal do boleto. Opcional: dá para pular.' },
  { etapa: 'link', rotulo: 'Documentos', ajuda: 'Gere o link com a lista de documentos e mande para o cliente pelo WhatsApp.' },
] as const;

export type EtapaCadastro = typeof ETAPAS_CADASTRO[number]['etapa'];
export type FluxoCadastro = 'cnpj_existente' | 'abertura';
export type StatusEtapa = 'pendente' | 'concluido' | 'pulado';

interface LinhaEtapa { etapa: string; status: string; fluxo: string }

const chave = (contactId?: string) => ['onboarding-cadastro', contactId];

export function useOnboardingCadastro(contactId?: string) {
  const queryClient = useQueryClient();

  const { data: linhas = [], isLoading } = useQuery({
    queryKey: chave(contactId),
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_steps')
        .select('etapa, status, fluxo')
        .eq('contact_id', contactId!);
      if (error) throw error;
      return (data ?? []) as LinhaEtapa[];
    },
  });

  const marcar = useMutation({
    mutationFn: async ({ etapa, status }: { etapa: EtapaCadastro; status: StatusEtapa }) => {
      const { error } = await supabase
        .from('onboarding_steps')
        .update({
          status,
          data_conclusao: status === 'concluido' ? new Date().toISOString().slice(0, 10) : null,
        })
        .eq('contact_id', contactId!)
        .eq('etapa', etapa);
      if (error) throw error;
    },
    // Prefixo inteiro: atualiza também o filtro "Cadastro em andamento" da lista.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['onboarding-cadastro'] }),
  });

  const statusDe = (etapa: string): StatusEtapa | null => {
    const s = linhas.find(l => l.etapa === etapa)?.status;
    return s === 'concluido' || s === 'pulado' || s === 'pendente' ? s : null;
  };
  const etapasDoCliente = ETAPAS_CADASTRO.filter(e => linhas.some(l => l.etapa === e.etapa));
  const concluidas = etapasDoCliente.filter(e => statusDe(e.etapa) === 'concluido').length;

  return {
    isLoading,
    /** Cliente cadastrado pelo assistente (tem linhas). Cadastros antigos não têm e não mostram nada. */
    temOnboarding: etapasDoCliente.length > 0,
    total: etapasDoCliente.length,
    concluidas,
    completo: etapasDoCliente.length > 0 && concluidas === etapasDoCliente.length,
    fluxo: (linhas[0]?.fluxo ?? null) as FluxoCadastro | null,
    statusDe,
    /** Primeira etapa ainda não concluída (pendente ou pulada), para "Continuar cadastro". */
    proximaEtapa: etapasDoCliente.find(e => statusDe(e.etapa) !== 'concluido')?.etapa ?? null,
    marcar,
  };
}

/** Cria as linhas do assistente para um cliente recém-cadastrado. Repetir não duplica (índice único contato + etapa). */
export async function iniciarOnboardingCadastro(companyId: string, contactId: string, fluxo: FluxoCadastro) {
  const { error } = await supabase.from('onboarding_steps').upsert(
    ETAPAS_CADASTRO.map((e, i) => ({
      company_id: companyId,
      contact_id: contactId,
      fluxo,
      etapa: e.etapa,
      ordem: i + 1,
      status: 'pendente',
      data_inicio: new Date().toISOString().slice(0, 10),
    })),
    { onConflict: 'contact_id,etapa', ignoreDuplicates: true },
  );
  if (error) throw error;
}

const NENHUM = new Set<string>();

/** Clientes com o cadastro do assistente ainda incompleto (alguma etapa pendente ou pulada), para o filtro da lista de Contatos. */
export function useContatosComCadastroPendente() {
  const { data } = useQuery({
    queryKey: ['onboarding-cadastro', 'pendentes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_steps')
        .select('contact_id')
        .neq('status', 'concluido');
      if (error) throw error;
      return new Set((data ?? []).map(l => l.contact_id as string));
    },
  });
  return data ?? NENHUM;
}
