import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  ArrowUpDown,
  Building2,
  FileBarChart,
  TrendingUp,
  Users,
  X,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveCompany, ClientCompany } from '@/contexts/CompanyContext';
import { NavLink } from '@/components/NavLink';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const CLIENT_LINKS = [
  { title: 'Dashboard', url: '/clientes/financeiro', icon: LayoutDashboard, end: true },
  { title: 'Lançamentos', url: '/clientes/financeiro/lancamentos', icon: ArrowLeftRight, end: false },
  { title: 'Pagar/Receber', url: '/clientes/financeiro/pagar-receber', icon: ArrowUpDown, end: false },
  { title: 'Conta Corrente', url: '/clientes/financeiro/conta-corrente', icon: Building2, end: false },
  { title: 'DRE', url: '/clientes/financeiro/dre', icon: FileBarChart, end: false },
  { title: 'Fluxo de Caixa', url: '/clientes/financeiro/fluxo-caixa', icon: TrendingUp, end: false },
];

interface Props {
  showLabels: boolean;
  onNavigate?: () => void;
}

// Seção "Financeiro dos Clientes" — só renderizada para super admin (ver AppSidebar).
// Seletor de empresa-cliente + navegação que reaproveita as telas do Financeiro,
// trocando a empresa em contexto via sessão de suporte (crachá auditável).
export function ClientesFinanceiroNav({ showLabels, onNavigate }: Props) {
  const navigate = useNavigate();
  const { selectedClient, selectClient, clearClient, supportSessionActive } = useActiveCompany();

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['client-companies-list'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_client_companies');
      if (error) throw error;
      return (data ?? []) as ClientCompany[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const handleSelect = (id: string) => {
    const client = clients.find((c) => c.id === id);
    if (!client) return;
    selectClient(client);
    navigate('/clientes/financeiro');
    onNavigate?.();
  };

  const handleClear = () => {
    clearClient();
    navigate('/');
    onNavigate?.();
  };

  if (!showLabels) {
    // Sidebar recolhida: só um ícone que leva à seção (o guard pede a seleção).
    return (
      <div className="px-1 py-2 flex justify-center">
        <NavLink
          to="/clientes/financeiro"
          onClick={onNavigate}
          className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          activeClassName="bg-accent text-primary"
        >
          <Users className="w-[18px] h-[18px]" strokeWidth={1.75} />
        </NavLink>
      </div>
    );
  }

  return (
    <div className="px-2 py-1 space-y-2">
      <Select value={selectedClient?.id ?? ''} onValueChange={handleSelect}>
        <SelectTrigger className="h-9 text-[13px]">
          <SelectValue placeholder={isLoading ? 'Carregando…' : 'Selecionar cliente'} />
        </SelectTrigger>
        <SelectContent>
          {clients.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">
              Nenhuma empresa com módulo financeiro.
            </div>
          ) : (
            clients.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-[13px]">
                {c.name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      {selectedClient && (
        <>
          <div className="flex items-center justify-between px-1">
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500">
              <ShieldCheck className="w-3 h-3" />
              {supportSessionActive ? 'Acesso registrado' : 'Abrindo acesso…'}
            </span>
            <button
              onClick={handleClear}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors"
            >
              <X className="w-3 h-3" /> Encerrar
            </button>
          </div>

          <nav className="space-y-0.5">
            {CLIENT_LINKS.map((item) => (
              <NavLink
                key={item.url}
                to={item.url}
                end={item.end}
                onClick={onNavigate}
                className="flex items-center gap-2 pl-3 pr-3 py-1.5 rounded-lg text-[13px] text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-[background,color] duration-[120ms]"
                activeClassName="bg-accent text-primary font-medium"
              >
                <item.icon className="w-[16px] h-[16px] shrink-0 opacity-60" strokeWidth={1.75} />
                <span className="flex-1 truncate">{item.title}</span>
              </NavLink>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
