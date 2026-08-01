import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { ModuleGuard } from "@/components/auth/ModuleGuard";
import { PwaUpdateBanner } from "@/components/PwaUpdateBanner";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";

// Pages
import Auth from "@/pages/Auth";
import RedefinirSenha from "@/pages/RedefinirSenha";
import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Transactions from "@/pages/Transactions";

import Contacts from "@/pages/Contacts";
import ContactProfile from "@/pages/ContactProfile";
import Banks from "@/pages/Banks";
import Categories from "@/pages/Categories";
import ClientCategories from "@/pages/ClientCategories";
import DRE from "@/pages/DRE";
import SettingsPage from "@/pages/SettingsPage";
import CrmDispatches from "@/pages/CrmDispatches";
import ClientReport from "@/pages/ClientReport";
import Boletos from "@/pages/Boletos";
import ConciliacaoSicoob from "@/pages/ConciliacaoSicoob";
import PagarReceber from "@/pages/PagarReceber";
import Parties from "@/pages/Parties";
import CashFlow from "@/pages/CashFlow";
import FiscalTasks from "@/pages/FiscalTasks";
import FiscalCalendar from "@/pages/FiscalCalendar";
import FiscalDashboard from "@/pages/FiscalDashboard";
import FiscalCollaborators from "@/pages/FiscalCollaborators";
import FiscalObrigacoes from "@/pages/FiscalObrigacoes";

import NoAccess from "@/pages/NoAccess";
import NotFound from "@/pages/NotFound";
import Newsletter from "@/pages/Newsletter";
import CofreGlobal from "@/pages/CofreGlobal";
import TechClientesExternos from "@/pages/TechClientesExternos";
import TechClienteExternoDetalhe from "@/pages/TechClienteExternoDetalhe";
import TechLGPD from "@/pages/TechLGPD";
import TechAgenteIA from "@/pages/TechAgenteIA";
import CentralNotificacoes from "@/pages/CentralNotificacoes";
import MetasOrcamentos from "@/pages/MetasOrcamentos";
import MinhaConta from "@/pages/MinhaConta";
import Suporte from "@/pages/Suporte";
import Faturas from "@/pages/Faturas";
import Equipe from "@/pages/Equipe";
import ReformaTributariaCalculadora from "@/pages/ReformaTributariaCalculadora";
import { EmBreve } from "@/components/EmBreve";


const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <PwaUpdateBanner />
          <PwaInstallBanner />
          <BrowserRouter>
            <NotificationProvider>
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

              <Route path="/contatos" element={<AppLayout><ModuleGuard moduleName="contatos"><Contacts /></ModuleGuard></AppLayout>} />
              <Route path="/crm/cliente/:id" element={<AppLayout><ModuleGuard moduleName="contatos"><ContactProfile /></ModuleGuard></AppLayout>} />

              <Route path="/bancos" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_conta_corrente"><Banks /></ModuleGuard></AppLayout>} />
              <Route path="/categorias" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_eventos_contabeis"><Categories /></ModuleGuard></AppLayout>} />
              <Route path="/financeiro/categorias-clientes" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_categorias"><ClientCategories /></ModuleGuard></AppLayout>} />
              <Route path="/dre" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_dre"><DRE /></ModuleGuard></AppLayout>} />
              
              <Route path="/configuracoes" element={<AppLayout><ModuleGuard moduleName="configuracoes" internalOnly><SettingsPage /></ModuleGuard></AppLayout>} />
              <Route path="/disparos" element={<AppLayout><ModuleGuard moduleName="tech" subModule="tech_disparos"><CrmDispatches /></ModuleGuard></AppLayout>} />
              <Route path="/relatorio-clientes" element={<AppLayout><ModuleGuard moduleName="contatos"><ClientReport /></ModuleGuard></AppLayout>} />

              <Route path="/boletos" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_boletos"><Boletos /></ModuleGuard></AppLayout>} />
              <Route path="/financeiro/conciliacao-sicoob" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_conciliacao_sicoob"><ConciliacaoSicoob /></ModuleGuard></AppLayout>} />
              <Route path="/fiscal/tarefas" element={<AppLayout><ModuleGuard moduleName="fiscal" subModule="fiscal_tarefas"><FiscalTasks /></ModuleGuard></AppLayout>} />
              <Route path="/fiscal/calendario" element={<AppLayout><ModuleGuard moduleName="fiscal" subModule="fiscal_calendario" requireAdmin><FiscalCalendar /></ModuleGuard></AppLayout>} />
              <Route path="/fiscal/dashboard" element={<AppLayout><ModuleGuard moduleName="fiscal" subModule="fiscal_dashboard" requireAdmin><FiscalDashboard /></ModuleGuard></AppLayout>} />
              <Route path="/fiscal/colaboradores" element={<AppLayout><ModuleGuard moduleName="fiscal" subModule="fiscal_colaboradores" requireAdmin><FiscalCollaborators /></ModuleGuard></AppLayout>} />
              <Route path="/fiscal/obrigacoes" element={<AppLayout><ModuleGuard moduleName="fiscal" subModule="fiscal_calendario" requireAdmin><FiscalObrigacoes /></ModuleGuard></AppLayout>} />
              
              <Route path="/acessos" element={<AppLayout><ModuleGuard moduleName="acessos"><CofreGlobal /></ModuleGuard></AppLayout>} />
              <Route path="/tech/clientes-externos" element={<AppLayout><TechClientesExternos /></AppLayout>} />
              <Route path="/tech/clientes-externos/:id" element={<AppLayout><TechClienteExternoDetalhe /></AppLayout>} />
              {/* Rotas antigas: atalho fixado e link salvo continuam funcionando. */}
              <Route path="/admin/provisionar-cliente" element={<Navigate to="/tech/clientes-externos" replace />} />
              <Route path="/tech/operacao" element={<Navigate to="/tech/clientes-externos" replace />} />
              <Route path="/tech/lgpd" element={<AppLayout><TechLGPD /></AppLayout>} />
              <Route path="/tech/agente-ia" element={<AppLayout><TechAgenteIA /></AppLayout>} />
              <Route path="/central-notificacoes" element={<AppLayout><CentralNotificacoes /></AppLayout>} />

              {/* Conta do usuário */}
              <Route path="/minha-conta" element={<AppLayout><MinhaConta /></AppLayout>} />
              <Route path="/suporte" element={<AppLayout><Suporte /></AppLayout>} />
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

              {/* Cadastros */}
              <Route path="/cadastros/procuracoes" element={<AppLayout><ModuleGuard moduleName="cadastros_procuracoes"><EmBreve moduleKey="cadastros_procuracoes" /></ModuleGuard></AppLayout>} />
              <Route path="/cadastros/certificados" element={<AppLayout><ModuleGuard moduleName="cadastros_certificados"><EmBreve moduleKey="cadastros_certificados" /></ModuleGuard></AppLayout>} />
              <Route path="/cadastros/alvaras" element={<AppLayout><ModuleGuard moduleName="cadastros_alvaras"><EmBreve moduleKey="cadastros_alvaras" /></ModuleGuard></AppLayout>} />
              <Route path="/cadastros/equipe" element={<AppLayout><ModuleGuard moduleName="equipe"><Equipe /></ModuleGuard></AppLayout>} />

              <Route path="*" element={<NotFound />} />
              </Routes>
            </NotificationProvider>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
