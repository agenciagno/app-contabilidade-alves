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
import PagarReceber from "@/pages/PagarReceber";
import FiscalTasks from "@/pages/FiscalTasks";
import FiscalCalendar from "@/pages/FiscalCalendar";
import FiscalDashboard from "@/pages/FiscalDashboard";
import FiscalCollaborators from "@/pages/FiscalCollaborators";
import FiscalNotifications from "@/pages/FiscalNotifications";
import MonitorCNPJ from "@/pages/MonitorCNPJ";
import Legalizacao from "@/pages/Legalizacao";
import PessoalRH from "@/pages/PessoalRH";
import NoAccess from "@/pages/NoAccess";
import NotFound from "@/pages/NotFound";
import Newsletter from "@/pages/Newsletter";
import CofreGlobal from "@/pages/CofreGlobal";

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
              <Route path="/painel-financeiro" element={<AppLayout><ModuleGuard moduleName="financeiro"><Dashboard /></ModuleGuard></AppLayout>} />
              <Route path="/movimentacoes" element={<AppLayout><ModuleGuard moduleName="financeiro"><Transactions /></ModuleGuard></AppLayout>} />
              <Route path="/financeiro/pagar-receber" element={<AppLayout><ModuleGuard moduleName="financeiro"><PagarReceber /></ModuleGuard></AppLayout>} />
              
              <Route path="/contatos" element={<AppLayout><ModuleGuard moduleName="clientes"><Contacts /></ModuleGuard></AppLayout>} />
              <Route path="/crm/cliente/:id" element={<AppLayout><ModuleGuard moduleName="clientes"><ContactProfile /></ModuleGuard></AppLayout>} />
              <Route path="/bancos" element={<AppLayout><ModuleGuard moduleName="financeiro"><Banks /></ModuleGuard></AppLayout>} />
              <Route path="/categorias" element={<AppLayout><ModuleGuard moduleName="financeiro"><Categories /></ModuleGuard></AppLayout>} />
              <Route path="/dre" element={<AppLayout><ModuleGuard moduleName="financeiro"><DRE /></ModuleGuard></AppLayout>} />
              
              <Route path="/configuracoes" element={<AppLayout><ModuleGuard moduleName="configuracoes"><SettingsPage /></ModuleGuard></AppLayout>} />
              <Route path="/disparos" element={<AppLayout><ModuleGuard moduleName="clientes"><CrmDispatches /></ModuleGuard></AppLayout>} />
              <Route path="/relatorio-clientes" element={<AppLayout><ModuleGuard moduleName="clientes"><ClientReport /></ModuleGuard></AppLayout>} />
              <Route path="/boletos" element={<AppLayout><ModuleGuard moduleName="financeiro"><Boletos /></ModuleGuard></AppLayout>} />
              <Route path="/fiscal/tarefas" element={<AppLayout><ModuleGuard moduleName="fiscal"><FiscalTasks /></ModuleGuard></AppLayout>} />
              <Route path="/fiscal/calendario" element={<AppLayout><ModuleGuard moduleName="fiscal" requireAdmin><FiscalCalendar /></ModuleGuard></AppLayout>} />
              <Route path="/fiscal/dashboard" element={<AppLayout><ModuleGuard moduleName="fiscal" requireAdmin><FiscalDashboard /></ModuleGuard></AppLayout>} />
              <Route path="/fiscal/colaboradores" element={<AppLayout><ModuleGuard moduleName="fiscal" requireAdmin><FiscalCollaborators /></ModuleGuard></AppLayout>} />
              <Route path="/fiscal/notificacoes" element={<AppLayout><ModuleGuard moduleName="fiscal" requireAdmin><FiscalNotifications /></ModuleGuard></AppLayout>} />
              <Route path="/legalizacao" element={<AppLayout><ModuleGuard moduleName="legalizacao"><Legalizacao /></ModuleGuard></AppLayout>} />
              <Route path="/pessoal-rh" element={<AppLayout><ModuleGuard moduleName="pessoal_rh"><PessoalRH /></ModuleGuard></AppLayout>} />
              <Route path="/acessos" element={<AppLayout><CofreGlobal /></AppLayout>} />
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
