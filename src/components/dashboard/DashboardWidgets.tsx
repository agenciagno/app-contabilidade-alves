import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Settings2, TrendingUp, TrendingDown, Wallet, Clock, DollarSign, PiggyBank, BarChart3, CreditCard, FileText } from 'lucide-react';

export interface WidgetConfig {
  id: string;
  name: string;
  enabled: boolean;
  icon: React.ReactNode;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'receitasRecebidas', name: 'Receitas Recebidas', enabled: true, icon: <TrendingUp className="h-4 w-4" /> },
  { id: 'receitasAReceber', name: 'Receitas a Receber', enabled: true, icon: <PiggyBank className="h-4 w-4" /> },
  { id: 'contasPagas', name: 'Contas Pagas', enabled: true, icon: <TrendingDown className="h-4 w-4" /> },
  { id: 'contasAPagar', name: 'Contas a Pagar', enabled: true, icon: <CreditCard className="h-4 w-4" /> },
  { id: 'saldoBancario', name: 'Saldo Bancário', enabled: true, icon: <Wallet className="h-4 w-4" /> },
  { id: 'caixaGeral', name: 'Banco Invisível', enabled: false, icon: <Wallet className="h-4 w-4" /> },
  { id: 'evolution', name: 'Evolução Mensal', enabled: true, icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'revenueCategoryChart', name: 'Receitas por Evento Contábil', enabled: true, icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'categoryChart', name: 'Despesas por Evento Contábil', enabled: true, icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'pendingList', name: 'Contas Pendentes', enabled: true, icon: <FileText className="h-4 w-4" /> },
  { id: 'recentTransactions', name: 'Últimas Movimentações', enabled: true, icon: <TrendingUp className="h-4 w-4" /> },
  { id: 'dre', name: 'Resultado Operacional (DRE)', enabled: true, icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'periodComparison', name: 'Comparativo de Períodos', enabled: true, icon: <TrendingUp className="h-4 w-4" /> },
  { id: 'cashFlowForecast', name: 'Fluxo de Caixa Previsto', enabled: true, icon: <TrendingDown className="h-4 w-4" /> },
];

const STORAGE_KEY = 'dashboard-widgets-config';

export function useDashboardWidgets() {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Merge with defaults to handle new widgets
        return DEFAULT_WIDGETS.map(dw => {
          const saved = parsed.find((p: WidgetConfig) => p.id === dw.id);
          return saved ? { ...dw, enabled: saved.enabled } : dw;
        });
      } catch {
        return DEFAULT_WIDGETS;
      }
    }
    return DEFAULT_WIDGETS;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets.map(w => ({ id: w.id, enabled: w.enabled }))));
  }, [widgets]);

  const toggleWidget = (id: string) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w));
  };

  const isWidgetEnabled = (id: string) => {
    return widgets.find(w => w.id === id)?.enabled ?? true;
  };

  return { widgets, toggleWidget, isWidgetEnabled };
}

interface DashboardWidgetsConfigProps {
  widgets: WidgetConfig[];
  onToggle: (id: string) => void;
}

export function DashboardWidgetsConfig({ widgets, onToggle }: DashboardWidgetsConfigProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" />
          Personalizar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Personalizar Dashboard</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Selecione quais widgets deseja exibir no dashboard
          </p>
          <div className="space-y-3">
            {widgets.map((widget) => (
              <div key={widget.id} className="flex items-center space-x-3">
                <Checkbox
                  id={widget.id}
                  checked={widget.enabled}
                  onCheckedChange={() => onToggle(widget.id)}
                />
                <label
                  htmlFor={widget.id}
                  className="flex items-center gap-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {widget.icon}
                  {widget.name}
                </label>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
