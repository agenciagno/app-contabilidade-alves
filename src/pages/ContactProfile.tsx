import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowLeft, Loader2, Save, User, DollarSign, ClipboardList, History, KeyRound, Landmark, Users, Handshake, Calculator, StickyNote, FileBarChart, Link2 } from 'lucide-react';
import { useContacts } from '@/hooks/useContacts';
import { useContactTransactions, useContactFinancialStatus } from '@/hooks/useContactTransactions';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { ContactFinancialTab } from '@/components/contacts/ContactFinancialTab';
import { AcessosTab } from '@/components/contacts/AcessosTab';
import { ContactCadastroTab } from '@/components/contacts/cadastro/ContactCadastroTab';
import { PerfilSalvarProvider, usePerfilSalvar } from '@/components/contacts/cadastro/PerfilSalvar';
import { ContactLogsWithComunicacaoTab } from '@/components/contacts/ContactLogsWithComunicacaoTab';
import { getDocumentType } from '@/lib/utils';
import { FaixaStatusCliente } from '@/components/contacts/FaixaStatusCliente';
import { PerfilResumoCard } from '@/components/contacts/PerfilResumoCard';
import { FichaFiscalConteudo } from '@/components/monitor/FichaFiscal';
import { ClienteLinkTab } from '@/components/contacts/ClienteLinkTab';
import { useSidebar } from '@/components/ui/sidebar';
import { AssistenteCadastroBarra } from '@/components/contacts/cadastro/AssistenteCadastroBarra';
import { ETAPAS_CADASTRO, EtapaCadastro, useOnboardingCadastro } from '@/hooks/useOnboardingCadastro';

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
  // Link do cliente (documentos e boas-vindas, 17/10/2026) segue a permissão do Cadastro, como Observações.
  const canViewLink = canViewCadastro;
  const { isInadimplente } = useContactFinancialStatus(id, transactions);

  // Sub-aba aberta (controlada): o botão Salvar do rodapé salva a que estiver aberta. null = ainda a padrão (calculada mais abaixo).
  // ?aba=link abre direto uma sub-aba (ex.: aviso de documento enviado pelo cliente).
  const [searchParams, setSearchParams] = useSearchParams();
  const [abaEscolhida, setAbaEscolhida] = useState<string | null>(() => searchParams.get('aba'));
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
  const abaAtiva = abaEscolhida ?? defaultProfileTab;
  const salvarPerfil = usePerfilSalvar(abaAtiva);

  // Assistente de cadastro (17/10/2026): ?assistente=1 percorre as sub-abas na ordem do cadastro, com Voltar, Pular e Salvar e continuar.
  const onboarding = useOnboardingCadastro(id);
  const etapasAssistente = ETAPAS_CADASTRO.filter(e => {
    const visivel = { cadastro: canViewCadastro, societario: canViewSocios, fiscal: canViewFiscal, operacional: canViewOperacional, financeiro: canViewFinanceiro, link: canViewLink }[e.etapa];
    return visivel && onboarding.statusDe(e.etapa) !== null;
  });
  const modoAssistente = searchParams.get('assistente') === '1' && etapasAssistente.length > 0;
  const etapaAtual = etapasAssistente.find(e => e.etapa === abaAtiva)?.etapa ?? null;
  // Ao entrar no assistente, abre a primeira etapa ainda não concluída (uma vez só; depois quem manda é o usuário).
  const assistenteIniciado = useRef(false);
  useEffect(() => {
    // Rearma só depois que a URL já saiu do assistente: rearmar antes deixava um render no meio reabrir a primeira etapa pendente.
    if (!modoAssistente) { assistenteIniciado.current = false; return; }
    if (assistenteIniciado.current) return;
    assistenteIniciado.current = true;
    const primeira = etapasAssistente.find(e => onboarding.statusDe(e.etapa) !== 'concluido') ?? etapasAssistente[0];
    setAbaEscolhida(primeira.etapa);
  }, [modoAssistente, etapasAssistente, onboarding]);

  const sairDoAssistente = () => {
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete('assistente'); return p; }, { replace: true });
  };
  const irParaEtapa = (etapa: EtapaCadastro) => setAbaEscolhida(etapa);
  const avancar = (de: EtapaCadastro, statusDaAtual: 'concluido' | 'pulado') => {
    const i = etapasAssistente.findIndex(e => e.etapa === de);
    const proxima = etapasAssistente[i + 1];
    if (proxima) { setAbaEscolhida(proxima.etapa); return; }
    // Última etapa: resume o que ficou para depois e volta ao perfil normal.
    const faltam = etapasAssistente.filter(e => e.etapa !== de && onboarding.statusDe(e.etapa) !== 'concluido').length + (statusDaAtual === 'pulado' ? 1 : 0);
    if (faltam === 0) toast.success('Cadastro concluído');
    else toast.success('Cadastro salvo', { description: `${faltam} etapa(s) ficaram para depois. Use "Continuar cadastro" no resumo.` });
    sairDoAssistente();
  };
  const proximaEtapa = async () => {
    // Numa sub-aba fora do cadastro (ex.: Logs), os botões trazem de volta para a primeira etapa.
    if (!etapaAtual) { setAbaEscolhida(etapasAssistente[0].etapa); return; }
    const ok = await salvarPerfil.salvar();
    if (!ok) return;
    try {
      await onboarding.marcar.mutateAsync({ etapa: etapaAtual, status: 'concluido' });
    } catch {
      toast.error('Os dados foram salvos, mas o progresso do cadastro não. Tente de novo.');
      return;
    }
    avancar(etapaAtual, 'concluido');
  };
  const pularEtapa = async () => {
    // Numa sub-aba fora do cadastro (ex.: Logs), os botões trazem de volta para a primeira etapa.
    if (!etapaAtual) { setAbaEscolhida(etapasAssistente[0].etapa); return; }
    // Etapa já concluída antes continua concluída: pular só passa adiante.
    if (onboarding.statusDe(etapaAtual) !== 'concluido') {
      try {
        await onboarding.marcar.mutateAsync({ etapa: etapaAtual, status: 'pulado' });
      } catch {
        toast.error('Não foi possível marcar a etapa. Tente de novo.');
        return;
      }
    }
    avancar(etapaAtual, onboarding.statusDe(etapaAtual) === 'concluido' ? 'concluido' : 'pulado');
  };
  const voltarEtapa = () => {
    const i = etapasAssistente.findIndex(e => e.etapa === etapaAtual);
    if (i > 0) setAbaEscolhida(etapasAssistente[i - 1].etapa);
  };
  const continuarCadastro = () => {
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('assistente', '1'); return p; }, { replace: true });
  };

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
    canViewAcessos, canViewFinanceiro, canViewOperacional, canViewObservacoes, canViewRelatorios, canViewLogs, canViewLink,
  ].filter(Boolean).length;
  // Sub-abas só com ícone e tooltip, fixas no rodapé do box (17/10/2026). Aba ativa: fundo azul e ícone branco (token da ação primária).
  const abas = [
    { valor: 'cadastro', rotulo: 'Cadastro', Icone: ClipboardList, visivel: canViewCadastro },
    { valor: 'societario', rotulo: 'Societário', Icone: Handshake, visivel: canViewSocios },
    { valor: 'fiscal', rotulo: 'Fiscal', Icone: Landmark, visivel: canViewFiscal },
    { valor: 'pessoal', rotulo: 'Pessoal', Icone: Users, visivel: canViewPessoal },
    { valor: 'contabil', rotulo: 'Contábil', Icone: Calculator, visivel: canViewContabil },
    { valor: 'acessos', rotulo: 'Acessos', Icone: KeyRound, visivel: canViewAcessos },
    { valor: 'financeiro', rotulo: 'Financeiro', Icone: DollarSign, visivel: canViewFinanceiro },
    { valor: 'operacional', rotulo: 'Operacional', Icone: User, visivel: canViewOperacional },
    { valor: 'observacoes', rotulo: 'Observações', Icone: StickyNote, visivel: canViewObservacoes },
    { valor: 'link', rotulo: 'Link do cliente', Icone: Link2, visivel: canViewLink },
    { valor: 'relatorios', rotulo: 'Relatórios', Icone: FileBarChart, visivel: canViewRelatorios },
    { valor: 'logs', rotulo: 'Logs', Icone: History, visivel: canViewLogs },
  ].filter(a => a.visivel);

  return (
    // Duas colunas 20/80: resumo à esquerda e as sub-abas à direita. No desktop a página não rola: as duas colunas ocupam a altura
    // da tela (data-ocupa-tela, ver AppLayout), as sub-abas ficam paradas e só o conteúdo de dentro rola. Abaixo de `lg` empilha e a página rola.
    <div
      data-ocupa-tela
      className="grid grid-cols-1 gap-3 lg:h-full lg:grid-cols-[minmax(240px,20%)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]"
    >
      <PerfilResumoCard
        contact={contact}
        inadimplente={isInadimplente}
        onVoltar={() => navigate('/contatos')}
        cadastroPendente={!modoAssistente && onboarding.temOnboarding && !onboarding.completo
          ? { concluidas: onboarding.concluidas, total: onboarding.total, onContinuar: continuarCadastro }
          : undefined}
      />

      <div className="flex min-h-0 min-w-0 flex-col gap-3">
        <FaixaStatusCliente status={contact.status_cliente} desde={contact.status_cliente_desde} motivo={contact.status_cliente_motivo} />

        {modoAssistente && (
          <AssistenteCadastroBarra
            etapas={etapasAssistente}
            atual={etapaAtual ?? etapasAssistente[0].etapa}
            fluxo={onboarding.fluxo}
            statusDe={onboarding.statusDe}
            salvando={salvarPerfil.salvando || onboarding.marcar.isPending}
            onIr={irParaEtapa}
            onVoltar={voltarEtapa}
            onPular={pularEtapa}
            onProxima={proximaEtapa}
            onSair={sairDoAssistente}
          />
        )}

        {/* Tabs */}
        {visibleTabCount === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Sem permissão para ver o perfil deste cliente.
          </div>
        ) : (
        <PerfilSalvarProvider value={salvarPerfil.provider}>
        <Tabs
          value={abaAtiva}
          onValueChange={setAbaEscolhida}
          className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-lg border border-b-[3px] border-line border-b-action bg-paper shadow-sm"
        >
          {/* Só esta área rola (no desktop); a barra de ícones fica parada no rodapé do box. */}
          <div className="min-h-0 flex-1 p-3 lg:overflow-y-auto [&>[role=tabpanel]]:mt-0">
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

            {canViewLink && (
              <TabsContent value="link" className="mt-6">
                <ClienteLinkTab contact={contact} />
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
          </div>

          {/* Rodapé fixo do box: Salvar (um só, salva a sub-aba aberta) e as sub-abas em ícones. Em tela estreita (a página rola) sobe para o topo do box. */}
          <div className="grid shrink-0 items-center gap-1 border-t border-line p-1.5 lg:grid-cols-[1fr_auto_1fr] max-lg:order-first max-lg:border-b max-lg:border-t-0">
            <div className="lg:justify-self-start">
              {salvarPerfil.podeSalvar && (
                <Button size="sm" className="gap-2" onClick={salvarPerfil.salvar} disabled={salvarPerfil.salvando}>
                  {salvarPerfil.salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar
                </Button>
              )}
            </div>
            <TabsList className="h-auto flex-wrap justify-center gap-1 rounded-none bg-transparent p-0">
              {abas.map(({ valor, rotulo, Icone }) => (
                <Tooltip key={valor}>
                  {/* O tooltip fica num span em volta: no próprio TabsTrigger o data-state do tooltip trocaria o "active" da aba. */}
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <TabsTrigger
                        value={valor}
                        aria-label={rotulo}
                        className="h-9 w-9 shrink-0 rounded-md p-0 text-action transition-colors hover:bg-action-tint data-[state=active]:bg-action data-[state=active]:text-on-action data-[state=active]:shadow-none"
                      >
                        <Icone className="h-[18px] w-[18px]" />
                      </TabsTrigger>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">{rotulo}</TooltipContent>
                </Tooltip>
              ))}
            </TabsList>
            <div className="max-lg:hidden" />
          </div>
        </Tabs>
        </PerfilSalvarProvider>
        )}
      </div>
    </div>
  );
}
