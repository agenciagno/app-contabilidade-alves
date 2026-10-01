import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BadgeTone } from '@/components/ds';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useProfile } from '@/hooks/useProfile';
import { fetchAllPages } from '@/lib/fetch-all';
import type { Ausencia } from '@/lib/situacaoCarteira';

/**
 * Acompanhamento de cada declaração em falta: nota, situação e responsável. É só anotação: não muda a contagem de
 * "em falta" (a declaração some da lista quando aparece na próxima leitura do Serpro).
 */
export type SituacaoAcomp = 'a_tratar' | 'cliente_avisado' | 'aguardando_cliente' | 'em_andamento' | 'transmitida';

/** `rotulo` aparece na lista de escolha; `curto` na tabela. */
export const SITUACOES_ACOMP: { valor: SituacaoAcomp; rotulo: string; curto: string; tom: BadgeTone }[] = [
  { valor: 'a_tratar', rotulo: 'A tratar', curto: 'A tratar', tom: 'neutral' },
  { valor: 'cliente_avisado', rotulo: 'Cliente avisado', curto: 'Cliente avisado', tom: 'info' },
  { valor: 'aguardando_cliente', rotulo: 'Aguardando cliente', curto: 'Aguardando cliente', tom: 'warn' },
  { valor: 'em_andamento', rotulo: 'Em andamento', curto: 'Em andamento', tom: 'info' },
  { valor: 'transmitida', rotulo: 'Transmitida (confirmar na próxima leitura)', curto: 'Transmitida', tom: 'ok' },
];

export interface Acompanhamento {
  contact_id: string;
  obrigacao: Ausencia['obrigacao'];
  competencia: string;
  situacao: SituacaoAcomp;
  nota: string | null;
  responsavel_id: string | null;
  atualizado_em: string;
  atualizado_por: string | null;
}

export const chaveAcomp = (contactId: string, obrigacao: string, competencia: string) => `${contactId}|${obrigacao}|${competencia}`;

export function useAcompanhamentos() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['ausencia-acompanhamentos', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const linhas = await fetchAllPages<Acompanhamento>(() => supabase.from('ausencia_acompanhamento')
        .select('contact_id, obrigacao, competencia, situacao, nota, responsavel_id, atualizado_em, atualizado_por')
        .eq('company_id', company!.id).order('id'));
      return new Map(linhas.map((a) => [chaveAcomp(a.contact_id, a.obrigacao, a.competencia), a] as const));
    },
  });
}

export interface SalvarAcompanhamento {
  contactId: string;
  obrigacao: Ausencia['obrigacao'];
  competencia: string;
  situacao: SituacaoAcomp;
  nota: string;
  responsavelId: string | null;
}

export function useSalvarAcompanhamento() {
  const qc = useQueryClient();
  const { company } = useCompany();
  const { profile } = useProfile();
  return useMutation({
    mutationFn: async (v: SalvarAcompanhamento) => {
      const { error } = await supabase.from('ausencia_acompanhamento').upsert({
        company_id: company!.id, contact_id: v.contactId, obrigacao: v.obrigacao, competencia: v.competencia,
        situacao: v.situacao, nota: v.nota.trim() || null, responsavel_id: v.responsavelId,
        atualizado_em: new Date().toISOString(), atualizado_por: profile?.id ?? null,
      }, { onConflict: 'company_id,contact_id,obrigacao,competencia' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ausencia-acompanhamentos'] }),
  });
}
