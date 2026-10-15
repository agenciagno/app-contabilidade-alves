import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { PORTAL_LABELS, PortalTipo } from '@/hooks/useAcessosCliente';

export interface AcessoTipo {
  id: string;
  nome: string;
  /** Chave do portal fixo que o sistema conhece; nula = tipo criado pela equipe. */
  portal: PortalTipo | null;
  /** Quantos acessos de clientes usam este tipo. */
  total: number;
}

/** Tipos que o sistema usa por trás (certificado e fallback): renomeia, mas não exclui. */
export const TIPOS_PROTEGIDOS: string[] = ['certificado_digital', 'outros'];
export const tipoProtegido = (t: Pick<AcessoTipo, 'portal'>) => !!t.portal && TIPOS_PROTEGIDOS.includes(t.portal);

const ORDEM_FIXOS = Object.keys(PORTAL_LABELS);

/** Lista única de tipos de acesso da empresa: portais fixos (renomeáveis) e os criados pela equipe. */
export function useAcessoTipos() {
  return useQuery({
    queryKey: ['acesso-tipos'],
    queryFn: async (): Promise<AcessoTipo[]> => {
      const { data, error } = await (supabase as any)
        .from('acesso_tipos')
        .select('id, nome, portal, acessos_portais(count)');
      if (error) throw error;
      const tipos = ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        nome: r.nome,
        portal: r.portal ?? null,
        total: Number(r.acessos_portais?.[0]?.count ?? 0),
      })) as AcessoTipo[];
      // Fixos na ordem de sempre; depois os da equipe em ordem alfabética.
      const pos = (t: AcessoTipo) => (t.portal ? ORDEM_FIXOS.indexOf(t.portal) : ORDEM_FIXOS.length);
      return tipos.sort((a, b) => pos(a) - pos(b) || a.nome.localeCompare(b.nome, 'pt-BR'));
    },
  });
}

function erroDeTipo(error: any): Error {
  if (error?.code === '23505') return new Error('Já existe um tipo de acesso com esse nome.');
  if (error?.code === '23514') return new Error('Use entre 2 e 60 letras no nome do tipo.');
  if (error?.code === '42501') return new Error(error.message?.includes('sistema') ? error.message : 'Você não tem permissão para alterar tipos de acesso.');
  return new Error(error?.message ?? 'Falha ao salvar o tipo de acesso.');
}

export function useCriarAcessoTipo() {
  const qc = useQueryClient();
  const { company } = useCompany();
  return useMutation({
    mutationFn: async (nome: string): Promise<AcessoTipo> => {
      if (!company?.id) throw new Error('Empresa não encontrada.');
      const { data, error } = await (supabase as any)
        .from('acesso_tipos')
        .insert({ nome: nome.trim(), company_id: company.id })
        .select('id, nome, portal')
        .single();
      if (error) throw erroDeTipo(error);
      return { id: data.id, nome: data.nome, portal: data.portal ?? null, total: 0 };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['acesso-tipos'] }),
  });
}

export function useRenomearAcessoTipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; nome: string }) => {
      const { data, error } = await (supabase as any)
        .from('acesso_tipos')
        .update({ nome: v.nome.trim() })
        .eq('id', v.id)
        .select('id');
      if (error) throw erroDeTipo(error);
      // RLS que barra o update não dá erro: devolve zero linhas.
      if (!data?.length) throw new Error('Você não tem permissão para alterar tipos de acesso.');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['acesso-tipos'] });
      // O nome aparece nas listas de acessos e no Cofre Global.
      qc.invalidateQueries({ queryKey: ['acessos-portais'] });
      qc.invalidateQueries({ queryKey: ['cofre-global'] });
    },
  });
}

/** Exclui o tipo; com `moverPara`, move antes os acessos que o usam para esse outro tipo. Devolve quantos acessos foram movidos. */
export function useExcluirAcessoTipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; moverPara?: string | null }): Promise<number> => {
      const { data, error } = await (supabase as any).rpc('excluir_tipo_acesso', {
        p_tipo: v.id,
        p_mover_para: v.moverPara ?? null,
      });
      if (error) {
        if (error.code === '23503') throw new Error('Ainda há acessos usando este tipo. Mova-os para outro tipo para excluir.');
        throw erroDeTipo(error);
      }
      return Number(data ?? 0);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['acesso-tipos'] });
      qc.invalidateQueries({ queryKey: ['acessos-portais'] });
      qc.invalidateQueries({ queryKey: ['cofre-global'] });
    },
  });
}
