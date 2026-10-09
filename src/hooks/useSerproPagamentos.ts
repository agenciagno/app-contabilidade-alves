import { recarregarTarefasFiscais } from '@/lib/tarefasConcluidas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { invocarSerpro } from '@/lib/invocarSerpro';
import { STATUS_MONITORADO } from '@/hooks/useSerproCaixaPostal';

export type TipoDoc = 'DARF' | 'DAS' | 'DAE' | 'DJE' | 'OUTRO';
export const TIPOS_DOC: TipoDoc[] = ['DARF', 'DAS', 'DAE', 'DJE'];

export interface Desmembramento {
  sequencial?: string;
  receitaPrincipal?: { codigo?: string; descricao?: string | null } | null;
  valorTotal?: number | null;
  valorPrincipal?: number | null;
  valorMulta?: number | null;
  valorJuros?: number | null;
}

export interface PagamentoRow {
  id: string;
  contact_id: string;
  chave: string;
  numero_documento: string;
  tipo_codigo: string | null;
  tipo_sigla: TipoDoc;
  tipo_descricao: string | null;
  periodo_apuracao: string | null;
  data_arrecadacao: string | null;
  data_vencimento: string | null;
  receita_codigo: string | null;
  receita_descricao: string | null;
  valor_total: number | null;
  valor_principal: number | null;
  valor_multa: number | null;
  valor_juros: number | null;
  valor_saldo_total: number | null;
  desmembramentos: Desmembramento[] | null;
  comprovante_path: string | null;
  comprovante_emitido_em: string | null;
  visivel_portal: boolean;
}

export interface LinhaPagamentos {
  contact_id: string;
  nome: string;
  documento: string;
  regime: string | null;
  /** Consulta deste mês (null = ainda não consultado: diferente de "0 pagamentos"). */
  consultadoEm: string | null;
  docs: PagamentoRow[];
  contagem: Record<TipoDoc, number>;
  /** Mesmo número de documento pago mais de uma vez no mês. */
  duplicidade: boolean;
  /** Pagamento com saldo não utilizado (possível crédito). */
  saldo: boolean;
  /** Sensor E0701: a Receita mexeu nos pagamentos depois da última consulta. */
  novo: boolean;
  /** Sensor E0701 voltou "x": sem procuração para pagamentos. */
  semProcuracao: boolean;
}

const CNPJS_DA_CA = new Set(['26764962000100', '08801596000130']);
const digitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

// ---------------------------------------------------------------- competência (AAAA-MM)
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function mesDeData(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
/** Mês de apuração "em aberto": o anterior ao de hoje (o DAS de agosto se paga em setembro). */
export function competenciaPadrao(hoje = new Date()): string {
  return mesDeData(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1));
}
export function deslocarCompetencia(c: string, meses: number): string {
  const [a, m] = c.split('-').map(Number);
  return mesDeData(new Date(a, m - 1 + meses, 1));
}
export function rotuloCompetencia(c: string): string {
  const [a, m] = c.split('-').map(Number);
  return `${MESES[m - 1]} ${a}`;
}
export function siglaCompetencia(c: string): string {
  const [a, m] = c.split('-');
  return `${m}/${a}`;
}

// ---------------------------------------------------------------- leitura (RLS: equipe da empresa)
async function lerTodos<T>(pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await pagina(de, de + 999);
    if (error) throw error;
    linhas.push(...(data ?? []));
    if (!data || data.length < 1000) break; // PostgREST corta em 1000 linhas por página
  }
  return linhas;
}

export function useMatrizPagamentos(competencia: string) {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['serpro-pag-matriz', company?.id, competencia],
    enabled: !!company?.id,
    queryFn: async (): Promise<LinhaPagamentos[]> => {
      const inicio = `${competencia}-01`;
      const fim = `${deslocarCompetencia(competencia, 1)}-01`;
      const companyId = company!.id;

      const contatos = await lerTodos((de, ate) => supabase.from('contacts')
        .select('id, name, razao_social, display_name, document, tax_regime')
        .eq('company_id', companyId).eq('status_cliente', STATUS_MONITORADO).eq('is_active', true)
        .order('name').range(de, ate));
      const consultas = await lerTodos((de, ate) => supabase.from('serpro_pagamentos_consultas')
        .select('contact_id, consultado_em').eq('company_id', companyId).eq('competencia', inicio).range(de, ate));
      const pagamentos = await lerTodos((de, ate) => supabase.from('serpro_pagamentos')
        .select('*').eq('company_id', companyId).gte('periodo_apuracao', inicio).lt('periodo_apuracao', fim)
        .order('data_arrecadacao', { ascending: false }).range(de, ate));
      const sensor = await lerTodos((de, ate) => supabase.from('serpro_pagamentos_sensor')
        .select('contact_id, mudou_em, ultima_consulta_em, sem_procuracao').eq('company_id', companyId).range(de, ate));

      const consultaPor = new Map(consultas.map((c) => [c.contact_id, c.consultado_em]));
      const sensorPor = new Map(sensor.map((s) => [s.contact_id, s]));
      const docsPor = new Map<string, PagamentoRow[]>();
      for (const p of pagamentos as unknown as PagamentoRow[]) {
        const lista = docsPor.get(p.contact_id) ?? [];
        lista.push(p);
        docsPor.set(p.contact_id, lista);
      }

      return contatos
        .filter((c) => {
          const d = digitos(c.document);
          return d.length === 14 && !CNPJS_DA_CA.has(d);
        })
        .map((c): LinhaPagamentos => {
          const docs = docsPor.get(c.id) ?? [];
          const contagem: Record<TipoDoc, number> = { DARF: 0, DAS: 0, DAE: 0, DJE: 0, OUTRO: 0 };
          const porNumero = new Map<string, number>();
          for (const d of docs) {
            contagem[d.tipo_sigla]++;
            porNumero.set(d.numero_documento, (porNumero.get(d.numero_documento) ?? 0) + 1);
          }
          const s = sensorPor.get(c.id);
          const novo = !!s?.mudou_em && (!s.ultima_consulta_em || Date.parse(s.mudou_em) > Date.parse(s.ultima_consulta_em));
          return {
            contact_id: c.id,
            nome: c.razao_social || c.name || 'Cliente',
            documento: c.document ?? '',
            regime: c.tax_regime ?? null,
            consultadoEm: consultaPor.get(c.id) ?? null,
            docs,
            contagem,
            duplicidade: [...porNumero.values()].some((n) => n > 1),
            saldo: docs.some((d) => (d.valor_saldo_total ?? 0) > 0),
            novo,
            semProcuracao: !!s?.sem_procuracao,
          };
        });
    },
  });
}

