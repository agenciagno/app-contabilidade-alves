import { Bell } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { PushOptIn } from '@/components/notifications/PushOptIn';

/**
 * Header › Notificações Gerais (03/10/2026, substitui o sino "Tarefas").
 * Leva tudo que não tem sino próprio: cliente novo, certificado vencendo,
 * tarefas (atribuída, concluída, prazos), agenda fiscal. Ficam de fora o que
 * pertence a Mensagens e-CAC / Federais (serpro_*, gestao360_*), às Financeiras
 * (boleto_pago) e os pop-ups (aparecem na tela, não no sino). O resumo do dia
 * (vencem hoje, entregues, vencidas) saiu a pedido de Gabriel; o opt-in de push
 * continua morando aqui no topo.
 */
export function HeaderNotificacoesGerais() {
  return (
    <NotificationBell
      title="Notificações Gerais"
      icon={Bell}
      filter={{ excludePrefixes: ['serpro_', 'gestao360_'], excludeTypes: ['boleto_pago', 'popup'] }}
      renderTop={() => <PushOptIn />}
    />
  );
}
