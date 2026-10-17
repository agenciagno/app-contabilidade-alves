import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, User, DollarSign, ClipboardList, History, KeyRound, Landmark, Users, Handshake, Calculator, StickyNote, FileBarChart } from 'lucide-react';
import { useContacts } from '@/hooks/useContacts';
import { useContactTransactions, useContactFinancialStatus } from '@/hooks/useContactTransactions';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { ContactFinancialTab } from '@/components/contacts/ContactFinancialTab';
import { AcessosTab } from '@/components/contacts/AcessosTab';
import { ContactCadastroTab } from '@/components/contacts/cadastro/ContactCadastroTab';
import { ContactLogsWithComunicacaoTab } from '@/components/contacts/ContactLogsWithComunicacaoTab';
import { getDocumentType } from '@/lib/utils';
import { FaixaStatusCliente } from '@/components/contacts/FaixaStatusCliente';
import { PerfilResumoCard } from '@/components/contacts/PerfilResumoCard';
import { FichaFiscalConteudo } from '@/components/monitor/FichaFiscal';
import { useSidebar } from '@/components/ui/sidebar';

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
  // Observações (era um box do Cadastro) segue a permissão do Cadastro; Relatórios (Ficha fiscal) segue a do Fiscal. Sem chave nova: ninguém perde nem ganha acesso.
  const canViewObservacoes = canViewCadastro;
  const canViewRelatorios = canViewFiscal;
  const { isInadimplente } = useContactFinancialStatus(id, transactions);

  // Ao entrar no Super Perfil o menu lateral recolhe (a tela ganha espaço); ao sair volta como estava. Só no desktop: no celular o menu já é gaveta.
  const { open: menuAberto, setOpen: setMenuAberto, isMobile } = useSidebar();
  const menu = useRef({ menuAberto, setMenuAberto });
  menu.current = { menuAberto, setMenuAberto };
  useEffect(() => {
    if (isMobile) return;
    const estavaAberto = menu.current.menuAberto;
    if (estavaAberto) menu.current.setMenuAberto(false);
    return () => { if (estavaAberto) menu.current.setMenuAberto(true); };
  }, [isMobile]);

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
    canViewAcessos, canViewFinanceiro, canViewOperacional, canViewObservacoes, canViewRelatorios, canViewLogs,
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
  // Títulos das sub-abas em caixa alta (12/10/2026). Flex que quebra linha: com 11 abas na coluna da direita (17/10/2026) nem a rolagem lateral cabia sem esconder abas.
  const triggerClass = 'min-w-fit flex-1 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide';

  return (
    // Duas colunas (17/10/2026): resumo fixo à esquerda (~1/3) e as sub-abas à direita. Abaixo de `lg` empilha.
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(280px,33%)_minmax(0,1fr)] lg:items-start">
      <PerfilResumoCard contact={contact} inadimplente={isInadimplente} onVoltar={() => navigate('/contatos')} />

      <div className="min-w-0 space-y-6">
        <FaixaStatusCliente status={contact.status_cliente} desde={contact.status_cliente_desde} motivo={contact.status_cliente_motivo} />

        {/* Tabs */}
        {visibleTabCount === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Sem permissão para ver o perfil deste cliente.
          </div>
        ) : (
        <Tabs defaultValue={defaultProfileTab} className="w-full">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
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
            {canViewObservacoes && (
              <TabsTrigger value="observacoes" className={triggerClass}>
                <StickyNote className="h-4 w-4" />
                <span className="hidden sm:inline">Observações</span>
              </TabsTrigger>
            )}
            {canViewRelatorios && (
              <TabsTrigger value="relatorios" className={triggerClass}>
                <FileBarChart className="h-4 w-4" />
                <span className="hidden sm:inline">Relatórios</span>
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

          {/* Relatórios: por enquanto só a Ficha fiscal do cliente (a mesma do painel lateral do Monitoramento). */}
          {canViewRelatorios && (
            <TabsContent value="relatorios" className="mt-6">
              <FichaFiscalConteudo contactId={contact.id} />
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
    </div>
  );
}
