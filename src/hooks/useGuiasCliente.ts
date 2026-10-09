/**
 * Rodada 5 do Monitoramento (09/10/2026): guias mensais que a CA gera e manda ao cliente.
 * - Quem recebe: `contacts.recebe_das_ca` e `contacts.recebe_guia_dctfweb_ca` (marcados no cadastro ou na lista).
 * - Guia da DCTFWeb: `serpro-dctfweb` ações `gerar_guia` (Emitir, cobrado) e `link_guia`; tabela `serpro_dctfweb_guias`.
 * - Envio com conferência: sai pelo `client-enviar` (e-mail do cadastro) com `origem` = guia_das | guia_dctfweb e
 *   `referencia` = { processo, competencia, id }, que é como a tela sabe o que já foi enviado.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { invocarSerpro } from '@/lib/invocarSerpro';
import { fetchAllPages } from '@/lib/fetch-all';

export type ProcessoGuia = 'das' | 'dctfweb' | 'parcela' | 'das_mei';
export const ORIGEM_ENVIO: Record<ProcessoGuia, string> = { das: 'guia_das', dctfweb: 'guia_dctfweb', parcela: 'guia_parcela', das_mei: 'guia_das_mei' };

export interface MarcacaoGuia { das: boolean; dctfweb: boolean; email: string | null }

/** Marcações e e-mail de todos os clientes da empresa (uma leitura só, usada pelas duas listas). */
export function useMarcacoesGuia() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['guias-marcacoes', company?.id],
    enabled: !!company?.id,
    queryFn: async (): Promise<Map<string, MarcacaoGuia>> => {
      const rows = await fetchAllPages<{ id: string; recebe_das_ca: boolean; recebe_guia_dctfweb_ca: boolean; email: string | null }>(
        () => supabase.from('contacts').select('id, recebe_das_ca, recebe_guia_dctfweb_ca, email').eq('company_id', company!.id).order('id'));
      return new Map(rows.map((r) => [r.id, { das: !!r.recebe_das_ca, dctfweb: !!r.recebe_guia_dctfweb_ca, email: r.email?.trim() || null }]));
    },
  });
}

export function useMarcarGuia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { contactIds: string[]; processo: ProcessoGuia; valor: boolean }) => {
      const coluna = v.processo === 'das' ? 'recebe_das_ca' : 'recebe_guia_dctfweb_ca';
      const { error } = await supabase.from('contacts').update({ [coluna]: v.valor }).in('id', v.contactIds);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guias-marcacoes'] });
      qc.invalidateQueries({ queryKey: ['super-perfil'] });
    },
  });
}

// ---------------------------------------------------------------- guia da DCTFWeb
export interface GuiaDctfweb { id: string; contact_id: string; competencia: string; data_pagamento: string | null; emitido_em: string }

/** Guia mais recente de cada cliente na competência (AAAA-MM). */
export function useGuiasDctfweb(competencia: string) {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['dctfweb-guias', company?.id, competencia],
    enabled: !!company?.id,
    queryFn: async (): Promise<Map<string, GuiaDctfweb>> => {
      const rows = await fetchAllPages<GuiaDctfweb>(
        () => supabase.from('serpro_dctfweb_guias').select('id, contact_id, competencia, data_pagamento, emitido_em')
          .eq('company_id', company!.id).eq('competencia', `${competencia}-01`).order('emitido_em', { ascending: false }).order('id'));
      const m = new Map<string, GuiaDctfweb>();
      for (const r of rows) if (!m.has(r.contact_id)) m.set(r.contact_id, r);
      return m;
    },
  });
}

export interface ResultadoGuia { ok: boolean; jaGerado?: boolean; url?: string; id?: string; error?: string; semProcuracao?: boolean; filial?: boolean; foraDoMonitoramento?: boolean }

export function useGerarGuiaDctfweb() {
  const qc = useQueryClient();
  return useMutation({
    /** `andamento`: guia da declaração ainda em andamento (GERARGUIAANDAMENTO313). */
    mutationFn: (v: { contactId: string; competencia: string; dataPagamento?: string; novo?: boolean; andamento?: boolean }) =>
      invocarSerpro<ResultadoGuia>('serpro-dctfweb', {
        action: 'gerar_guia', contact_id: v.contactId, competencia: v.competencia, confirmar_emissao: true, andamento: v.andamento,
        ...(v.dataPagamento ? { data_pagamento: v.dataPagamento, novo: true } : {}), ...(v.novo ? { novo: true } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dctfweb-guias'] });
      qc.invalidateQueries({ queryKey: ['serpro-consumo'] });
    },
  });
}

/** Declaração completa (PDF) ou XML da DCTFWeb: consulta uma vez e guarda; depois abre sem consultar. */
export function useDeclaracaoDctfweb() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { contactId: string; competencia: string; formato: 'pdf' | 'xml' }) =>
      invocarSerpro<ResultadoGuia>('serpro-dctfweb', { action: 'declaracao', contact_id: v.contactId, competencia: v.competencia, formato: v.formato }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['serpro-consumo'] }); },
  });
}

export function useLinkGuiaDctfweb() {
  return useMutation({
    mutationFn: (v: { id: string }) => invocarSerpro<{ ok: boolean; url?: string; error?: string }>('serpro-dctfweb', { action: 'link_guia', id: v.id }),
  });
}

// ---------------------------------------------------------------- envios já feitos
/** Ids das guias (DAS ou DCTFWeb) da competência que já foram enviadas ao cliente por e-mail pela lista de conferência. */
export function useGuiasEnviadas(processo: ProcessoGuia, competencia: string) {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['guias-enviadas', company?.id, processo, competencia],
    enabled: !!company?.id,
    queryFn: async (): Promise<Map<string, string>> => {
      const rows = await fetchAllPages<{ referencia: { id?: string } | null; enviado_em: string }>(
        () => supabase.from('client_envios').select('referencia, enviado_em')
          .eq('company_id', company!.id).eq('origem', ORIGEM_ENVIO[processo]).eq('referencia->>competencia', competencia)
          .order('enviado_em', { ascending: false }).order('id'));
      const m = new Map<string, string>();
      for (const r of rows) if (r.referencia?.id && !m.has(r.referencia.id)) m.set(r.referencia.id, r.enviado_em);
      return m;
    },
  });
}

// ---------------------------------------------------------------- baixar em lote (ZIP do que já está guardado; não chama o Serpro)
export interface ResultadoZip { ok: boolean; url?: string; arquivos?: number; clientes?: number; semDocumento?: number; falhas?: number; error?: string }

export function useBaixarZip() {
  return useMutation({
    mutationFn: (v: { contactIds: string[]; tipos: string[]; competencia?: string; ano?: number }) =>
      invocarSerpro<ResultadoZip>('client-enviar', { action: 'zip', contact_ids: v.contactIds, tipos: v.tipos, competencia: v.competencia, ano: v.ano }),
  });
}
