import { useState, useEffect } from 'react';
import { Download, X, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'pwa-install-banner-dismissed';

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  );
}

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosBanner, setShowIosBanner] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isInStandaloneMode()) return;
    if (sessionStorage.getItem(DISMISSED_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // iOS detection (no beforeinstallprompt support)
    if (isIos()) {
      const timer = setTimeout(() => setShowIosBanner(true), 2000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', handler);
      };
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
    handleDismiss();
  };

  const handleDismiss = () => {
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIosBanner(false);
    sessionStorage.setItem(DISMISSED_KEY, '1');
  };

  const showBanner = !dismissed && (deferredPrompt || showIosBanner);
  if (!showBanner) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 420,
        width: 'calc(100% - 32px)',
        background: 'rgba(22, 22, 26, 0.90)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.10)',
        borderRadius: 14,
        padding: '14px 16px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.40)',
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <Download size={18} color="#0A84FF" style={{ flexShrink: 0 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(235,235,245,1.0)' }}>
          Instalar Contabilidade Alves
        </div>
        {showIosBanner ? (
          <div style={{ fontSize: 12, color: 'rgba(235,235,245,0.55)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            Toque em{' '}
            <Share size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />{' '}
            e depois "Adicionar à Tela Inicial"
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'rgba(235,235,245,0.55)', marginTop: 2 }}>
            Acesse como um app direto da sua tela inicial.
          </div>
        )}
      </div>

      {deferredPrompt && (
        <button
          onClick={handleInstall}
          style={{
            background: '#0A84FF',
            color: 'white',
            borderRadius: 9999,
            padding: '6px 16px',
            fontSize: 12,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Instalar
        </button>
      )}

      <button
        onClick={handleDismiss}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'rgba(235,235,245,0.45)',
          cursor: 'pointer',
          padding: 4,
          flexShrink: 0,
          display: 'flex',
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
