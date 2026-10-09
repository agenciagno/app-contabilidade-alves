import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { invocarSerpro } from '@/lib/invocarSerpro';
import { fetchAllPages } from '@/lib/fetch-all';
import { STATUS_MONITORADO } from '@/hooks/useSerproCaixaPostal';
import { recarregarTarefasFiscais } from '@/lib/tarefasConcluidas';

/** `transmitida` = há recibo guardado (o servidor só grava a declaração como transmitida quando o PDF do recibo foi guardado). */
export interface DctfwebRow { id: string; contact_id: string; competencia: string; status: 'transmitida' | 'sem_declaracao'; consultado_em: string }
export interface MitRow { id: string; contact_id: string; periodo: string; id_apuracao: number; situacao: number | null; data_encerramento: string | null; evento_especial: boolean; valor_total: number | null }
export interface MitConsultaRow { contact_id: string; ano: number; consultado_em: string; apuracoes: number }
/** Sensor E0301 (rotina diária, grátis): a Receita atualizou a DCTFWeb do cliente (eSocial/Reinf recebido ou declaração transmitida). */
export interface SensorDctfwebRow { contact_id: string; evento_ultima_data: string | null; mudou_em: string | null; ultima_consulta_em: string | null; sem_procuracao: boolean }

export interface LinhaDctfwebMit {
  contact_id: string;
  nome: string;
  documento: string;
  regime: string | null;
  /** Filial: as declarações são da matriz, então a consulta é bloqueada. */
  filial: boolean;
  /** DCTFWeb da competência (null = ainda não consultada). */
  dctfweb: DctfwebRow | null;
  /** Apurações da MIT do período. `mitConsultado` = o ano inteiro já foi consultado para este cliente. */
  mit: MitRow[];
  mitConsultado: MitConsultaRow | null;
  /** Sensor E0301: a Receita mexeu na DCTFWeb depois da última consulta da equipe. Não diz se foi eSocial/Reinf ou transmissão. */
  novo: boolean;
  /** Data (AAAA-MM-DD) da última atualização da DCTFWeb informada pela Receita, quando houver. */
  movimentoEm: string | null;
  /** Sensor E0301 voltou "x": sem procuração para a DCTFWeb. */
  semProcuracao: boolean;
}

const CNPJS_DA_CA = new Set(['26764962000100', '08801596000130']);
const digitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');
/** A MIT só aparece aqui como "encerrada" com situação 3 (a documentação não traz a tabela de situações). */
export const SITUACAO_MIT_ENCERRADA = 3;

export const apuracaoVigente = (l: LinhaDctfwebMit): MitRow | null =>
  [...l.mit].sort((a, b) => (b.data_encerramento ?? '').localeCompare(a.data_encerramento ?? ''))[0] ?? null;

export type EstadoDctfweb = 'filial' | 'nao_consultado' | 'transmitida' | 'sem_declaracao';
export function estadoDctfweb(l: LinhaDctfwebMit): EstadoDctfweb {
  if (l.filial) return 'filial';
  return l.dctfweb ? l.dctfweb.status : 'nao_consultado';
}
export type EstadoMit = 'filial' | 'nao_consultado' | 'encerrada' | 'outra_situacao' | 'sem_apuracao';
export function estadoMit(l: LinhaDctfwebMit): EstadoMit {
  if (l.filial) return 'filial';
  if (!l.mitConsultado) return 'nao_consultado';
  const a = apuracaoVigente(l);
  if (!a) return 'sem_apuracao';
  return a.situacao === SITUACAO_MIT_ENCERRADA && a.data_encerramento ? 'encerrada' : 'outra_situacao';
}

