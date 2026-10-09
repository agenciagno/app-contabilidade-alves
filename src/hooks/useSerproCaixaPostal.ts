import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { BadgeTone } from '@/components/ds';
import { invocarSerpro } from '@/lib/invocarSerpro';

/** Só cliente com este status entra na rotina e nas consultas ao Serpro (o servidor confere de novo a cada chamada). */
export const STATUS_MONITORADO = 'Ativo';

export type CategoriaMsg = 'intimacao' | 'malha' | 'exclusao_simples' | 'maed' | 'cobranca' | 'processo' | 'informativo';
export type SituacaoMsg = 'nova' | 'em_tratamento' | 'resolvida' | 'sem_acao';

export const CATEGORIAS: Record<CategoriaMsg, { label: string; tone: BadgeTone; critica: boolean }> = {
  intimacao: { label: 'Intimação / Termo', tone: 'danger', critica: true },
  malha: { label: 'Malha / Inconsistência', tone: 'danger', critica: true },
  exclusao_simples: { label: 'Exclusão do Simples', tone: 'danger', critica: true },
  maed: { label: 'Multa por atraso (MAED)', tone: 'warn', critica: true },
  cobranca: { label: 'Cobrança / Débito', tone: 'warn', critica: true },
  processo: { label: 'Processo', tone: 'info', critica: true },
  informativo: { label: 'Informativo', tone: 'neutral', critica: false },
};

export const SITUACOES: Record<SituacaoMsg, { label: string; tone: BadgeTone }> = {
  nova: { label: 'Nova', tone: 'warn' },
  em_tratamento: { label: 'Em tratamento', tone: 'info' },
  resolvida: { label: 'Resolvida', tone: 'ok' },
  sem_acao: { label: 'Sem ação', tone: 'neutral' },
};

export interface ClienteCaixa {
  contact_id: string;
  nome: string;
  documento: string;
  regime: string | null;
  status_cliente: string | null;
  procuracao: 'ativa' | 'ausente' | 'desconhecida';
  indicador: 0 | 1 | 2 | null;
  indicador_verificado_em: string | null;
  evento_ultima_data: string | null;
  consultado_em: string | null;
  consultado_por: string | null;
  mensagens_salvas: number;
  nao_lidas_salvas: number;
}

export interface MensagemCaixa {
  id: string;
  contact_id: string;
  isn: string;
  assunto: string;
  data_envio: string | null;
  lida: boolean;
  data_leitura: string | null;
  data_ciencia: string | null;
  data_validade: string | null;
  relevancia: number | null;
  tipo_origem: number | null;
  descricao_origem: string | null;
  categoria: CategoriaMsg;
  corpo: string | null;
  corpo_aberto_por: string | null;
  corpo_aberto_em: string | null;
  situacao: SituacaoMsg;
  responsavel_id: string | null;
  observacoes: string | null;
  visivel_portal: boolean;
  sincronizado_em: string;
}

export type MensagemComCliente = MensagemCaixa & {
  contacts: {
    name: string; display_name: string | null; razao_social: string | null; document: string | null; status_cliente: string | null;
    email: string | null; whatsapp: string | null; phone: string | null;
  } | null;
};

export type SeloEstado = 'inativo' | 'sem_procuracao' | 'nao_lida' | 'nova' | 'todas_lidas' | 'nao_verificada';

const dia = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

/**
 * Selo da linha (mesmo desenho do "Msg não lida / Todas lidas" da VERI).
 * Referência de "novidade" = a data mais recente entre a última consulta paga e a rodada do indicador grátis:
 * o evento E0601 só diz a data da última mensagem nova, então só conta como novidade o que veio DEPOIS dessa referência.
 */
