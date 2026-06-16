import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

export function PwaUpdateBanner() {
  const [dismissed, setDismissed] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh || dismissed) return null;

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
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <RefreshCw size={18} color="#0A84FF" style={{ flexShrink: 0 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(235,235,245,1.0)' }}>
          Nova versão disponível
        </div>
        <div style={{ fontSize: 12, color: 'rgba(235,235,245,0.55)', marginTop: 2 }}>
          Atualize para ter as últimas melhorias.
        </div>
      </div>

      <button
        onClick={() => updateServiceWorker(true)}
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
        Atualizar
      </button>

      <button
        onClick={() => setDismissed(true)}
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
