import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { ModuleGuard } from "@/components/auth/ModuleGuard";
import { PwaUpdateBanner } from "@/components/PwaUpdateBanner";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";

// Pages
import Auth from "@/pages/Auth";
import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Transactions from "@/pages/Transactions";

import Contacts from "@/pages/Contacts";
import ContactProfile from "@/pages/ContactProfile";
import Banks from "@/pages/Banks";
import Categories from "@/pages/Categories";
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

import MonitorCNPJ from "@/pages/MonitorCNPJ";
import Legalizacao from "@/pages/Legalizacao";
import PessoalRH from "@/pages/PessoalRH";
import NoAccess from "@/pages/NoAccess";
import NotFound from "@/pages/NotFound";
import Newsletter from "@/pages/Newsletter";
import CofreGlobal from "@/pages/CofreGlobal";
import AdminProvisionarCliente from "@/pages/AdminProvisionarCliente";
import TechOperacao from "@/pages/TechOperacao";
import TechLGPD from "@/pages/TechLGPD";
import CentralNotificacoes from "@/pages/CentralNotificacoes";
import MetasOrcamentos from "@/pages/MetasOrcamentos";


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
              <Route path="/newsletter/:slug" element={<Newsletter />} />
              <Route path="/sem-acesso" element={<NoAccess />} />
              <Route path="/" element={<AppLayout><ModuleGuard moduleName="home"><Home /></ModuleGuard></AppLayout>} />
              <Route path="/painel-financeiro" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_dashboard"><Dashboard /></ModuleGuard></AppLayout>} />
              <Route path="/movimentacoes" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_lancamentos"><Transactions /></ModuleGuard></AppLayout>} />
              <Route path="/financeiro/pagar-receber" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_pagar_receber"><PagarReceber /></ModuleGuard></AppLayout>} />
              <Route path="/financeiro/clientes-fornecedores" element={<AppLayout><ModuleGuard moduleName="financeiro"><Parties /></ModuleGuard></AppLayout>} />
              <Route path="/financeiro/fluxo-caixa" element={<AppLayout><ModuleGuard moduleName="financeiro"><CashFlow /></ModuleGuard></AppLayout>} />
              <Route path="/financeiro/metas-orcamentos" element={<AppLayout><ModuleGuard moduleName="financeiro"><MetasOrcamentos /></ModuleGuard></AppLayout>} />

              <Route path="/contatos" element={<AppLayout><ModuleGuard moduleName="contatos"><Contacts /></ModuleGuard></AppLayout>} />
              <Route path="/crm/cliente/:id" element={<AppLayout><ModuleGuard moduleName="contatos"><ContactProfile /></ModuleGuard></AppLayout>} />

              <Route path="/bancos" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_conta_corrente"><Banks /></ModuleGuard></AppLayout>} />
              <Route path="/categorias" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_eventos_contabeis"><Categories /></ModuleGuard></AppLayout>} />
              <Route path="/dre" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_dre"><DRE /></ModuleGuard></AppLayout>} />
              
              <Route path="/configuracoes" element={<AppLayout><ModuleGuard moduleName="configuracoes"><SettingsPage /></ModuleGuard></AppLayout>} />
              <Route path="/disparos" element={<AppLayout><ModuleGuard moduleName="tech" subModule="tech_disparos"><CrmDispatches /></ModuleGuard></AppLayout>} />
              <Route path="/relatorio-clientes" element={<AppLayout><ModuleGuard moduleName="contatos"><ClientReport /></ModuleGuard></AppLayout>} />

              <Route path="/boletos" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_boletos"><Boletos /></ModuleGuard></AppLayout>} />
              <Route path="/financeiro/conciliacao-sicoob" element={<AppLayout><ModuleGuard moduleName="financeiro" subModule="financeiro_conciliacao_sicoob"><ConciliacaoSicoob /></ModuleGuard></AppLayout>} />
              <Route path="/fiscal/tarefas" element={<AppLayout><ModuleGuard moduleName="fiscal" subModule="fiscal_tarefas"><FiscalTasks /></ModuleGuard></AppLayout>} />
              <Route path="/fiscal/calendario" element={<AppLayout><ModuleGuard moduleName="fiscal" subModule="fiscal_calendario" requireAdmin><FiscalCalendar /></ModuleGuard></AppLayout>} />
              <Route path="/fiscal/dashboard" element={<AppLayout><ModuleGuard moduleName="fiscal" subModule="fiscal_dashboard" requireAdmin><FiscalDashboard /></ModuleGuard></AppLayout>} />
              <Route path="/fiscal/colaboradores" element={<AppLayout><ModuleGuard moduleName="fiscal" subModule="fiscal_colaboradores" requireAdmin><FiscalCollaborators /></ModuleGuard></AppLayout>} />
              <Route path="/fiscal/obrigacoes" element={<AppLayout><ModuleGuard moduleName="fiscal" subModule="fiscal_calendario" requireAdmin><FiscalObrigacoes /></ModuleGuard></AppLayout>} />
              
              <Route path="/fiscal/monitor-cnpj" element={<AppLayout><ModuleGuard moduleName="fiscal" subModule="fiscal_monitor_cnpj" requireAdmin><MonitorCNPJ /></ModuleGuard></AppLayout>} />
              <Route path="/legalizacao" element={<AppLayout><ModuleGuard moduleName="legalizacao"><Legalizacao /></ModuleGuard></AppLayout>} />
              <Route path="/pessoal-rh" element={<AppLayout><ModuleGuard moduleName="pessoal_rh"><PessoalRH /></ModuleGuard></AppLayout>} />
              <Route path="/acessos" element={<AppLayout><ModuleGuard moduleName="acessos"><CofreGlobal /></ModuleGuard></AppLayout>} />
              <Route path="/admin/provisionar-cliente" element={<AppLayout><AdminProvisionarCliente /></AppLayout>} />
              <Route path="/tech/operacao" element={<AppLayout><TechOperacao /></AppLayout>} />
              <Route path="/tech/lgpd" element={<AppLayout><TechLGPD /></AppLayout>} />
              <Route path="/central-notificacoes" element={<AppLayout><CentralNotificacoes /></AppLayout>} />

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
