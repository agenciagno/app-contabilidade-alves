import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { differenceInCalendarDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { fetchAllPages } from '@/lib/fetch-all';

/**
 * Processos (14/10/2026): pedidos de abertura, alteração, baixa etc. do Legalização (tabelas `processos`, `processo_opcoes`,
 * `processo_eventos`). Substitui a planilha "TAREFAS COMERCIAL". As tabelas são novas e ainda não estão nos tipos gerados.
 */

export type TipoOpcao = 'status' | 'servico' | 'orgao';
export type PapelStatus = 'inicial' | 'aguardando_cliente' | 'concluido' | 'cancelado';

export interface ProcessoOpcao {
  id: string;
  tipo: TipoOpcao;
  nome: string;
  /** Só nos 4 status fixos. Status criado pela equipe = em andamento. */
  papel: PapelStatus | null;
  ordem: number;
}

export interface ProcessoRow {
  id: string;
  company_id: string;
  contact_id: string | null;
  nome_avulso: string | null;
  whatsapp_avulso: string | null;
  data_solicitacao: string;
  servico_id: string;
  orgao_id: string | null;
  status_id: string;
  protocolo: string | null;
  observacao: string | null;
  responsavel_id: string | null;
  status_desde: string;
  concluido_em: string | null;
  created_at: string;
  contacts: {
    name: string; razao_social: string | null; display_name: string | null; document: string | null;
    email: string | null; whatsapp: string | null; phone: string | null; status_cliente: string | null;
  } | null;
}

export interface ProcessoEvento {
  id: string;
  tipo: 'status' | 'mensagem';
  status_id: string | null;
  canal: 'email' | 'whatsapp' | 'copiar' | null;
  destino: string | null;
  mensagem: string | null;
  autor_id: string | null;
  created_at: string;
}

/** Linha vermelha passa deste número de dias desde a solicitação (pedido de Gabriel, 14/10/2026). */
export const DIAS_ATRASO = 30;

export function nomeCliente(p: Pick<ProcessoRow, 'contacts' | 'nome_avulso'>): string {
  return p.contacts?.razao_social || p.contacts?.display_name || p.contacts?.name || p.nome_avulso || 'Cliente';
}

export interface SituacaoProcesso {
  dias: number;
  papel: PapelStatus | null;
  finalizado: boolean;
  aguardandoCliente: boolean;
  /** Vermelho: não concluído, mais de 30 dias e sem estar aguardando o cliente (assim o card "Atrasados" = linhas vermelhas). */
  atrasado: boolean;
  /** Laranja prevalece sobre vermelho: com o cliente parado, a pendência é dele (decisão de Gabriel, 14/10/2026). */
  cor: 'laranja' | 'vermelho' | null;
}

export function situacaoProcesso(p: Pick<ProcessoRow, 'data_solicitacao' | 'status_id'>, opcoes: Map<string, ProcessoOpcao>, hoje = new Date()): SituacaoProcesso {
  const papel = opcoes.get(p.status_id)?.papel ?? null;
  const dias = differenceInCalendarDays(hoje, new Date(`${p.data_solicitacao}T00:00:00`));
  const finalizado = papel === 'concluido' || papel === 'cancelado';
  const aguardandoCliente = papel === 'aguardando_cliente';
  const atrasado = !finalizado && !aguardandoCliente && dias > DIAS_ATRASO;
  return { dias, papel, finalizado, aguardandoCliente, atrasado, cor: aguardandoCliente ? 'laranja' : atrasado ? 'vermelho' : null };
}

export function useProcessoOpcoes() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['processo-opcoes', company?.id],
    enabled: !!company?.id,
    queryFn: async (): Promise<ProcessoOpcao[]> => {
      const { data, error } = await (supabase as any)
        .from('processo_opcoes')
        .select('id, tipo, nome, papel, ordem')
        .eq('company_id', company!.id)
        .order('ordem', { ascending: true })
        .order('nome', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProcessoOpcao[];
    },
  });
}

