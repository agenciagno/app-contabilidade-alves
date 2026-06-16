import { useCallback } from 'react';
import { useNotifications } from '@/contexts/NotificationContext';

export function useNotificationTriggers() {
  const { addNotification } = useNotifications();

  const notifyBulkFeesGenerated = useCallback(
    (clientName: string, months: number) => {
      addNotification({
        type: 'success',
        title: 'Honorários Gerados',
        description: `${months} honorários recorrentes foram criados para o cliente ${clientName}.`,
        category: 'sucesso',
        actionUrl: '/movimentacoes',
      });
    },
    [addNotification]
  );

  const notifyReportExported = useCallback(
    (reportType: string) => {
      addNotification({
        type: 'success',
        title: 'Relatório Exportado',
        description: `O relatório de ${reportType} foi exportado com sucesso.`,
        category: 'sucesso',
      });
    },
    [addNotification]
  );

  const notifyDataSynced = useCallback(() => {
    addNotification({
      type: 'success',
      title: 'Dados Sincronizados',
      description: 'Todos os dados foram atualizados com sucesso.',
      category: 'sistema',
    });
  }, [addNotification]);

  const notifyTransactionCreated = useCallback(
    (description: string, type: 'receita' | 'despesa') => {
      addNotification({
        type: 'success',
        title: type === 'receita' ? 'Receita Registrada' : 'Despesa Registrada',
        description: `"${description}" foi adicionada com sucesso.`,
        category: 'sucesso',
        actionUrl: '/movimentacoes',
      });
    },
    [addNotification]
  );

  const notifyError = useCallback(
    (title: string, description: string) => {
      addNotification({
        type: 'error',
        title,
        description,
        category: 'sistema',
      });
    },
    [addNotification]
  );

  const notifyInfo = useCallback(
    (title: string, description: string) => {
      addNotification({
        type: 'info',
        title,
        description,
        category: 'sistema',
      });
    },
    [addNotification]
  );

  return {
    notifyBulkFeesGenerated,
    notifyReportExported,
    notifyDataSynced,
    notifyTransactionCreated,
    notifyError,
    notifyInfo,
  };
}
