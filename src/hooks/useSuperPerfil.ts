import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { lookupCnpj as cnpjLookupFn } from '@/lib/cnpj-lookup';


// Lista explícita de colunas (exclui siare_senha_encrypted)
const SUPER_PERFIL_COLUMNS = [
  'id', 'company_id', 'name', 'document', 'email', 'phone', 'whatsapp', 'notes',
  'is_active', 'created_at', 'updated_at', 'origin', 'type',
  'razao_social', 'nome_fantasia', 'porte', 'natureza_juridica', 'situacao_cadastral',
  'tipo_estabelecimento', 'status_cliente', 'tipo_cliente', 'grupo_escritorio',
  'cnae_principal', 'cnaes_secundarios', 'data_abertura_receita',
  'representative_legal', 'segundo_email_contato',
  'address', 'address_number', 'complemento', 'neighborhood', 'city', 'state', 'cep',
  'tax_regime', 'ie', 'im', 'regime_apuracao', 'numero_alvara', 'validade_alvara',
  'registro_entradas', 'registro_saidas', 'registro_icms', 'inventario',
  'responsible_id', 'categorias',
  'data_inicio_contrato', 'data_saida_cliente',
  'data_abertura_junta', 'data_encerramento_junta',
  'data_abertura_rf', 'data_encerramento_rf',
  'data_abertura_prefeitura', 'data_encerramento_prefeitura',
  'data_abertura_estado', 'data_encerramento_estado',
  'possui_funcionarios', 'numero_funcionarios', 'tipo_cartao_ponto',
  'medicina_trabalho', 'grupo_cipa',
  'canal_entrega', 'numero_cliente_sicoob', 'enviar_cobranca_auto',
  'boleto_value', 'boleto_due_day',
].join(',');

export type SuperPerfil = Record<string, any>;

export function useSuperPerfil(contactId: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['super-perfil', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select(SUPER_PERFIL_COLUMNS)
        .eq('id', contactId)
        .single();
      if (error) throw error;
      return data as SuperPerfil;
    },
    enabled: !!contactId,
  });

  const updateSuperPerfil = useMutation({
    mutationFn: async (updates: Partial<SuperPerfil>) => {
      // Nunca enviar siare_senha_encrypted nem mexer em type por aqui
      const { siare_senha_encrypted, type, id, company_id, created_at, updated_at, ...safe } = updates as any;
      const { data, error } = await supabase
        .from('contacts')
        .update(safe)
        .eq('id', contactId)
        .select(SUPER_PERFIL_COLUMNS)
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-perfil', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast({ title: 'Cadastro atualizado com sucesso' });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    },
  });

  return { data, isLoading, error, updateSuperPerfil, lookupCnpj: cnpjLookupFn };
}

