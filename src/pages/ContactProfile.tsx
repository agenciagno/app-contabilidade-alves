import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, User, DollarSign, ClipboardList, History, KeyRound, Building2, Landmark, Users, Handshake, Calculator } from 'lucide-react';
import { useContacts } from '@/hooks/useContacts';
import { useContactTransactions, useContactFinancialStatus } from '@/hooks/useContactTransactions';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { ContactFinancialTab } from '@/components/contacts/ContactFinancialTab';
import { AcessosTab } from '@/components/contacts/AcessosTab';
import { ContactCadastroTab } from '@/components/contacts/cadastro/ContactCadastroTab';
import { ContactLogsWithComunicacaoTab } from '@/components/contacts/ContactLogsWithComunicacaoTab';
import { getDocumentType } from '@/lib/utils';
import { getContactDisplayName, getContactStatusTone } from '@/lib/contact-display';
import { DsBadge } from '@/components/ds';
import { FaixaStatusCliente } from '@/components/contacts/FaixaStatusCliente';

const taxRegimeLabels: Record<string, string> = {
  mei: 'MEI',
  simples_nacional: 'Simples Nacional',
  lucro_presumido: 'Lucro Presumido',
  lucro_real: 'Lucro Real',
  nao_aplica: 'Pessoa Física',
};

