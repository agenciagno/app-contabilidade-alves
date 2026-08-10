import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { ViewModeProvider } from "@/contexts/ViewModeContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { ModuleGuard } from "@/components/auth/ModuleGuard";
import { AudienceGuard } from "@/components/auth/AudienceGuard";
import { PwaUpdateBanner } from "@/components/PwaUpdateBanner";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";

// Páginas de entrada ficam no bundle inicial; o resto carrega sob demanda por rota.
import Auth from "@/pages/Auth";
import RedefinirSenha from "@/pages/RedefinirSenha";
import NoAccess from "@/pages/NoAccess";
import NotFound from "@/pages/NotFound";
import { EmBreve } from "@/components/EmBreve";

const Home = lazy(() => import("@/pages/Home"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Transactions = lazy(() => import("@/pages/Transactions"));
const Contacts = lazy(() => import("@/pages/Contacts"));
const ContactProfile = lazy(() => import("@/pages/ContactProfile"));
const Banks = lazy(() => import("@/pages/Banks"));
const Categories = lazy(() => import("@/pages/Categories"));
const ClientCategories = lazy(() => import("@/pages/ClientCategories"));
const DRE = lazy(() => import("@/pages/DRE"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const CrmDispatches = lazy(() => import("@/pages/CrmDispatches"));
const ClientReport = lazy(() => import("@/pages/ClientReport"));
const Boletos = lazy(() => import("@/pages/Boletos"));
const ConciliacaoSicoob = lazy(() => import("@/pages/ConciliacaoSicoob"));
const PagarReceber = lazy(() => import("@/pages/PagarReceber"));
const Parties = lazy(() => import("@/pages/Parties"));
const CashFlow = lazy(() => import("@/pages/CashFlow"));
const FiscalTasks = lazy(() => import("@/pages/FiscalTasks"));
const FiscalCalendar = lazy(() => import("@/pages/FiscalCalendar"));
const FiscalDashboard = lazy(() => import("@/pages/FiscalDashboard"));
const FiscalCollaborators = lazy(() => import("@/pages/FiscalCollaborators"));
const FiscalObrigacoes = lazy(() => import("@/pages/FiscalObrigacoes"));
const Newsletter = lazy(() => import("@/pages/Newsletter"));
const CofreGlobal = lazy(() => import("@/pages/CofreGlobal"));
const TechClientesExternos = lazy(() => import("@/pages/TechClientesExternos"));
const TechClienteExternoDetalhe = lazy(() => import("@/pages/TechClienteExternoDetalhe"));
const TechLGPD = lazy(() => import("@/pages/TechLGPD"));
const TechAgenteIA = lazy(() => import("@/pages/TechAgenteIA"));
const CentralNotificacoes = lazy(() => import("@/pages/CentralNotificacoes"));
const MetasOrcamentos = lazy(() => import("@/pages/MetasOrcamentos"));
const MinhaConta = lazy(() => import("@/pages/MinhaConta"));
const Suporte = lazy(() => import("@/pages/Suporte"));
const Faturas = lazy(() => import("@/pages/Faturas"));
const Equipe = lazy(() => import("@/pages/Equipe"));
const ReformaTributariaCalculadora = lazy(() => import("@/pages/ReformaTributariaCalculadora"));

const RouteFallback = () => (
  <div className="flex h-screen w-full items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
  </div>
);
// Com v7_startTransition no router, trocar de rota mantém a tela atual até o
// chunk da próxima página chegar — este fallback externo só aparece em carga
// direta por URL (primeiro paint), nunca na navegação interna. O fallback de
// navegação (miolo do conteúdo, sidebar fixa) vive no AppLayout.


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dados considerados frescos por 60s: trocar de aba/janela não refaz
      // todas as queries da tela. Realtime (notificações) usa canal próprio
      // e invalidações explícitas continuam funcionando normalmente.
      staleTime: 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <ViewModeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <PwaUpdateBanner />
          <PwaInstallBanner />
          <BrowserRouter future={{ v7_startTransition: true }}>
            <NotificationProvider>
              <Suspense fallback={<RouteFallback />}>
              <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/redefinir-senha" element={<RedefinirSenha />} />
              <Route path="/newsletter/:slug" element={<Newsletter />} />
              <Route path="/sem-acesso" element={<NoAccess />} />
              <Route path="/" element={<AppLayout><ModuleGuard moduleName="home"><Home /></ModuleGuard></AppLayout>} />
              <Route path="/painel-financeiro" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_dashboard"><Dashboard /></ModuleGuard></AppLayout>} />
              <Route path="/movimentacoes" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_lancamentos"><Transactions /></ModuleGuard></AppLayout>} />
              <Route path="/financeiro/pagar-receber" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_pagar_receber"><PagarReceber /></ModuleGuard></AppLayout>} />
              <Route path="/financeiro/clientes-fornecedores" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_clientes_fornecedores"><Parties /></ModuleGuard></AppLayout>} />
              <Route path="/financeiro/fluxo-caixa" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_fluxo_caixa"><CashFlow /></ModuleGuard></AppLayout>} />
              <Route path="/financeiro/metas-orcamentos" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_metas_orcamentos"><MetasOrcamentos /></ModuleGuard></AppLayout>} />

              <Route path="/contatos" element={<AppLayout><ModuleGuard moduleName="cadastro" subModule="contatos"><Contacts /></ModuleGuard></AppLayout>} />
              <Route path="/crm/cliente/:id" element={<AppLayout><ModuleGuard moduleName="cadastro" subModule="contatos"><ContactProfile /></ModuleGuard></AppLayout>} />

              <Route path="/bancos" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_conta_corrente"><Banks /></ModuleGuard></AppLayout>} />
              <Route path="/categorias" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_eventos_contabeis"><Categories /></ModuleGuard></AppLayout>} />
              <Route path="/financeiro/categorias-clientes" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_categorias"><ClientCategories /></ModuleGuard></AppLayout>} />
              <Route path="/dre" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_dre"><DRE /></ModuleGuard></AppLayout>} />
              
              <Route path="/configuracoes" element={<AppLayout><ModuleGuard moduleName="configuracoes" internalOnly><SettingsPage /></ModuleGuard></AppLayout>} />
              <Route path="/disparos" element={<AppLayout><ModuleGuard moduleName="tech" subModule="tech_disparos"><CrmDispatches /></ModuleGuard></AppLayout>} />
              <Route path="/relatorio-clientes" element={<AppLayout><ModuleGuard moduleName="cadastro" subModule="contatos"><ClientReport /></ModuleGuard></AppLayout>} />

              <Route path="/boletos" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_boletos"><Boletos /></ModuleGuard></AppLayout>} />
              <Route path="/financeiro/conciliacao-sicoob" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_conciliacao_sicoob"><ConciliacaoSicoob /></ModuleGuard></AppLayout>} />
              <Route path="/fiscal/tarefas" element={<AppLayout><ModuleGuard moduleName="fiscal" subModule="fiscal_tarefas"><FiscalTasks /></ModuleGuard></AppLayout>} />
              <Route path="/fiscal/calendario" element={<AppLayout><ModuleGuard moduleName="fiscal" subModule="fiscal_calendario" requireAdmin><FiscalCalendar /></ModuleGuard></AppLayout>} />
              <Route path="/fiscal/dashboard" element={<AppLayout><ModuleGuard moduleName="fiscal" subModule="fiscal_dashboard" requireAdmin><FiscalDashboard /></ModuleGuard></AppLayout>} />
              <Route path="/fiscal/colaboradores" element={<AppLayout><ModuleGuard moduleName="fiscal" subModule="fiscal_colaboradores" requireAdmin><FiscalCollaborators /></ModuleGuard></AppLayout>} />
              <Route path="/fiscal/obrigacoes" element={<AppLayout><ModuleGuard moduleName="fiscal" subModule="fiscal_obrigacoes_declaracoes" requireAdmin><FiscalObrigacoes /></ModuleGuard></AppLayout>} />

              <Route path="/acessos" element={<AppLayout><ModuleGuard moduleName="cadastro" subModule="acessos"><CofreGlobal /></ModuleGuard></AppLayout>} />
              {/* Audiência por rota Tech (decisão Gabriel 10/08): Clientes Externos
                  e LGPD vivem no Sistema Externo; Agente IA no Interno. As telas
                  continuam checando papel (super admin/admin) por conta própria. */}
              <Route path="/tech/clientes-externos" element={<AppLayout><AudienceGuard audience="external"><TechClientesExternos /></AudienceGuard></AppLayout>} />
              <Route path="/tech/clientes-externos/:id" element={<AppLayout><AudienceGuard audience="external"><TechClienteExternoDetalhe /></AudienceGuard></AppLayout>} />
              {/* Rotas antigas: atalho fixado e link salvo continuam funcionando. */}
              <Route path="/admin/provisionar-cliente" element={<Navigate to="/tech/clientes-externos" replace />} />
              <Route path="/tech/operacao" element={<Navigate to="/tech/clientes-externos" replace />} />
              <Route path="/tech/lgpd" element={<AppLayout><AudienceGuard audience="external"><TechLGPD /></AudienceGuard></AppLayout>} />
              <Route path="/tech/agente-ia" element={<AppLayout><AudienceGuard audience="internal"><TechAgenteIA /></AudienceGuard></AppLayout>} />
              <Route path="/central-notificacoes" element={<AppLayout><CentralNotificacoes /></AppLayout>} />

              {/* Conta do usuário */}
              <Route path="/minha-conta" element={<AppLayout><MinhaConta /></AppLayout>} />
              <Route path="/suporte" element={<AppLayout><ModuleGuard moduleName="suporte"><Suporte /></ModuleGuard></AppLayout>} />
              <Route path="/faturas" element={<AppLayout><Faturas /></AppLayout>} />

              {/* Reforma Tributária */}
              <Route path="/reforma-tributaria" element={<AppLayout><ModuleGuard moduleName="reforma_tributaria" subModule="reforma_tributaria_painel"><EmBreve moduleKey="reforma_tributaria" /></ModuleGuard></AppLayout>} />
              <Route path="/reforma-tributaria/calculadora" element={<AppLayout><ModuleGuard moduleName="reforma_tributaria" subModule="reforma_tributaria_calculadora"><ReformaTributariaCalculadora /></ModuleGuard></AppLayout>} />

              {/* Gestão 360° */}
              <Route path="/gestao-360/portal" element={<AppLayout><ModuleGuard moduleName="gestao360" subModule="gestao360_portal"><EmBreve moduleKey="gestao360_portal" /></ModuleGuard></AppLayout>} />
              <Route path="/gestao-360/ausencias" element={<AppLayout><ModuleGuard moduleName="gestao360" subModule="gestao360_ausencias"><EmBreve moduleKey="gestao360_ausencias" /></ModuleGuard></AppLayout>} />
              <Route path="/gestao-360/diagnosticos" element={<AppLayout><ModuleGuard moduleName="gestao360" subModule="gestao360_diagnosticos"><EmBreve moduleKey="gestao360_diagnosticos" /></ModuleGuard></AppLayout>} />
              <Route path="/gestao-360/indicadores" element={<AppLayout><ModuleGuard moduleName="gestao360" subModule="gestao360_indicadores"><EmBreve moduleKey="gestao360_indicadores" /></ModuleGuard></AppLayout>} />

              {/* Tarefas — subrotas novas */}
              <Route path="/fiscal/obrigacoes-fiscais" element={<AppLayout><ModuleGuard moduleName="fiscal" subModule="fiscal_obrigacoes" requireAdmin><EmBreve moduleKey="fiscal_obrigacoes" /></ModuleGuard></AppLayout>} />
              <Route path="/fiscal/agenda" element={<AppLayout><ModuleGuard moduleName="fiscal" subModule="fiscal_agenda" requireAdmin><EmBreve moduleKey="fiscal_agenda" /></ModuleGuard></AppLayout>} />

              {/* Monitoramento */}
              <Route path="/mensagens" element={<AppLayout><ModuleGuard moduleName="mensagens"><EmBreve moduleKey="mensagens" /></ModuleGuard></AppLayout>} />
              <Route path="/dashboard-federal" element={<AppLayout><ModuleGuard moduleName="dashboard_federal"><EmBreve moduleKey="dashboard_federal" /></ModuleGuard></AppLayout>} />
              <Route path="/parcelamentos" element={<AppLayout><ModuleGuard moduleName="parcelamentos"><EmBreve moduleKey="parcelamentos" /></ModuleGuard></AppLayout>} />
              <Route path="/certidoes" element={<AppLayout><ModuleGuard moduleName="certidoes"><EmBreve moduleKey="certidoes" /></ModuleGuard></AppLayout>} />
              <Route path="/processos" element={<AppLayout><ModuleGuard moduleName="processos"><EmBreve moduleKey="processos" /></ModuleGuard></AppLayout>} />

              {/* Diagnóstico Fiscal */}
              <Route path="/score-fiscal" element={<AppLayout><ModuleGuard moduleName="score_fiscal"><EmBreve moduleKey="score_fiscal" /></ModuleGuard></AppLayout>} />
              <Route path="/analise-fiscal" element={<AppLayout><ModuleGuard moduleName="analise_fiscal"><EmBreve moduleKey="analise_fiscal" /></ModuleGuard></AppLayout>} />
              <Route path="/simulador-tributario" element={<AppLayout><ModuleGuard moduleName="simulador_tributario"><EmBreve moduleKey="simulador_tributario" /></ModuleGuard></AppLayout>} />
              <Route path="/diagnostico-ca" element={<AppLayout><ModuleGuard moduleName="diagnostico_ca"><EmBreve moduleKey="diagnostico_ca" /></ModuleGuard></AppLayout>} />

              {/* Cadastro */}
              <Route path="/cadastros/procuracoes" element={<AppLayout><ModuleGuard moduleName="cadastro" subModule="cadastros_procuracoes"><EmBreve moduleKey="cadastros_procuracoes" /></ModuleGuard></AppLayout>} />
              <Route path="/cadastros/certificados" element={<AppLayout><ModuleGuard moduleName="cadastro" subModule="cadastros_certificados"><EmBreve moduleKey="cadastros_certificados" /></ModuleGuard></AppLayout>} />
              <Route path="/cadastros/alvaras" element={<AppLayout><ModuleGuard moduleName="cadastro" subModule="cadastros_alvaras"><EmBreve moduleKey="cadastros_alvaras" /></ModuleGuard></AppLayout>} />
              <Route path="/cadastros/equipe" element={<AppLayout><ModuleGuard moduleName="cadastro" subModule="equipe"><Equipe /></ModuleGuard></AppLayout>} />

              <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
            </NotificationProvider>
          </BrowserRouter>
        </TooltipProvider>
        </ViewModeProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