export function seloCaixa(c: ClienteCaixa): { estado: SeloEstado; label: string; tone: BadgeTone } {
  if (c.status_cliente !== STATUS_MONITORADO) return { estado: 'inativo', label: c.status_cliente ?? 'Sem status', tone: 'neutral' };
  if (c.procuracao === 'ausente') return { estado: 'sem_procuracao', label: 'Sem procuração', tone: 'danger' };
  const ref = [dia(c.consultado_em), dia(c.indicador_verificado_em)].filter(Boolean).sort().pop() ?? null;
  const novidade = !!(c.evento_ultima_data && ref && c.evento_ultima_data > ref);
  if (c.consultado_em) {
    if (c.nao_lidas_salvas > 0) return { estado: 'nao_lida', label: 'Msg não lida', tone: 'warn' };
    if (novidade) return { estado: 'nova', label: 'Nova mensagem', tone: 'info' };
    return { estado: 'todas_lidas', label: 'Todas lidas', tone: 'ok' };
  }
  if (novidade) return { estado: 'nova', label: 'Nova mensagem', tone: 'info' };
  if (c.indicador === 1) return { estado: 'nao_lida', label: 'Msg não lida (1)', tone: 'warn' };
  if (c.indicador === 2) return { estado: 'nao_lida', label: 'Msg não lida (2+)', tone: 'warn' };
  if (c.indicador === 0) return { estado: 'todas_lidas', label: 'Todas lidas', tone: 'ok' };
  return { estado: 'nao_verificada', label: 'Não verificada', tone: 'neutral' };
}

