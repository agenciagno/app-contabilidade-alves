import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, User, DollarSign, FileText, ClipboardList, Download, History, KeyRound, Building2 } from 'lucide-react';
import { useContacts } from '@/hooks/useContacts';
import { useContactTransactions, useContactFinancialStatus } from '@/hooks/useContactTransactions';
import { useContactDocuments, DOCUMENT_CATEGORIES } from '@/hooks/useContactDocuments';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { ContactFinancialTab } from '@/components/contacts/ContactFinancialTab';
import { ContactDocumentsTab } from '@/components/contacts/ContactDocumentsTab';
import { generateContactReport } from '@/components/contacts/ContactReportPDF';
import { AcessosTab } from '@/components/contacts/AcessosTab';
import { ContactCadastroTab } from '@/components/contacts/cadastro/ContactCadastroTab';
import { ContactLogsWithComunicacaoTab } from '@/components/contacts/ContactLogsWithComunicacaoTab';
import { getDocumentType } from '@/lib/utils';
import { getContactDisplayName } from '@/lib/contact-display';
import { DsBadge } from '@/components/ds';

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
  const { documents, getDocumentCounts } = useContactDocuments(id);
  const { isModuleVisible, isSubItemVisible } = useModuleAccess();
  const canViewSub = (subKey: string) =>
    isModuleVisible('perfil_cliente') && isSubItemVisible('perfil_cliente', subKey);
  const canViewIdentificacaoGroup = canViewSub('perfil_cliente_identificacao')
    || canViewSub('perfil_cliente_fiscal')
    || canViewSub('perfil_cliente_operacional')
    || canViewSub('perfil_cliente_socios');
  const canViewAcessos = canViewSub('perfil_cliente_acessos');
  const canViewDocumentos = canViewSub('perfil_cliente_documentos');
  const canViewFinanceiro = canViewSub('perfil_cliente_financeiro');
  const canViewLogs = canViewSub('perfil_cliente_logs');
  const contact = contacts.find(c => c.id === id);
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


  const handleGenerateReport = () => {
    if (!contact) return;

    const financialSummary = {
      totalPago: transactions?.filter(t => t.is_paid).reduce((sum, t) => sum + Number(t.amount), 0) || 0,
      totalPendente: transactions?.filter(t => !t.is_paid).reduce((sum, t) => sum + Number(t.amount), 0) || 0,
    };

    const documentCounts = getDocumentCounts();
    const documentCountsArray = DOCUMENT_CATEGORIES
      .map(cat => ({ category: cat.value, count: documentCounts[cat.value] }))
      .filter(item => item.count > 0);

    generateContactReport(
      contact,
      transactions || [],
      documentCountsArray,
      financialSummary
    );
  };

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

  const visibleTabCount = (canViewIdentificacaoGroup ? 1 : 0) + (canViewAcessos ? 1 : 0)
    + (canViewDocumentos ? 1 : 0) + (canViewFinanceiro ? 1 : 0) + (canViewLogs ? 1 : 0);
  const GRID_COLS_CLASS: Record<number, string> = {
    1: 'grid-cols-1',
    2: 'grid-cols-2 md:grid-cols-2',
    3: 'grid-cols-2 md:grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-4',
    5: 'grid-cols-2 md:grid-cols-5',
  };
  const tabsColsClass = GRID_COLS_CLASS[visibleTabCount] ?? 'grid-cols-1';
  const defaultProfileTab = canViewIdentificacaoGroup ? 'cadastro'
    : canViewAcessos ? 'acessos'
    : canViewDocumentos ? 'documentos'
    : canViewFinanceiro ? 'financeiro'
    : canViewLogs ? 'logs'
    : 'cadastro';

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
            <DsBadge tone={isInadimplente ? 'danger' : 'ok'}>
              {isInadimplente ? 'inadimplente' : 'adimplente'}
            </DsBadge>
          </div>
        </div>

        <Button variant="outline" onClick={handleGenerateReport} className="hidden sm:flex">
          <Download className="h-4 w-4" />
          Gerar relatório
        </Button>
      </div>

      {/* Mobile Report Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleGenerateReport}
        className="sm:hidden w-full"
      >
        <Download className="h-4 w-4 mr-2" />
        Gerar Relatório PDF
      </Button>

      {/* Tabs */}
      {visibleTabCount === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Sem permissão para ver o perfil deste cliente.
        </div>
      ) : (
      <Tabs defaultValue={defaultProfileTab} className="w-full">
        <TabsList className={`w-full grid ${tabsColsClass} gap-1 h-auto`}>
          {canViewIdentificacaoGroup && (
            <TabsTrigger value="cadastro" className="flex items-center gap-1.5">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Cadastro</span>
            </TabsTrigger>
          )}
          {canViewAcessos && (
            <TabsTrigger value="acessos" className="flex items-center gap-1.5">
              <KeyRound className="h-4 w-4" />
              <span className="hidden sm:inline">Acessos</span>
            </TabsTrigger>
          )}
          {canViewDocumentos && (
            <TabsTrigger value="documentos" className="flex items-center gap-1.5">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Documentos</span>
            </TabsTrigger>
          )}
          {canViewFinanceiro && (
            <TabsTrigger value="financeiro" className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4" />
              <span className="hidden sm:inline">Financeiro</span>
            </TabsTrigger>
          )}
          {canViewLogs && (
            <TabsTrigger value="logs" className="flex items-center gap-1.5">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Logs</span>
            </TabsTrigger>
          )}
        </TabsList>

        {canViewIdentificacaoGroup && (
          <TabsContent value="cadastro" className="mt-6">
            <ContactCadastroTab contactId={contact.id} />
          </TabsContent>
        )}

        {canViewAcessos && (
          <TabsContent value="acessos" className="mt-6">
            <AcessosTab contactId={contact.id} />
          </TabsContent>
        )}

        {canViewDocumentos && (
          <TabsContent value="documentos" className="mt-6">
            <ContactDocumentsTab contactId={contact.id} />
          </TabsContent>
        )}

        {canViewFinanceiro && (
          <TabsContent value="financeiro" className="mt-6">
            <ContactFinancialTab contactId={contact.id} contactName={contact.name} />
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
