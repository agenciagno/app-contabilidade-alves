import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { createAuditLog, getFieldChanges } from '@/hooks/useAuditLog';
import { createGlobalLog } from '@/hooks/useGlobalLogs';
import { useActiveCompany } from '@/contexts/CompanyContext';

export type TaxRegime = 'mei' | 'simples_nacional' | 'lucro_presumido' | 'lucro_real' | 'nao_aplica';

export interface Contact {
  id: string;
  company_id: string;
  name: string;
  type: 'cliente' | 'fornecedor' | 'ambos';
  document: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  cep: string | null;
  address: string | null;
  address_number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  tax_regime: TaxRegime | null;
  is_active: boolean;
  representative_legal: string | null;
  boleto_active: boolean;
  boleto_value: number | null;
  boleto_due_day: number | null;
  boleto_start_date: string | null;
  canal_entrega: 'whatsapp' | 'email' | 'impresso' | 'whatsapp_email' | null;
  numero_cliente_sicoob: number | null;
  enviar_cobranca_auto: boolean;
  origin: string;
  responsible_id: string | null;
  created_at: string;
  updated_at: string;
  // Dados empresariais
  razao_social: string | null;
  nome_fantasia: string | null;
  display_name: string | null;
  cnae_principal: any | null;
  cnaes_secundarios: any | null;
  natureza_juridica: string | null;
  situacao_cadastral: string | null;
  data_abertura_receita: string | null;
  // Endereço
  complemento: string | null;
  // Contato adicional
  segundo_email_contato: string | null;
  // Dados fiscais adicionais
  ie: string | null;
  im: string | null;
  regime_apuracao: string | null;
  numero_alvara: string | null;
  validade_alvara: string | null;
  // Status e classificação
  status_cliente: string | null;
  tipo_cliente: string | null;
  tipo_estabelecimento: string | null;
  grupo_escritorio: string | null;
  data_inicio_contrato: string | null;
  data_saida_cliente: string | null;
  porte: string | null;
  categorias: string[];
  // Datas por esfera
  data_abertura_junta: string | null;
  data_abertura_rf: string | null;
  data_abertura_prefeitura: string | null;
  data_abertura_estado: string | null;
  data_encerramento_junta: string | null;
  data_encerramento_rf: string | null;
  data_encerramento_prefeitura: string | null;
  data_encerramento_estado: string | null;
  // Departamento Pessoal
  possui_funcionarios: boolean;
  numero_funcionarios: number | null;
  tipo_cartao_ponto: string | null;
  medicina_trabalho: boolean;
  grupo_cipa: string | null;
  registro_entradas: boolean;
  registro_saidas: boolean;
  registro_icms: boolean;
  inventario: boolean;
  // Criptografado
  siare_senha_encrypted: any | null;
}

type ContactOptionalKeys =
  | 'razao_social' | 'nome_fantasia' | 'display_name' | 'cnae_principal' | 'cnaes_secundarios'
  | 'natureza_juridica' | 'situacao_cadastral' | 'data_abertura_receita'
  | 'complemento' | 'segundo_email_contato'
  | 'ie' | 'im' | 'regime_apuracao' | 'numero_alvara' | 'validade_alvara'
  | 'status_cliente' | 'tipo_cliente' | 'tipo_estabelecimento' | 'grupo_escritorio'
  | 'data_inicio_contrato' | 'data_saida_cliente' | 'porte' | 'categorias'
  | 'data_abertura_junta' | 'data_abertura_rf' | 'data_abertura_prefeitura' | 'data_abertura_estado'
  | 'data_encerramento_junta' | 'data_encerramento_rf' | 'data_encerramento_prefeitura' | 'data_encerramento_estado'
  | 'possui_funcionarios' | 'numero_funcionarios' | 'tipo_cartao_ponto' | 'medicina_trabalho'
  | 'grupo_cipa' | 'registro_entradas' | 'registro_saidas' | 'registro_icms' | 'inventario'
  | 'siare_senha_encrypted';

export type ContactInsert = Omit<Contact, 'id' | 'company_id' | 'created_at' | 'updated_at' | 'origin' | 'whatsapp' | 'responsible_id' | 'canal_entrega' | 'numero_cliente_sicoob' | 'enviar_cobranca_auto' | ContactOptionalKeys> & { origin?: string; whatsapp?: string | null; responsible_id?: string | null; canal_entrega?: string | null; numero_cliente_sicoob?: number | null; enviar_cobranca_auto?: boolean } & Partial<Pick<Contact, ContactOptionalKeys>>;
export type ContactUpdate = Partial<ContactInsert>;