export function limparCorpo(corpo: string): string {
  return corpo
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export function diasParaPrazo(dataValidade: string | null): number | null {
  if (!dataValidade) return null;
  const alvo = new Date(`${dataValidade}T00:00:00`).getTime();
  const hoje = new Date(new Date().toDateString()).getTime();
  return Math.round((alvo - hoje) / 86_400_000);
}

// ---------------------------------------------------------------- leituras (RLS: equipe da empresa)
export function useClientesCaixa(enabled = true) {
  return useQuery({
    queryKey: ['serpro-cp-clientes'],
    enabled,
    queryFn: async (): Promise<ClienteCaixa[]> => {
      const { data: resumo, error } = await supabase
        .from('serpro_caixa_postal_resumo')
        .select('*, contacts:contact_id (name, display_name, document, tax_regime, status_cliente)')
        .limit(1000);
      if (error) throw error;
      const { data: procs, error: e2 } = await supabase
        .from('serpro_procuracoes')
        .select('contact_id, status')
        .eq('codigo_procuracao', '00006')
        .limit(1000);
      if (e2) throw e2;
      const porContato = new Map<string, string>((procs ?? []).map((p) => [p.contact_id, p.status]));
      return (resumo ?? [])
        .map((r): ClienteCaixa => ({
          contact_id: r.contact_id,
          nome: r.contacts?.display_name || r.contacts?.name || 'Cliente',
          documento: r.contacts?.document ?? '',
          regime: r.contacts?.tax_regime ?? null,
          status_cliente: r.contacts?.status_cliente ?? null,
          procuracao: (porContato.get(r.contact_id) as ClienteCaixa['procuracao']) ?? 'desconhecida',
          indicador: r.indicador_mensagens_novas as ClienteCaixa['indicador'],
          indicador_verificado_em: r.indicador_verificado_em,
          evento_ultima_data: r.evento_ultima_data,
          consultado_em: r.consultado_em,
          consultado_por: r.consultado_por,
          mensagens_salvas: r.mensagens_salvas ?? 0,
          nao_lidas_salvas: r.nao_lidas_salvas ?? 0,
        }))
        .sort((a: ClienteCaixa, b: ClienteCaixa) => a.nome.localeCompare(b.nome, 'pt-BR'));
    },
  });
}

export function useMensagensCliente(contactId: string | null) {
  return useQuery({
    queryKey: ['serpro-cp-mensagens', contactId],
    enabled: !!contactId,
    queryFn: async (): Promise<MensagemCaixa[]> => {
      const { data, error } = await supabase
        .from('serpro_caixa_postal_mensagens')
        .select('*')
        .eq('contact_id', contactId!)
        .order('data_envio', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as MensagemCaixa[];
    },
  });
}

/** Mensagens das categorias que exigem ação (tela Termos de Intimação e cartão do Dashboard). */
export function useMensagensCriticas() {
  return useQuery({
    queryKey: ['serpro-cp-criticas'],
    queryFn: async (): Promise<MensagemComCliente[]> => {
      const criticas = (Object.keys(CATEGORIAS) as CategoriaMsg[]).filter((k) => CATEGORIAS[k].critica);
      const { data, error } = await supabase
        .from('serpro_caixa_postal_mensagens')
        .select('*, contacts:contact_id (name, display_name, razao_social, document, status_cliente, email, whatsapp, phone)')
        .in('categoria', criticas)
        .order('data_envio', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as MensagemComCliente[];
    },
  });
}

export interface UltimaMensagemCaixa {
  id: string;
  contact_id: string;
  assunto: string;
  data_envio: string | null;
  lida: boolean;
  categoria: CategoriaMsg;
  nome: string;
  documento: string;
}

/**
 * As últimas mensagens da Caixa Postal já baixadas (de clientes monitorados), da mais nova para a mais antiga, de qualquer categoria.
 * Só existe o que foi baixado pelo botão Consultar da tela Caixa Postal e-CAC: os demais clientes só têm o indicador de "mensagem nova".
 */
export function useUltimasMensagensCaixa(quantas = 3) {
  return useQuery({
    queryKey: ['serpro-cp-ultimas', quantas],
    queryFn: async (): Promise<UltimaMensagemCaixa[]> => {
      const { data, error } = await supabase
        .from('serpro_caixa_postal_mensagens')
        .select('id, contact_id, assunto, data_envio, lida, categoria, contacts:contact_id!inner (name, display_name, document, status_cliente)')
        .eq('contacts.status_cliente', STATUS_MONITORADO)
        .order('data_envio', { ascending: false, nullsFirst: false })
        .limit(quantas);
      if (error) throw error;
      return ((data ?? []) as unknown as (Omit<UltimaMensagemCaixa, 'nome' | 'documento'> & { contacts: { name: string; display_name: string | null; document: string | null } })[])
        .map(({ contacts, ...m }) => ({ ...m, nome: contacts.display_name || contacts.name || 'Cliente', documento: contacts.document ?? '' }));
    },
  });
}

export interface AssuntoCaixa { contact_id: string; assunto: string; data_envio: string | null }

/** Assunto de toda mensagem já baixada, para a busca "por assunto" da Caixa Postal (G10). Só o que foi baixado pelo Consultar. */
export function useAssuntosCaixa(enabled: boolean) {
  return useQuery({
    queryKey: ['serpro-cp-assuntos'],
    enabled,
    queryFn: async (): Promise<AssuntoCaixa[]> => {
      const linhas: AssuntoCaixa[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase
          .from('serpro_caixa_postal_mensagens')
          .select('contact_id, assunto, data_envio')
          .order('data_envio', { ascending: false, nullsFirst: false })
          .order('id')
          .range(de, de + 999);
        if (error) throw error;
        linhas.push(...((data ?? []) as AssuntoCaixa[]));
        if (!data || data.length < 1000) break; // PostgREST corta em 1000 linhas por página
      }
      return linhas;
    },
  });
}

// ---------------------------------------------------------------- ações (edge function serpro-caixa-postal)
function chamarCaixa<T>(body: Record<string, unknown>): Promise<T> {
  return invocarSerpro<T>('serpro-caixa-postal', body);
}

export interface ResultadoConsulta {
  ok: boolean;
  recente?: boolean;
  aviso?: string;
  semProcuracao?: boolean;
  error?: string;
  baixadas?: number;
  novas?: number;
  total_salvas?: number;
  nao_lidas?: number;
  ultima_pagina?: boolean;
  ponteiro_proxima?: string | null;
  cobravel?: boolean;
}

function useInvalidarCaixa() {
  const qc = useQueryClient();
  return (contactId?: string) => {
    qc.invalidateQueries({ queryKey: ['serpro-cp-clientes'] });
    qc.invalidateQueries({ queryKey: ['serpro-cp-criticas'] });
    qc.invalidateQueries({ queryKey: ['serpro-cp-assuntos'] });
    qc.invalidateQueries({ queryKey: ['serpro-cp-ultimas'] });
    qc.invalidateQueries({ queryKey: ['serpro-consumo'] });
    if (contactId) qc.invalidateQueries({ queryKey: ['serpro-cp-mensagens', contactId] });
  };
}

/** Baixa a LISTA de UM cliente (sem ciência). `force` ignora o aviso de "consultado há pouco". */
export function useConsultarCaixa() {
  const invalidar = useInvalidarCaixa();
  return useMutation({
    mutationFn: (v: { contactId: string; force?: boolean; ponteiro?: string | null }) =>
      chamarCaixa<ResultadoConsulta>({ action: 'consultar', contact_id: v.contactId, force: v.force, ponteiro: v.ponteiro }),
    onSuccess: (_d, v) => invalidar(v.contactId),
  });
}

/** Lê o CORPO de UMA mensagem. Gera CIÊNCIA da intimação: só chamar depois do pop-up de confirmação. */
export function useAbrirMensagem() {
  const invalidar = useInvalidarCaixa();
  return useMutation({
    mutationFn: (v: { mensagemId: string; contactId: string }) =>
      chamarCaixa<{ ok: boolean; corpo?: string; jaAberta?: boolean; error?: string }>({
        action: 'abrir', mensagem_id: v.mensagemId, ciencia_confirmada: true,
      }),
    onSuccess: (_d, v) => invalidar(v.contactId),
  });
}

export function useAcompanharMensagem() {
  const invalidar = useInvalidarCaixa();
  return useMutation({
    mutationFn: (v: { mensagemId: string; contactId: string; situacao?: SituacaoMsg; responsavel_id?: string | null; observacoes?: string | null; visivel_portal?: boolean }) => {
      const { mensagemId, contactId: _c, ...campos } = v;
      return chamarCaixa<{ ok?: boolean; error?: string }>({ action: 'acompanhar', mensagem_id: mensagemId, ...campos });
    },
    onSuccess: (_d, v) => invalidar(v.contactId),
  });
}

/** Bloco de notas de cada cliente (tela Termos de Intimação), por contact_id. */
export function useNotasClientesCaixa() {
  return useQuery({
    queryKey: ['serpro-cp-notas-clientes'],
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase
        .from('serpro_caixa_postal_resumo')
        .select('contact_id, observacoes')
        .not('observacoes', 'is', null)
        .limit(1000);
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.contact_id as string, r.observacoes as string]));
    },
  });
}

