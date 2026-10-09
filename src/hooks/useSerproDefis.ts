import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { invocarSerpro } from '@/lib/invocarSerpro';
import { fetchAllPages } from '@/lib/fetch-all';
import { STATUS_MONITORADO } from '@/hooks/useSerproCaixaPostal';
import { proximoDiaUtil } from '@/lib/prazosFederais';

export interface DefisRow {
  id: string;
  contact_id: string;
  ano_calendario: number;
  id_defis: string;
  /** 1 original normal · 2 retificadora normal · 3 original de situação especial · 4 retificadora de situação especial */
  tipo: 1 | 2 | 3 | 4;
  transmitida_em: string | null;
  recibo_path: string | null;
  declaracao_path: string | null;
  visivel_portal: boolean;
}

export interface LinhaDefis {
  contact_id: string;
  nome: string;
  documento: string;
  /** Filial: a DEFIS é da matriz, então a consulta é bloqueada. */
  filial: boolean;
  /** Ano de abertura do CNPJ (se cadastrado): empresa aberta depois do ano-calendário não tem DEFIS daquele ano. */
  anoAbertura: number | null;
  /** Null = índice ainda não consultado (diferente de "sem DEFIS"). A consulta traz TODAS as DEFIS do cliente. */
  consultadoEm: string | null;
  declaracoes: DefisRow[];
}

export const TIPO_DEFIS: Record<number, string> = {
  1: 'Original', 2: 'Retificadora', 3: 'Original (situação especial)', 4: 'Retificadora (situação especial)',
};

const CNPJS_DA_CA = new Set(['26764962000100', '08801596000130']);
const digitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

/** Prazo da DEFIS do ano-calendário: 31 de março do ano seguinte; fim de semana ou feriado nacional passa ao próximo dia útil (até 23:59). */
export const prazoDefis = (ano: number) => {
  const [a, m, d] = proximoDiaUtil(`${ano + 1}-03-31`).split('-').map(Number);
  return new Date(a, m - 1, d, 23, 59, 59);
};

export function defisDoAno(l: LinhaDefis, ano: number): DefisRow | null {
  const doAno = l.declaracoes.filter((d) => d.ano_calendario === ano);
  if (!doAno.length) return null;
  return [...doAno].sort((a, b) => (b.transmitida_em ?? '').localeCompare(a.transmitida_em ?? ''))[0];
}

export type StatusDefis = 'filial' | 'nao_se_aplica' | 'nao_consultado' | 'entregue' | 'retificada' | 'a_entregar' | 'em_atraso';
export function statusDefis(l: LinhaDefis, ano: number, hoje = new Date()): StatusDefis {
  if (l.filial) return 'filial';
  if (l.anoAbertura !== null && l.anoAbertura > ano) return 'nao_se_aplica';
  if (!l.consultadoEm) return 'nao_consultado';
  const d = defisDoAno(l, ano);
  if (d) return d.tipo === 2 || d.tipo === 4 ? 'retificada' : 'entregue';
  return hoje > prazoDefis(ano) ? 'em_atraso' : 'a_entregar';
}

export function useMatrizDefis() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['serpro-defis-matriz', company?.id],
    enabled: !!company?.id,
    queryFn: async (): Promise<LinhaDefis[]> => {
      const companyId = company!.id;
      const contatos = await fetchAllPages<{ id: string; name: string | null; razao_social: string | null; display_name: string | null; document: string | null; data_abertura_receita: string | null; data_abertura_rf: string | null }>(
        () => supabase.from('contacts').select('id, name, razao_social, display_name, document, data_abertura_receita, data_abertura_rf')
          .eq('company_id', companyId).eq('status_cliente', STATUS_MONITORADO).eq('is_active', true).eq('tax_regime', 'simples_nacional').order('name').order('id'));
      const consultas = await fetchAllPages<{ contact_id: string; consultado_em: string }>(
        () => supabase.from('serpro_defis_consultas').select('contact_id, consultado_em').eq('company_id', companyId).order('contact_id'));
      const declaracoes = await fetchAllPages<DefisRow>(
        () => supabase.from('serpro_defis').select('*').eq('company_id', companyId).order('ano_calendario').order('id'));

      const consultaPor = new Map(consultas.map((c) => [c.contact_id, c.consultado_em]));
      const declPor = new Map<string, DefisRow[]>();
      for (const d of declaracoes) { const a = declPor.get(d.contact_id) ?? []; a.push(d); declPor.set(d.contact_id, a); }

      return contatos
        .filter((c) => { const d = digitos(c.document); return d.length === 14 && !CNPJS_DA_CA.has(d); })
        .map((c): LinhaDefis => {
          const abertura = c.data_abertura_receita || c.data_abertura_rf;
          const ano = abertura ? Number(String(abertura).slice(0, 4)) : NaN;
          return {
            contact_id: c.id,
            nome: c.razao_social || c.name || 'Cliente',
            documento: c.document ?? '',
            filial: digitos(c.document).slice(8, 12) !== '0001',
            anoAbertura: Number.isInteger(ano) && ano > 1900 ? ano : null,
            consultadoEm: consultaPor.get(c.id) ?? null,
            declaracoes: declPor.get(c.id) ?? [],
          };
        });
    },
  });
}

// ---------------------------------------------------------------- ações (edge function serpro-defis)
export interface ResultadoDefis {
  ok: boolean;
  recente?: boolean;
  semProcuracao?: boolean;
  foraDoMonitoramento?: boolean;
  filial?: boolean;
  error?: string;
  declaracoes?: number;
  novas?: number;
  sem_declaracao?: boolean;
  jaBaixado?: boolean;
  url?: string;
}

function useInvalidarDefis() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['serpro-defis-matriz'] });
    qc.invalidateQueries({ queryKey: ['serpro-consumo'] });
  };
}

export function useConsultarDefis() {
  const invalidar = useInvalidarDefis();
  return useMutation({
    mutationFn: (v: { contactId: string; force?: boolean }) =>
      invocarSerpro<ResultadoDefis>('serpro-defis', { action: 'consultar', contact_id: v.contactId, force: v.force }),
    onSuccess: () => invalidar(),
  });
}

export function useDocumentosDefis() {
  const invalidar = useInvalidarDefis();
  return useMutation({
    mutationFn: (v: { contactId: string; ano: number }) =>
      invocarSerpro<ResultadoDefis>('serpro-defis', { action: 'documentos', contact_id: v.contactId, ano: v.ano }),
    onSuccess: () => invalidar(),
  });
}

export function useLinkDefis() {
  return useMutation({
    mutationFn: (v: { tipo: 'declaracao' | 'recibo'; id: string }) =>
      invocarSerpro<ResultadoDefis>('serpro-defis', { action: 'link', tipo: v.tipo, id: v.id }),
  });
}
