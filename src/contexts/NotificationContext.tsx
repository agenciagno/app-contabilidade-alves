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

    // Projeção de saldo negativo (simplified calculation)
    const totalBalance = banks.reduce((sum, b) => sum + Number(b.current_balance || 0), 0);
    const next7DaysExpenses = filteredTransactions
      .filter((t) => {
        if (!t.due_date || t.type !== 'despesa') return false;
        const dueDate = parseISO(t.due_date);
        return dueDate >= today && dueDate <= addDays(today, 7);
      })
      .reduce((sum, t) => sum + Number(t.amount), 0);

    if (totalBalance - next7DaysExpenses < 0) {
      const id = `saldo-negativo-${todayStr}`;
      notifications.push({
        id,
        type: 'error',
        title: 'Projeção de Saldo Negativo',
        description: `Atenção: Projeção de saldo negativo detectada para os próximos 7 dias. Saldo atual: R$ ${totalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
        timestamp: new Date(),
        read: readIds.has(id),
        category: 'saldo',
        actionUrl: '/relatorios',
      });
    }

    return notifications;
  }, [filteredTransactions, banks, readIds]);

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