export function useAcompanharClienteCaixa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { contactId: string; observacoes: string | null }) =>
      chamarCaixa<{ ok?: boolean; error?: string }>({ action: 'acompanhar_cliente', contact_id: v.contactId, observacoes: v.observacoes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['serpro-cp-notas-clientes'] }),
  });
}

// ---------------------------------------------------------------- aviso ao cliente (Termos de Intimação)
export type CanalAviso = 'email' | 'whatsapp' | 'copiar';
export interface AvisoCaixa { mensagem_id: string; canal: CanalAviso; enviado_em: string }

/** Último aviso enviado por mensagem (histórico completo fica na tabela). */
export function useAvisosCaixa() {
  return useQuery({
    queryKey: ['serpro-cp-avisos'],
    queryFn: async (): Promise<Map<string, AvisoCaixa>> => {
      const { data, error } = await supabase
        .from('serpro_caixa_postal_avisos')
        .select('mensagem_id, canal, enviado_em')
        .order('enviado_em', { ascending: false })
        .limit(1000);
      if (error) throw error;
      const ultimo = new Map<string, AvisoCaixa>();
      for (const a of (data ?? []) as unknown as AvisoCaixa[]) if (!ultimo.has(a.mensagem_id)) ultimo.set(a.mensagem_id, a);
      return ultimo;
    },
  });
}

/** E-mail sai pelo servidor; WhatsApp/copiar só registram o histórico (o envio acontece no navegador de quem clicou). */
export function useAvisarCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { mensagemId: string; canal: CanalAviso; mensagem: string; assunto?: string }) =>
      chamarCaixa<{ ok?: boolean; error?: string; aviso?: string }>({
        action: 'avisar', mensagem_id: v.mensagemId, canal: v.canal, mensagem: v.mensagem, assunto: v.assunto,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['serpro-cp-avisos'] }),
  });
}

/** Clientes ativos com mensagem NOVA (a rotina diária viu a data avançar): número do menu "Mensagens e-CAC". */
export function useContadorCaixaNova(enabled: boolean): number {
  const { data } = useClientesCaixa(enabled);
  return (data ?? []).filter((c) => seloCaixa(c).estado === 'nova').length;
}