export function useContacts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeCompanyId } = useActiveCompany();

  const { data: contacts = [], isLoading, error } = useQuery({
    queryKey: ['contacts', activeCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('company_id', activeCompanyId!)
        .order('name', { ascending: true });

      if (error) throw error;
      return data as Contact[];
    },
    enabled: !!activeCompanyId,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
  });

  const createContact = useMutation({
    mutationFn: async (contact: ContactInsert) => {
      if (!activeCompanyId) throw new Error('Empresa em contexto não definida');

      const { data, error } = await supabase
        .from('contacts')
        .insert({ ...contact, company_id: activeCompanyId })
        .select()
        .single();

      if (error) throw error;
      
      const typeLabel = contact.type === 'cliente' ? 'Cliente' : contact.type === 'fornecedor' ? 'Fornecedor' : 'Cliente/Fornecedor';
      await createGlobalLog({
        action: 'ADICAO',
        module: 'CRM',
        entityId: data.id,
        entityName: contact.name,
        details: `${typeLabel} "${contact.name}" cadastrado`,
      });
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['global-logs'] });
      toast({ title: 'Cliente/Fornecedor criado!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao criar cliente/fornecedor', description: error.message, variant: 'destructive' });
    },
  });

  const updateContact = useMutation({
    mutationFn: async ({ id, originalContact, ...updates }: ContactUpdate & { id: string; originalContact?: Contact }) => {
      const { data, error } = await supabase
        .from('contacts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Create audit log for cadastral changes
      if (originalContact) {
        const fieldLabels: Record<string, string> = {
          name: 'Nome',
          document: 'CPF/CNPJ',
          tax_regime: 'Regime Tributário',
          porte: 'Porte',
          data_saida_cliente: 'Data de Saída do Cliente',
          email: 'E-mail',
          phone: 'Telefone',
          cep: 'CEP',
          address: 'Logradouro',
          address_number: 'Número',
          neighborhood: 'Bairro',
          city: 'Cidade',
          state: 'Estado',
          representative_legal: 'Representante Legal',
          type: 'Tipo',
          is_active: 'Status',
          razao_social: 'Razão Social',
          nome_fantasia: 'Nome Fantasia',
          cnae_principal: 'CNAE Principal',
          natureza_juridica: 'Natureza Jurídica',
          situacao_cadastral: 'Situação Cadastral',
          ie: 'Inscrição Estadual',
          im: 'Inscrição Municipal',
          regime_apuracao: 'Regime de Apuração',
          tipo_estabelecimento: 'Tipo de Estabelecimento',
          grupo_escritorio: 'Grupo do Escritório',
          data_inicio_contrato: 'Data Início Contrato',
          status_cliente: 'Status do Cliente',
          tipo_cliente: 'Tipo de Cliente',
          possui_funcionarios: 'Possui Funcionários',
          numero_funcionarios: 'Nº Funcionários',
          tipo_cartao_ponto: 'Tipo Cartão Ponto',
          medicina_trabalho: 'Medicina do Trabalho',
        };

        const taxRegimeLabels: Record<string, string> = {
          mei: 'MEI',
          simples_nacional: 'Simples Nacional',
          lucro_presumido: 'Lucro Presumido',
          lucro_real: 'Lucro Real',
          nao_aplica: 'Pessoa Física',
        };

        // Map tax regime values to labels for better readability
        const mappedOldData = {
          ...originalContact,
          tax_regime: originalContact.tax_regime ? taxRegimeLabels[originalContact.tax_regime] || originalContact.tax_regime : '',
          is_active: originalContact.is_active ? 'Ativo' : 'Inativo',
        };
        const mappedNewData = {
          ...updates,
          tax_regime: updates.tax_regime ? taxRegimeLabels[updates.tax_regime] || updates.tax_regime : '',
          is_active: updates.is_active !== undefined ? (updates.is_active ? 'Ativo' : 'Inativo') : mappedOldData.is_active,
        };

        const changes = getFieldChanges(mappedOldData, mappedNewData, fieldLabels);

        if (changes.length > 0) {
          await createAuditLog({
            contactId: id,
            action: 'CADASTRO_ALTERADO',
            description: changes.join('; '),
          });
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['contact-logs'] });
      toast({ title: 'Cliente/Fornecedor atualizado!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao atualizar cliente/fornecedor', description: error.message, variant: 'destructive' });
    },
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] }); // Sync transactions view
      toast({ title: 'Cliente/Fornecedor excluído!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao excluir cliente/fornecedor', description: error.message, variant: 'destructive' });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('contacts')
        .update({ is_active })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });

  return {
    contacts,
    isLoading,
    error,
    createContact,
    updateContact,
    deleteContact,
    toggleActive,
  };
}
