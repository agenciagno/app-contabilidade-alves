import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, User, DollarSign, FileText, ClipboardList, Download, History, ShieldCheck, KeyRound } from 'lucide-react';
import { useContacts } from '@/hooks/useContacts';
import { useContactTransactions, useContactFinancialStatus } from '@/hooks/useContactTransactions';
import { useContactDocuments, DOCUMENT_CATEGORIES } from '@/hooks/useContactDocuments';
import { useUserRole } from '@/hooks/useUserRole';
import { ContactFinancialTab } from '@/components/contacts/ContactFinancialTab';
import { ContactDocumentsTab } from '@/components/contacts/ContactDocumentsTab';
import { generateContactReport } from '@/components/contacts/ContactReportPDF';
import { AcessosTab } from '@/components/contacts/AcessosTab';
import { ContactCadastroTab } from '@/components/contacts/cadastro/ContactCadastroTab';
import { AlvarasCertificadosTab } from '@/components/contacts/AlvarasCertificadosTab';
import { ContactLogsWithComunicacaoTab } from '@/components/contacts/ContactLogsWithComunicacaoTab';

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
  const { isAdmin, isSuperAdmin, allowedModules } = useUserRole();
  const canViewAcessos = isSuperAdmin || allowedModules.includes('acessos');
  const contact = contacts.find(c => c.id === id);
  const { isInadimplente } = useContactFinancialStatus(id, transactions);

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

  const tabsColsClass = canViewAcessos ? 'grid-cols-3 md:grid-cols-6' : 'grid-cols-3 md:grid-cols-5';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/contatos')} className="w-fit">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>

        <div className="flex items-center gap-4 flex-1">
          <div className="p-3 bg-primary/10 rounded-xl">
            <User className="h-6 w-6 text-primary" />
          </div>

          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">{contact.name}</h1>
            {contact.document && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {contact.document.length > 14 ? 'CNPJ' : 'CPF'}: {contact.document}
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              {contact.tax_regime && (
                <Badge variant="outline">
                  {taxRegimeLabels[contact.tax_regime]}
                </Badge>
              )}
              <Badge
                variant={isInadimplente ? 'destructive' : 'secondary'}
                className={!isInadimplente ? 'bg-emerald-500/10 text-emerald-500' : ''}
              >
                {isInadimplente ? 'Inadimplente' : 'Adimplente'}
              </Badge>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateReport}
            className="hidden sm:flex"
          >
            <Download className="h-4 w-4 mr-2" />
            Gerar Relatório
          </Button>
        </div>
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
      <Tabs defaultValue="cadastro" className="w-full">
        <TabsList className={`w-full grid ${tabsColsClass} gap-1 h-auto`}>
          <TabsTrigger value="cadastro" className="flex items-center gap-1.5">
            <ClipboardList className="h-4 w-4" />
            <span className="hidden sm:inline">Cadastro</span>
          </TabsTrigger>
          <TabsTrigger value="alvaras" className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Alvarás e Certificados</span>
          </TabsTrigger>
          {canViewAcessos && (
            <TabsTrigger value="acessos" className="flex items-center gap-1.5">
              <KeyRound className="h-4 w-4" />
              <span className="hidden sm:inline">Acessos</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="documentos" className="flex items-center gap-1.5">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Documentos</span>
          </TabsTrigger>
          <TabsTrigger value="financeiro" className="flex items-center gap-1.5">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Financeiro</span>
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-1.5">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Logs</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cadastro" className="mt-6">
          <ContactCadastroTab contactId={contact.id} />
        </TabsContent>

        <TabsContent value="alvaras" className="mt-6">
          <AlvarasCertificadosTab contactId={contact.id} />
        </TabsContent>

        {canViewAcessos && (
          <TabsContent value="acessos" className="mt-6">
            <AcessosTab contactId={contact.id} />
          </TabsContent>
        )}

        <TabsContent value="documentos" className="mt-6">
          <ContactDocumentsTab contactId={contact.id} />
        </TabsContent>

        <TabsContent value="financeiro" className="mt-6">
          <ContactFinancialTab contactId={contact.id} contactName={contact.name} />
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <ContactLogsWithComunicacaoTab contactId={contact.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
