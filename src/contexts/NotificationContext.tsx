import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, parseISO, isToday, differenceInDays, format, addDays } from 'date-fns';

export type NotificationType = 'error' | 'warning' | 'success' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  timestamp: Date;
  read: boolean;
  category: 'inadimplencia' | 'vencimento' | 'saldo' | 'sucesso' | 'sistema';
  actionUrl?: string;
  contactId?: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const READ_IDS_KEY = 'app_notifications_read';

// Simple transaction interface for notifications
interface SimpleTransaction {
  id: string;
  amount: number;
  due_date: string | null;
  is_paid: boolean;
  contact_id: string | null;
  bank_id: string | null;
  type: string;
  contact?: { id: string; name: string } | null;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [manualNotifications, setManualNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(READ_IDS_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Direct query for transactions (no toast dependency)
  const { data: transactions = [] } = useQuery({
    queryKey: ['notifications-transactions'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('transactions')
          .select('id, amount, due_date, is_paid, contact_id, bank_id, type, contact:contacts(id, name)')
          .is('deleted_at', null)
          .eq('is_paid', false)
          .not('due_date', 'is', null);
        
        if (error) return [];
        return data as SimpleTransaction[];
      } catch {
        return [];
      }
    },
    staleTime: 1000 * 60, // 1 minute
    gcTime: 1000 * 60 * 5,
    retry: false,
  });

  // Direct query for banks to calculate cash flow (exclude invisible)
  const { data: banksData = [] } = useQuery({
    queryKey: ['notifications-banks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('banks')
        .select('id, current_balance, is_invisible')
        .eq('is_active', true);
      
      if (error) return [];
      return data;
    },
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
    retry: false,
  });

  // Orçamentos do mês corrente + realizado por categoria (para alerta de estouro).
  const monthYear = format(startOfDay(new Date()), 'yyyy-MM');
  const { data: budgetsData = [] } = useQuery({
    queryKey: ['notif-budgets', monthYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dre_budgets')
        .select('category_id, budget_value')
        .eq('month_year', monthYear);
      if (error) return [];
      return data as { category_id: string; budget_value: number }[];
    },
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
    retry: false,
  });

  const { data: budgetRealizado = {} } = useQuery({
    queryKey: ['notif-budget-realizado', monthYear],
    enabled: budgetsData.length > 0,
    queryFn: async () => {
      const today = new Date();
      const start = `${monthYear}-01`;
      const end = format(new Date(today.getFullYear(), today.getMonth() + 1, 0), 'yyyy-MM-dd');
      const { data, error } = await supabase.rpc('get_category_breakdown', {
        p_type: 'despesa', p_start_date: start, p_end_date: end, p_limit: 1000,
      });
      if (error) return {} as Record<string, { total: number; name: string }>;
      const map: Record<string, { total: number; name: string }> = {};
      (data as any[] | null)?.forEach((r) => {
        if (r.category_id) map[r.category_id] = { total: Number(r.total ?? 0), name: r.category_name ?? 'Categoria' };
      });
      return map;
    },
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
    retry: false,
  });

  const invisibleBankIds = useMemo(() => new Set(banksData.filter((b: any) => b.is_invisible).map((b: any) => b.id)), [banksData]);
  const banks = useMemo(() => banksData.filter((b: any) => !b.is_invisible), [banksData]);
  
  // Filter out invisible bank transactions from notifications
  const filteredTransactions = useMemo(() => 
    transactions.filter(t => !t.bank_id || !invisibleBankIds.has(t.bank_id)), 
    [transactions, invisibleBankIds]
  );

  // Save read IDs to localStorage
  useEffect(() => {
    localStorage.setItem(READ_IDS_KEY, JSON.stringify([...readIds]));
  }, [readIds]);

  // Generate system notifications from data
  const systemNotifications = useMemo(() => {
    const notifications: Notification[] = [];
    const today = startOfDay(new Date());
    const todayStr = format(today, 'yyyy-MM-dd');

    // Inadimplência notifications - group by contact
    const overdueByContact = new Map<string, { name: string; count: number; oldestDate: string }>();
    
    filteredTransactions.forEach((t) => {
      if (!t.due_date || !t.contact_id || t.due_date >= todayStr) return;
      
      const existing = overdueByContact.get(t.contact_id);
      const contactName = t.contact?.name || 'Cliente';
      
      if (existing) {
        existing.count += 1;
        if (t.due_date < existing.oldestDate) {
          existing.oldestDate = t.due_date;
        }
      } else {
        overdueByContact.set(t.contact_id, {
          name: contactName,
          count: 1,
          oldestDate: t.due_date,
        });
      }
    });

    overdueByContact.forEach((info, contactId) => {
      const id = `inadimplencia-${contactId}`;
      const daysOverdue = differenceInDays(today, parseISO(info.oldestDate));
      notifications.push({
        id,
        type: 'error',
        title: 'Inadimplência Detectada',
        description: `O cliente ${info.name} possui ${info.count} título(s) vencido(s) há ${daysOverdue} dias.`,
        timestamp: new Date(),
        read: readIds.has(id),
        category: 'inadimplencia',
        actionUrl: `/crm/cliente/${contactId}`,
        contactId,
      });
    });

    // Vencimentos do dia
    const dueTodayTransactions = filteredTransactions.filter(
      (t) => t.due_date && isToday(parseISO(t.due_date))
    );
    
    if (dueTodayTransactions.length > 0) {
      const totalAmount = dueTodayTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
      const id = `vencimento-hoje-${todayStr}`;
      notifications.push({
        id,
        type: 'warning',
        title: 'Vencimentos do Dia',
        description: `Você tem ${dueTodayTransactions.length} conta(s) vencendo hoje, totalizando R$ ${totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
        timestamp: new Date(),
        read: readIds.has(id),
        category: 'vencimento',
        actionUrl: '/movimentacoes',
      });
    }

    // Régua de cobrança — contas a RECEBER vencendo nos próximos X dias (aviso antecipado).
    // Complementa "Vencimentos do Dia" (no vencimento) e "Inadimplência" (atrasado).
    const COBRANCA_DIAS_ANTES = 3;
    const limiteCobrancaStr = format(addDays(today, COBRANCA_DIAS_ANTES), 'yyyy-MM-dd');
    const aVencerByContact = new Map<string, { name: string; count: number; total: number; nextDate: string }>();
    filteredTransactions.forEach((t) => {
      if (t.type !== 'receita' || !t.due_date || !t.contact_id) return;
      if (t.due_date <= todayStr || t.due_date > limiteCobrancaStr) return; // entre amanhã e +X dias
      const contactName = t.contact?.name || 'Cliente';
      const ex = aVencerByContact.get(t.contact_id);
      if (ex) {
        ex.count += 1;
        ex.total += Number(t.amount);
        if (t.due_date < ex.nextDate) ex.nextDate = t.due_date;
      } else {
        aVencerByContact.set(t.contact_id, { name: contactName, count: 1, total: Number(t.amount), nextDate: t.due_date });
      }
    });
    aVencerByContact.forEach((info, contactId) => {
      const id = `cobranca-avencer-${contactId}-${info.nextDate}`;
      const [y, m, d] = info.nextDate.split('-');
      notifications.push({
        id,
        type: 'warning',
        title: 'Cobrança a vencer',
        description: `${info.name}: ${info.count} título(s) a receber vencendo até ${d}/${m}/${y}, total R$ ${info.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
        timestamp: new Date(),
        read: readIds.has(id),
        category: 'vencimento',
        actionUrl: `/crm/cliente/${contactId}`,
        contactId,
      });
    });

    // Projeção de saldo negativo — dia a dia (30 dias), detecta o 1º cruzamento do zero.
    const totalBalance = banks.reduce((sum, b) => sum + Number(b.current_balance || 0), 0);
    const HORIZON = 30;
    const horizonStr = format(addDays(today, HORIZON), 'yyyy-MM-dd');
    // Net por vencimento das contas em aberto (a partir de hoje).
    const netByDue = new Map<string, number>();
    filteredTransactions.forEach((t) => {
      if (!t.due_date || t.due_date < todayStr || t.due_date > horizonStr) return;
      const net = t.type === 'receita' ? Number(t.amount) : -Number(t.amount);
      netByDue.set(t.due_date, (netByDue.get(t.due_date) ?? 0) + net);
    });
    let cum = totalBalance;
    let firstNegDate: string | null = null;
    let firstNegSaldo = 0;
    for (let i = 0; i <= HORIZON; i++) {
      const dStr = format(addDays(today, i), 'yyyy-MM-dd');
      cum += netByDue.get(dStr) ?? 0;
      if (cum < 0) { firstNegDate = dStr; firstNegSaldo = cum; break; }
    }
    if (firstNegDate) {
      const id = `saldo-negativo-${firstNegDate}`;
      const [y, m, d] = firstNegDate.split('-');
      notifications.push({
        id,
        type: 'error',
        title: 'Projeção de Saldo Negativo',
        description: `Atenção: a projeção de caixa fica negativa em ${d}/${m}/${y} (saldo previsto R$ ${firstNegSaldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}). Saldo atual: R$ ${totalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
        timestamp: new Date(),
        read: readIds.has(id),
        category: 'saldo',
        actionUrl: '/relatorios',
      });
    }

    // Orçamento estourado por categoria (mês corrente).
    budgetsData.forEach((b) => {
      const meta = Number(b.budget_value);
      const real = budgetRealizado[b.category_id];
      if (!real || meta <= 0 || real.total <= meta) return;
      const id = `orcamento-estourado-${monthYear}-${b.category_id}`;
      const pct = Math.round((real.total / meta) * 100);
      notifications.push({
        id,
        type: 'warning',
        title: 'Orçamento Estourado',
        description: `A categoria "${real.name}" atingiu ${pct}% da meta do mês (R$ ${real.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de R$ ${meta.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`,
        timestamp: new Date(),
        read: readIds.has(id),
        category: 'sistema',
        actionUrl: '/',
      });
    });

    return notifications;
  }, [filteredTransactions, banks, readIds, budgetsData, budgetRealizado, monthYear]);

  // Combine all notifications
  const notifications = useMemo(() => {
    return [...systemNotifications, ...manualNotifications].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
  }, [systemNotifications, manualNotifications]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  const addNotification = useCallback(
    (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
      const newNotification: Notification = {
        ...notification,
        id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        read: false,
      };
      setManualNotifications((prev) => [newNotification, ...prev]);
    },
    []
  );

  const markAsRead = useCallback((id: string) => {
    setReadIds((prev) => new Set([...prev, id]));
    setManualNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    const allIds = notifications.map((n) => n.id);
    setReadIds((prev) => new Set([...prev, ...allIds]));
    setManualNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [notifications]);

  const clearAll = useCallback(() => {
    const allIds = notifications.map((n) => n.id);
    setReadIds((prev) => new Set([...prev, ...allIds]));
    setManualNotifications([]);
  }, [notifications]);

  const removeNotification = useCallback((id: string) => {
    setReadIds((prev) => new Set([...prev, id]));
    setManualNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearAll,
        removeNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
