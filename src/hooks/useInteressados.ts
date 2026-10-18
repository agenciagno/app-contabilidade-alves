import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useActiveCompany } from '@/contexts/CompanyContext';

/** Funil de interessados (17/10/2026): quem procurou a CA e ainda não é cliente. Tabela própria, fora de `contacts`. */
export type EtapaInteressado = 'novo' | 'atendido' | 'proposta' | 'fechou' | 'perdido';
export type InteresseTipo = 'abertura' | 'troca_contador' | 'mei' | 'outro';
export type MotivoPerda = 'preco' | 'outro_contador' | 'desistiu' | 'sem_retorno' | 'outro';

export interface Interessado {
  id: string;
  company_id: string;
  nome: string;
  whatsapp: string | null;
  email: string | null;
  documento: string | null;
  interesse: InteresseTipo;
  indicado_por: string | null;
  regime_pretendido: string | null;
  honorario_proposto: number | null;
  responsavel_id: string | null;
  etapa: EtapaInteressado;
  etapa_desde: string;
  proximo_contato: string | null;
  motivo_perda: MotivoPerda | null;
  contact_id: string | null;
  fechado_em: string | null;
  created_at: string;
}

export interface EventoInteressado {
  id: string;
  tipo: 'anotacao' | 'etapa' | 'mensagem';
  texto: string;
  criado_por: string | null;
  created_at: string;
}

export const ETAPAS_FUNIL: { valor: EtapaInteressado; rotulo: string }[] = [
  { valor: 'novo', rotulo: 'Novo contato' },
  { valor: 'atendido', rotulo: 'Atendido' },
  { valor: 'proposta', rotulo: 'Proposta enviada' },
  { valor: 'fechou', rotulo: 'Fechou' },
];

export const INTERESSE_ROTULO: Record<InteresseTipo, string> = {
  abertura: 'Abertura de empresa',
  troca_contador: 'Troca de contador',
  mei: 'MEI',
  outro: 'Outro',
};

export const MOTIVO_PERDA_ROTULO: Record<MotivoPerda, string> = {
  preco: 'Preço',
  outro_contador: 'Foi para outro contador',
  desistiu: 'Desistiu de abrir',
  sem_retorno: 'Sem retorno',
  outro: 'Outro motivo',
};

export type InteressadoForm = Partial<Omit<Interessado, 'id' | 'company_id' | 'created_at' | 'etapa_desde' | 'fechado_em'>>;

const CHAVE = ['interessados'];

export function useInteressados() {
  const queryClient = useQueryClient();
  const { activeCompanyId } = useActiveCompany();

  const { data: interessados = [], isLoading } = useQuery({
    queryKey: [...CHAVE, activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('interessados')
        .select('*')
        .eq('company_id', activeCompanyId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Interessado[];
    },
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: CHAVE });

  const criar = useMutation({
    mutationFn: async (form: InteressadoForm) => {
      const { data, error } = await supabase
        .from('interessados')
        .insert({ ...form, nome: form.nome ?? '', company_id: activeCompanyId! })
        .select()
        .single();
      if (error) throw error;
      return data as Interessado;
    },
    onSuccess: () => { invalidar(); toast.success('Interessado cadastrado'); },
    onError: (e: Error) => toast.error('Erro ao cadastrar', { description: e.message }),
  });

  const atualizar = useMutation({
    mutationFn: async ({ id, ...form }: InteressadoForm & { id: string }) => {
      const { error } = await supabase.from('interessados').update(form).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: (e: Error) => toast.error('Erro ao salvar', { description: e.message }),
  });

  const apagar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('interessados').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidar(); toast.success('Interessado apagado'); },
    onError: (e: Error) => toast.error('Erro ao apagar', { description: e.message }),
  });

  return { interessados, isLoading, criar, atualizar, apagar };
}

export function useEventosInteressado(interessadoId?: string) {
  const queryClient = useQueryClient();
  const { activeCompanyId } = useActiveCompany();
  const chave = ['interessado-eventos', interessadoId];

  const { data: eventos = [] } = useQuery({
    queryKey: chave,
    enabled: !!interessadoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('interessado_eventos')
        .select('id, tipo, texto, criado_por, created_at')
        .eq('interessado_id', interessadoId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as EventoInteressado[];
    },
  });

  const registrar = useMutation({
    mutationFn: async ({ texto, tipo = 'anotacao' }: { texto: string; tipo?: EventoInteressado['tipo'] }) => {
      const { error } = await supabase.from('interessado_eventos').insert({
        company_id: activeCompanyId!, interessado_id: interessadoId!, tipo, texto,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chave }),
    onError: (e: Error) => toast.error('Erro ao registrar', { description: e.message }),
  });

  return { eventos, registrar };
}

/** Data de hoje no fuso de Brasília (AAAA-MM-DD), para comparar com `proximo_contato`. */
export const hojeBR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

/** Mensagem pronta de WhatsApp por etapa (a equipe pode editar antes de enviar). */
export function mensagemFollowup(i: Pick<Interessado, 'nome' | 'etapa' | 'interesse'>) {
  const primeiro = i.nome.trim().split(/\s+/)[0];
  if (i.etapa === 'novo') return `Oi, ${primeiro}! Aqui é da Contabilidade Alves. Recebemos seu contato e queremos entender melhor o que você precisa. Podemos conversar?`;
  if (i.etapa === 'atendido') return `Oi, ${primeiro}! Tudo bem? Passando para saber se ficou alguma dúvida da nossa conversa. Posso te mandar a proposta?`;
  if (i.etapa === 'proposta') return `Oi, ${primeiro}! Conseguiu ver a proposta que enviamos? Se quiser, ajustamos algum ponto ou explico por aqui.`;
  return `Oi, ${primeiro}! Aqui é da Contabilidade Alves.`;
}

/** Link do WhatsApp (wa.me) com DDI 55 quando o número vier só com DDD. */
export function linkWhatsapp(numero: string | null | undefined, texto: string) {
  const d = (numero || '').replace(/\D/g, '');
  if (!d) return null;
  const comDdi = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${comDdi}?text=${encodeURIComponent(texto)}`;
}
