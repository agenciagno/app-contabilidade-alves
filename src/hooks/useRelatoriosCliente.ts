import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useProfile } from '@/hooks/useProfile';
import { invocarSerpro } from '@/lib/invocarSerpro';
import { fetchAllPages } from '@/lib/fetch-all';

/** Contador que assina o Relatório de Faturamento e se o modelo foi validado. Sem validação o relatório só sai como rascunho (e não vai ao cliente). */
export interface RelatorioConfig {
  contador_nome: string;
  contador_crc: string;
  contador_cpf: string;
  faturamento_validado: boolean;
  validado_em: string | null;
}

export function useRelatorioConfig() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['relatorio-config', company?.id],
    enabled: !!company?.id,
    queryFn: async (): Promise<RelatorioConfig> => {
      const { data, error } = await supabase.from('relatorio_config').select('contador_nome, contador_crc, contador_cpf, faturamento_validado, validado_em').eq('company_id', company!.id).maybeSingle();
      if (error) throw error;
      return {
        contador_nome: data?.contador_nome ?? '', contador_crc: data?.contador_crc ?? '', contador_cpf: data?.contador_cpf ?? '',
        faturamento_validado: data?.faturamento_validado ?? false, validado_em: data?.validado_em ?? null,
      };
    },
  });
}

/** Só administrador grava (a regra está no banco). Mudar nome, CRC ou CPF derruba a validação sozinha (gatilho). */
export function useSalvarRelatorioConfig() {
  const qc = useQueryClient();
  const { company } = useCompany();
  const { profile } = useProfile();
  return useMutation({
    mutationFn: async (v: { contador?: { nome: string; crc: string; cpf: string }; validado?: boolean }) => {
      const base = { company_id: company!.id };
      if (v.contador) {
        const { error } = await supabase.from('relatorio_config').upsert({
          ...base, contador_nome: v.contador.nome.trim() || null, contador_crc: v.contador.crc.trim() || null, contador_cpf: v.contador.cpf.trim() || null,
        }, { onConflict: 'company_id' });
        if (error) throw error;
      }
      if (v.validado !== undefined) {
        const { error } = await supabase.from('relatorio_config').update({
          faturamento_validado: v.validado, validado_por: v.validado ? profile?.id ?? null : null, validado_em: v.validado ? new Date().toISOString() : null,
        }).eq('company_id', company!.id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['relatorio-config'] }),
  });
}

export interface RelatorioGuardado { ok: boolean; id: string; tipo: 'relatorio_situacao' | 'relatorio_faturamento' }

/** Guarda o PDF gerado na tela para ele poder ir ao cliente como link com validade (mesmo envio dos outros documentos). */
export function useGuardarRelatorio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { contactId: string; tipo: 'situacao' | 'faturamento'; periodo?: string; pdfBase64: string; resumo?: Record<string, unknown> }) =>
      invocarSerpro<RelatorioGuardado>('client-enviar', { action: 'guardar_relatorio', contact_id: v.contactId, tipo: v.tipo, periodo: v.periodo, pdf_base64: v.pdfBase64, resumo: v.resumo }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ['envio-documentos', v.contactId] });
      qc.invalidateQueries({ queryKey: ['relatorios-ultimos'] });
    },
  });
}

/** Último Relatório Completo guardado de cada cliente (tipo `situacao`) e o último envio dele, para a tela Relatórios. */
export interface UltimoRelatorio { id: string; geradoEm: string; enviadoEm: string | null }

export function useUltimosRelatorios() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['relatorios-ultimos', company?.id],
    enabled: !!company?.id,
    queryFn: async (): Promise<Map<string, UltimoRelatorio>> => {
      const [rel, env] = await Promise.all([
        fetchAllPages<{ id: string; contact_id: string; gerado_em: string }>(() => supabase.from('client_relatorios')
          .select('id, contact_id, gerado_em').eq('company_id', company!.id).eq('tipo', 'situacao').order('gerado_em', { ascending: false }).order('id')),
        fetchAllPages<{ contact_id: string; enviado_em: string }>(() => supabase.from('client_envios')
          .select('contact_id, enviado_em').eq('company_id', company!.id).contains('documentos', [{ tipo: 'relatorio_situacao' }])
          .order('enviado_em', { ascending: false }).order('id')),
      ]);
      const enviado = new Map<string, string>();
      for (const e of env) if (!enviado.has(e.contact_id)) enviado.set(e.contact_id, e.enviado_em);
      const m = new Map<string, UltimoRelatorio>();
      for (const r of rel) if (!m.has(r.contact_id)) m.set(r.contact_id, { id: r.id, geradoEm: r.gerado_em, enviadoEm: enviado.get(r.contact_id) ?? null });
      return m;
    },
  });
}