export function useMatrizDctfwebMit(competencia: string) {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['serpro-dctfweb-matriz', company?.id, competencia],
    enabled: !!company?.id,
    queryFn: async (): Promise<LinhaDctfwebMit[]> => {
      const companyId = company!.id;
      const ano = Number(competencia.slice(0, 4));
      const contatos = await fetchAllPages<{ id: string; name: string | null; razao_social: string | null; display_name: string | null; document: string | null; tax_regime: string | null }>(
        () => supabase.from('contacts').select('id, name, razao_social, display_name, document, tax_regime')
          .eq('company_id', companyId).eq('status_cliente', STATUS_MONITORADO).eq('is_active', true).in('tax_regime', ['lucro_presumido', 'lucro_real']).order('name').order('id'));
      // Colunas explícitas: o caminho do recibo nunca sai do servidor.
      const dctf = await fetchAllPages<DctfwebRow>(
        () => supabase.from('serpro_dctfweb').select('id, contact_id, competencia, status, consultado_em').eq('company_id', companyId).eq('competencia', `${competencia}-01`).order('id'));
      const mit = await fetchAllPages<MitRow>(
        () => supabase.from('serpro_mit_apuracoes').select('id, contact_id, periodo, id_apuracao, situacao, data_encerramento, evento_especial, valor_total').eq('company_id', companyId).eq('periodo', `${competencia}-01`).order('id'));
      const consultas = await fetchAllPages<MitConsultaRow>(
        () => supabase.from('serpro_mit_consultas').select('contact_id, ano, consultado_em, apuracoes').eq('company_id', companyId).eq('ano', ano).order('contact_id'));
      const sensor = await fetchAllPages<SensorDctfwebRow>(
        () => supabase.from('serpro_dctfweb_sensor').select('contact_id, evento_ultima_data, mudou_em, ultima_consulta_em, sem_procuracao').eq('company_id', companyId).order('contact_id'));

      const sPor = new Map(sensor.map((x) => [x.contact_id, x]));
      const dPor = new Map(dctf.map((d) => [d.contact_id, d]));
      const cPor = new Map(consultas.map((c) => [c.contact_id, c]));
      const mPor = new Map<string, MitRow[]>();
      for (const m of mit) { const a = mPor.get(m.contact_id) ?? []; a.push(m); mPor.set(m.contact_id, a); }

      return contatos
        .filter((c) => { const d = digitos(c.document); return d.length === 14 && !CNPJS_DA_CA.has(d); })
        .map((c): LinhaDctfwebMit => {
          const sn = sPor.get(c.id);
          return {
            contact_id: c.id,
            nome: c.razao_social || c.name || 'Cliente',
            documento: c.document ?? '',
            regime: c.tax_regime ?? null,
            filial: digitos(c.document).slice(8, 12) !== '0001',
            dctfweb: dPor.get(c.id) ?? null,
            mit: mPor.get(c.id) ?? [],
            mitConsultado: cPor.get(c.id) ?? null,
            novo: !!sn?.mudou_em && (!sn.ultima_consulta_em || Date.parse(sn.mudou_em) > Date.parse(sn.ultima_consulta_em)),
            movimentoEm: sn?.evento_ultima_data ?? null,
            semProcuracao: !!sn?.sem_procuracao,
          };
        });
    },
  });
}

// ---------------------------------------------------------------- ações (edge function serpro-dctfweb)
export interface ResultadoDctfweb {
  ok: boolean;
  recente?: boolean;
  semProcuracao?: boolean;
  foraDoMonitoramento?: boolean;
  filial?: boolean;
  error?: string;
  dctfweb?: { ok: boolean; erro?: string; status?: 'transmitida' | 'sem_declaracao' };
  mit?: { ok: boolean; erro?: string; apuracoes?: number; semProcuracao?: boolean };
  tarefas_concluidas?: number;
  url?: string;
}

function useInvalidar() {
  const qc = useQueryClient();
  return (tarefasConcluidas?: number) => {
    qc.invalidateQueries({ queryKey: ['serpro-dctfweb-matriz'] });
    qc.invalidateQueries({ queryKey: ['serpro-consumo'] });
    recarregarTarefasFiscais(qc, tarefasConcluidas);
  };
}

export function useConsultarDctfwebMit() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (v: { contactId: string; competencia: string; force?: boolean }) =>
      invocarSerpro<ResultadoDctfweb>('serpro-dctfweb', { action: 'consultar', contact_id: v.contactId, competencia: v.competencia, force: v.force }),
    onSuccess: (d) => invalidar(d?.tarefas_concluidas),
  });
}

export function useLinkReciboDctfweb() {
  return useMutation({
    mutationFn: (v: { id: string }) => invocarSerpro<ResultadoDctfweb>('serpro-dctfweb', { action: 'link', id: v.id }),
  });
}