export default function ContactProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { contacts, isLoading: isLoadingContacts } = useContacts();
  const { data: transactions } = useContactTransactions(id);
  const { isModuleVisible, isSubItemVisible } = useModuleAccess();
  const canViewSub = (subKey: string) =>
    isModuleVisible('perfil_cliente') && isSubItemVisible('perfil_cliente', subKey);
  const contact = contacts.find(c => c.id === id);
  const isPessoaFisica = getDocumentType(contact?.document) === 'CPF';
  const canViewCadastro = canViewSub('perfil_cliente_identificacao');
  const canViewSocios = !isPessoaFisica && canViewSub('perfil_cliente_socios');
  const canViewFiscal = !isPessoaFisica && canViewSub('perfil_cliente_fiscal');
  const canViewPessoal = canViewSub('perfil_cliente_pessoal');
  const canViewContabil = canViewSub('perfil_cliente_contabil');
  const canViewAcessos = canViewSub('perfil_cliente_acessos');
  const canViewFinanceiro = canViewSub('perfil_cliente_financeiro');
  const canViewOperacional = canViewSub('perfil_cliente_operacional');
  const canViewLogs = canViewSub('perfil_cliente_logs');
  const { isInadimplente } = useContactFinancialStatus(id, transactions);

  useEffect(() => {
    if (!id) return;
    supabase.rpc('log_data_access', {
      p_titular_tipo: 'contato',
      p_titular_id: id,
      p_recurso: 'ficha_contato',
      p_recurso_id: id,
      p_acao: 'view',
    }).then(({ error }) => {
      if (error) console.warn('log_data_access failed:', error.message);
    });
  }, [id]);


  if (isLoadingContacts) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate('/contatos')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <div className="text-center py-16">
          <p className="text-muted-foreground">Cliente/Fornecedor não encontrado</p>
        </div>
      </div>
    );
  }

  const visibleTabCount = [
    canViewCadastro, canViewSocios, canViewFiscal, canViewPessoal, canViewContabil,
    canViewAcessos, canViewFinanceiro, canViewOperacional, canViewLogs,
  ].filter(Boolean).length;
  const defaultProfileTab = canViewCadastro ? 'cadastro'
    : canViewSocios ? 'societario'
    : canViewFiscal ? 'fiscal'
    : canViewPessoal ? 'pessoal'
    : canViewContabil ? 'contabil'
    : canViewAcessos ? 'acessos'
    : canViewFinanceiro ? 'financeiro'
    : canViewOperacional ? 'operacional'
    : canViewLogs ? 'logs'
    : 'cadastro';
  // Títulos das sub-abas em caixa alta (12/10/2026). Flex com rolagem: com 9 abas a grade fixa estourava em tela estreita.
  const triggerClass = 'min-w-fit flex-1 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide';

  return (
    <div className="space-y-6">
      {/* Breadcrumb do protótipo: "Empresas / Nome" no lugar do botão Voltar solto */}
      <nav className="flex items-center gap-2 text-link">
        <button
          onClick={() => navigate('/contatos')}
          className="flex items-center gap-1.5 text-muted-ink transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Empresas
        </button>
        <span className="text-meta text-muted-ink-2">/</span>
        <span className="truncate text-ink">{getContactDisplayName(contact)}</span>
      </nav>

      {/* Cabeçalho do objeto: IconBox 56 + nome em display + meta em linha */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-md ${
            isInadimplente ? 'bg-danger-soft text-danger' : 'bg-ok-soft text-ok'
          }`}
        >
          <Building2 className="h-5 w-5" strokeWidth={1.75} />
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-display text-ink">{getContactDisplayName(contact)}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
            {contact.document && (
              <span className="font-mono text-mono-sm text-muted-ink">{contact.document}</span>
            )}
            {contact.tax_regime && (
              <span className="text-meta text-muted-ink-2">{taxRegimeLabels[contact.tax_regime]}</span>
            )}
            <DsBadge tone={getContactStatusTone(contact.status_cliente)}>
              {contact.status_cliente || 'Sem status'}
            </DsBadge>
          </div>
        </div>
      </div>

      <FaixaStatusCliente status={contact.status_cliente} desde={contact.status_cliente_desde} motivo={contact.status_cliente_motivo} />

      {/* Tabs */}
      {visibleTabCount === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Sem permissão para ver o perfil deste cliente.
        </div>
      ) : (
      <Tabs defaultValue={defaultProfileTab} className="w-full">
        <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto">
          {canViewCadastro && (
            <TabsTrigger value="cadastro" className={triggerClass}>
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Cadastro</span>
            </TabsTrigger>
          )}
          {canViewSocios && (
            <TabsTrigger value="societario" className={triggerClass}>
              <Handshake className="h-4 w-4" />
              <span className="hidden sm:inline">Societário</span>
            </TabsTrigger>
          )}
          {canViewFiscal && (
            <TabsTrigger value="fiscal" className={triggerClass}>
              <Landmark className="h-4 w-4" />
              <span className="hidden sm:inline">Fiscal</span>
            </TabsTrigger>
          )}
          {canViewPessoal && (
            <TabsTrigger value="pessoal" className={triggerClass}>
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Pessoal</span>
            </TabsTrigger>
          )}
          {canViewContabil && (
            <TabsTrigger value="contabil" className={triggerClass}>
              <Calculator className="h-4 w-4" />
              <span className="hidden sm:inline">Contábil</span>
            </TabsTrigger>
          )}
          {canViewAcessos && (
            <TabsTrigger value="acessos" className={triggerClass}>
              <KeyRound className="h-4 w-4" />
              <span className="hidden sm:inline">Acessos</span>
            </TabsTrigger>
          )}
          {canViewFinanceiro && (
            <TabsTrigger value="financeiro" className={triggerClass}>
              <DollarSign className="h-4 w-4" />
              <span className="hidden sm:inline">Financeiro</span>
            </TabsTrigger>
          )}
          {canViewOperacional && (
            <TabsTrigger value="operacional" className={triggerClass}>
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Operacional</span>
            </TabsTrigger>
          )}
          {canViewLogs && (
            <TabsTrigger value="logs" className={triggerClass}>
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Logs</span>
            </TabsTrigger>
          )}
        </TabsList>

        <ContactCadastroTab contactId={contact.id} />

        {canViewAcessos && (
          <TabsContent value="acessos" className="mt-6">
            <AcessosTab contactId={contact.id} />
          </TabsContent>
        )}

        {canViewFinanceiro && (
          <TabsContent value="financeiro" className="mt-6">
            <ContactFinancialTab contactId={contact.id} contactName={contact.name} contact={contact} />
          </TabsContent>
        )}

        {canViewLogs && (
          <TabsContent value="logs" className="mt-6">
            <ContactLogsWithComunicacaoTab contactId={contact.id} />
          </TabsContent>
        )}
      </Tabs>
      )}
    </div>
  );
}