/** Tudo o que está salvo de um cliente (qualquer mês), mais recente primeiro. */
export function usePagamentosCliente(contactId: string | null) {
  return useQuery({
    queryKey: ['serpro-pag-cliente', contactId],
    enabled: !!contactId,
    queryFn: async (): Promise<PagamentoRow[]> => {
      const dados = await lerTodos((de, ate) => supabase.from('serpro_pagamentos')
        .select('*').eq('contact_id', contactId!)
        .order('periodo_apuracao', { ascending: false }).order('data_arrecadacao', { ascending: false }).range(de, ate));
      return dados as unknown as PagamentoRow[];
    },
  });
}

// ---------------------------------------------------------------- ações (edge function serpro-pagamentos)
export interface FiltrosPagamentos {
  numeroDocumentoLista?: string[];
  codigoReceitaLista?: string[];
  codigoTipoDocumentoLista?: string[];
  dataInicial?: string;
  dataFinal?: string;
  valorInicial?: number;
  valorFinal?: number;
}

export interface ResultadoConsultaPag {
  ok: boolean;
  recente?: boolean;
  semProcuracao?: boolean;
  foraDoMonitoramento?: boolean;
  error?: string;
  documentos?: number;
  do_mes?: number;
  novos?: number;
  tarefas_concluidas?: number;
}

function useInvalidarPagamentos() {
  const qc = useQueryClient();
  return (contactId?: string, tarefasConcluidas?: number) => {
    qc.invalidateQueries({ queryKey: ['serpro-pag-matriz'] });
    qc.invalidateQueries({ queryKey: ['serpro-consumo'] });
    if (contactId) qc.invalidateQueries({ queryKey: ['serpro-pag-cliente', contactId] });
    recarregarTarefasFiscais(qc, tarefasConcluidas);
  };
}

/** Consulta os pagamentos de UM cliente num mês (ou busca avançada, com filtros). `force` ignora o aviso de "consultado há pouco". */
export function useConsultarPagamentos() {
  const invalidar = useInvalidarPagamentos();
  return useMutation({
    mutationFn: (v: { contactId: string; competencia: string; force?: boolean; filtros?: FiltrosPagamentos }) =>
      invocarSerpro<ResultadoConsultaPag>('serpro-pagamentos', {
        action: 'consultar', contact_id: v.contactId, competencia: v.competencia, force: v.force, filtros: v.filtros,
      }),
    onSuccess: (d, v) => invalidar(v.contactId, d?.tarefas_concluidas),
  });
}

/** Emite (1ª vez) ou reabre o comprovante em PDF; devolve um link de 10 minutos. */
export function useComprovantePagamento() {
  const invalidar = useInvalidarPagamentos();
  return useMutation({
    mutationFn: (v: { pagamentoId: string; contactId: string }) =>
      invocarSerpro<{ ok: boolean; url?: string; jaEmitido?: boolean; error?: string; semProcuracao?: boolean }>('serpro-pagamentos', {
        action: 'comprovante', pagamento_id: v.pagamentoId,
      }),
    onSuccess: (_d, v) => invalidar(v.contactId),
  });
}

export function usePublicarPagamento() {
  const invalidar = useInvalidarPagamentos();
  return useMutation({
    mutationFn: (v: { pagamentoId: string; contactId: string; visivel: boolean }) =>
      invocarSerpro<{ ok?: boolean; error?: string }>('serpro-pagamentos', {
        action: 'publicar', pagamento_id: v.pagamentoId, visivel_portal: v.visivel,
      }),
    onSuccess: (_d, v) => invalidar(v.contactId),
  });
}
