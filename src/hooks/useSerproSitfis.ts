import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { invocarSerpro } from '@/lib/invocarSerpro';
import { fetchAllPages } from '@/lib/fetch-all';
import { STATUS_MONITORADO } from '@/hooks/useSerproCaixaPostal';

export interface SitfisRow {
  id: string;
  contact_id: string;
  solicitado_em: string;
  status: 'aguardando' | 'pronto' | 'erro';
  gerado_em: string | null;
  pdf_path: string | null;
  resultado: 'sem_pendencias' | 'com_pendencias' | 'nao_lido' | null;
  categorias: string[];
  certidao_tipo: string | null;
  certidao_emissao: string | null;
  certidao_validade: string | null;
  confiavel: boolean;
  avisos: string[];
}

export interface LinhaSitfis {
  contact_id: string;
  nome: string;
  documento: string;
  regime: string | null;
  /** Filial: o relatório é da matriz, então a consulta é bloqueada. */
  filial: boolean;
  /** Último relatório pronto. */
  ultimo: SitfisRow | null;
  /** Pedido feito há pouco que a Receita ainda não terminou (o próximo clique só repete a busca do PDF). */
  processando: boolean;
}

/** Relatório com mais de 30 dias já não diz muito sobre a situação de hoje. */
export const DIAS_RELATORIO_VELHO = 30;
const PROTOCOLO_VALE_MIN = 10;

const CNPJS_DA_CA = new Set(['26764962000100', '08801596000130']);
const digitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

export type EstadoSitfis = 'filial' | 'sem_relatorio' | 'sem_pendencias' | 'com_pendencias' | 'a_conferir';
export function estadoSitfis(l: LinhaSitfis): EstadoSitfis {
  if (l.filial) return 'filial';
  const u = l.ultimo;
  if (!u) return 'sem_relatorio';
  // Leitura incerta (título não reconhecido, só uma área limpa...): nunca afirma "sem pendências" nem "com pendências".
  if (!u.confiavel || u.resultado === 'nao_lido' || !u.resultado) return 'a_conferir';
  return u.resultado;
}

export const relatorioVelho = (l: LinhaSitfis, hoje = new Date()) =>
  !!l.ultimo?.gerado_em && (hoje.getTime() - Date.parse(l.ultimo.gerado_em)) / 86_400_000 > DIAS_RELATORIO_VELHO;

export function useMatrizSitfis() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['serpro-sitfis-matriz', company?.id],
    enabled: !!company?.id,
    queryFn: async (): Promise<LinhaSitfis[]> => {
      const companyId = company!.id;
      const contatos = await fetchAllPages<{ id: string; name: string | null; display_name: string | null; document: string | null; tax_regime: string | null }>(
        () => supabase.from('contacts').select('id, name, display_name, document, tax_regime')
          .eq('company_id', companyId).eq('status_cliente', STATUS_MONITORADO).eq('is_active', true).order('name').order('id'));
      // Colunas explícitas: o protocolo da solicitação nunca vai para a tela.
      const relatorios = await fetchAllPages<SitfisRow>(
        () => supabase.from('serpro_sitfis')
          .select('id, contact_id, solicitado_em, status, gerado_em, pdf_path, resultado, categorias, certidao_tipo, certidao_emissao, certidao_validade, confiavel, avisos')
          .eq('company_id', companyId).in('status', ['pronto', 'aguardando']).order('solicitado_em', { ascending: false }).order('id'));

      const ultimo = new Map<string, SitfisRow>();
      const processando = new Set<string>();
      for (const r of relatorios) {
        if (r.status === 'pronto') {
          const cur = ultimo.get(r.contact_id);
          if (!cur || (r.gerado_em ?? '') > (cur.gerado_em ?? '')) ultimo.set(r.contact_id, r);
        } else if (Date.now() - Date.parse(r.solicitado_em) < PROTOCOLO_VALE_MIN * 60_000) {
          processando.add(r.contact_id);
        }
      }
      return contatos
        .filter((c) => { const d = digitos(c.document); return d.length === 14 && !CNPJS_DA_CA.has(d); })
        .map((c): LinhaSitfis => ({
          contact_id: c.id,
          nome: c.display_name || c.name || 'Cliente',
          documento: c.document ?? '',
          regime: c.tax_regime ?? null,
          filial: digitos(c.document).slice(8, 12) !== '0001',
          ultimo: ultimo.get(c.id) ?? null,
          processando: processando.has(c.id),
        }));
    },
  });
}

// ---------------------------------------------------------------- ações (edge function serpro-sitfis)
export interface ResultadoSitfis {
  ok: boolean;
  recente?: boolean;
  /** A Receita ainda prepara o relatório (cobrado igual): esperar `aguarde` segundos e clicar de novo. */
  processando?: boolean;
  aguarde?: number;
  semProcuracao?: boolean;
  foraDoMonitoramento?: boolean;
  filial?: boolean;
  error?: string;
  id?: string;
  resultado?: 'sem_pendencias' | 'com_pendencias' | 'nao_lido';
  confiavel?: boolean;
  avisos?: string[];
  url?: string;
}

function useInvalidarSitfis() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['serpro-sitfis-matriz'] });
    qc.invalidateQueries({ queryKey: ['serpro-consumo'] });
  };
}

export function useGerarSitfis() {
  const invalidar = useInvalidarSitfis();
  return useMutation({
    mutationFn: (v: { contactId: string; force?: boolean }) =>
      invocarSerpro<ResultadoSitfis>('serpro-sitfis', { action: 'gerar', contact_id: v.contactId, force: v.force }),
    onSuccess: () => invalidar(),
  });
}

export function useLinkSitfis() {
  return useMutation({
    mutationFn: (v: { id: string }) => invocarSerpro<ResultadoSitfis>('serpro-sitfis', { action: 'link', id: v.id }),
  });
}
