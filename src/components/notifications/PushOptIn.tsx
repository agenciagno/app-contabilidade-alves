import { BellRing, BellOff, Share, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushSubscribe } from '@/hooks/usePushSubscribe';

/**
 * Faixa de opt-in de notificações push, exibida no topo do sino.
 * Trata o caso do iOS fora do modo instalado (precisa "Adicionar à Tela de Início").
 */
export function PushOptIn() {
  const { state, busy, subscribe, unsubscribe, configured } = usePushSubscribe();

  if (!configured || state === 'loading' || state === 'unsupported') return null;

  if (state === 'ios-needs-install') {
    return (
      <div className="px-3 py-2.5 border-b border-border/50 bg-muted/30">
        <p className="text-xs text-muted-foreground leading-snug flex items-start gap-1.5">
          <Share className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Para receber notificações no iPhone, instale o app: toque em{' '}
            <strong>Compartilhar</strong> e depois em{' '}
            <strong>"Adicionar à Tela de Início"</strong>. Abra pelo ícone e volte aqui.
          </span>
        </p>
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="px-3 py-2.5 border-b border-border/50 bg-muted/30">
        <p className="text-xs text-muted-foreground leading-snug flex items-start gap-1.5">
          <BellOff className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Notificações bloqueadas. Libere nas configurações do navegador para ativar.</span>
        </p>
      </div>
    );
  }

  if (state === 'subscribed') {
    return (
      <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between gap-2">
        <span className="text-xs text-emerald-600 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Notificações ativadas neste dispositivo
        </span>
        <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" disabled={busy} onClick={unsubscribe}>
          Desativar
        </Button>
      </div>
    );
  }

  // state === 'default'
  return (
    <div className="px-3 py-2.5 border-b border-border/50">
      <Button size="sm" className="w-full h-8 text-xs gap-1.5" disabled={busy} onClick={subscribe}>
        <BellRing className="w-3.5 h-3.5" />
        {busy ? 'Ativando...' : 'Ativar notificações neste dispositivo'}
      </Button>
    </div>
  );
}