export function useCriarProcessoOpcao() {
  const qc = useQueryClient();
  const { company } = useCompany();
  return useMutation({
    mutationFn: async (vars: { tipo: TipoOpcao; nome: string }): Promise<ProcessoOpcao> => {
      if (!company?.id) throw new Error('Empresa não encontrada.');
      const { data, error } = await (supabase as any)
        .from('processo_opcoes')
        .insert({ company_id: company.id, tipo: vars.tipo, nome: vars.nome.trim() })
        .select('id, tipo, nome, papel, ordem')
        .single();
      if (error) {
        if (error.code === '23505') throw new Error('Esse item já existe na lista.');
        if (error.code === '23514') throw new Error('Use entre 2 e 60 letras no nome.');
        if (error.code === '42501') throw new Error('Você não tem permissão para criar itens.');
        throw error;
      }
      return data as ProcessoOpcao;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processo-opcoes'] }),
  });
}

export function useProcessos() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['processos', company?.id],
    enabled: !!company?.id,
    queryFn: () => fetchAllPages<ProcessoRow>(() => (supabase as any)
      .from('processos')
      .select('*, contacts:contact_id (name, razao_social, display_name, document, email, whatsapp, phone, status_cliente)')
      .eq('company_id', company!.id)
      .order('data_solicitacao', { ascending: true })
      .order('id', { ascending: true })),
  });
}

/** Clientes para o campo Cliente (ativos, suspensos e inaptos). */
export function useClientesParaProcesso() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['processo-clientes', company?.id],
    enabled: !!company?.id,
    queryFn: () => fetchAllPages<{ id: string; name: string; razao_social: string | null; display_name: string | null; document: string | null }>(
      () => supabase
        .from('contacts')
        .select('id, name, razao_social, display_name, document')
        .eq('company_id', company!.id)
        .eq('is_active', true)
        .order('name', { ascending: true })
        .order('id', { ascending: true }),
    ),
  });
}

export interface SalvarProcessoInput {
  id?: string;
  contact_id: string | null;
  nome_avulso: string | null;
  whatsapp_avulso: string | null;
  data_solicitacao: string;
  servico_id: string;
  orgao_id: string | null;
  status_id: string;
  protocolo: string | null;
  observacao: string | null;
  responsavel_id: string | null;
}

export function useSalvarProcesso() {
  const qc = useQueryClient();
  const { company } = useCompany();
  return useMutation({
    mutationFn: async (input: SalvarProcessoInput) => {
      if (!company?.id) throw new Error('Empresa não encontrada.');
      const { id, ...campos } = input;
      const q = id
        ? (supabase as any).from('processos').update(campos).eq('id', id)
        : (supabase as any).from('processos').insert({ ...campos, company_id: company.id });
      const { error } = await q;
      if (error) {
        if (error.code === '42501') throw new Error('Você não tem permissão para gravar processos.');
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['processos'] });
      qc.invalidateQueries({ queryKey: ['processo-eventos'] });
    },
  });
}

/** Troca só o status (menu da linha). O trigger grava o histórico e a data de conclusão. */
export function useTrocarStatusProcesso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; status_id: string }) => {
      const { error } = await (supabase as any).from('processos').update({ status_id: vars.status_id }).eq('id', vars.id);
      if (error) {
        if (error.code === '42501') throw new Error('Você não tem permissão para gravar processos.');
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['processos'] });
      qc.invalidateQueries({ queryKey: ['processo-eventos'] });
    },
  });
}

export function useExcluirProcesso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase as any).from('processos').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Só administrador pode excluir processo.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processos'] }),
  });
}

export function useProcessoEventos(processoId: string | undefined) {
  return useQuery({
    queryKey: ['processo-eventos', processoId],
    enabled: !!processoId,
    queryFn: async (): Promise<ProcessoEvento[]> => {
      const { data, error } = await (supabase as any)
        .from('processo_eventos')
        .select('id, tipo, status_id, canal, destino, mensagem, autor_id, created_at')
        .eq('processo_id', processoId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProcessoEvento[];
    },
  });
}

/** Anota no histórico do processo a mensagem enviada ao cliente (o autor o banco preenche). */
export function useRegistrarMensagemProcesso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { processo: Pick<ProcessoRow, 'id' | 'company_id'>; canal: 'email' | 'whatsapp' | 'copiar'; destino: string | null; mensagem: string }) => {
      const { error } = await (supabase as any).from('processo_eventos').insert({
        company_id: vars.processo.company_id, processo_id: vars.processo.id, tipo: 'mensagem',
        canal: vars.canal, destino: vars.destino, mensagem: vars.mensagem,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['processo-eventos', vars.processo.id] }),
  });
}
