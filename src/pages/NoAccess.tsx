import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function NoAccess() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--apple-bg-base)' }}>
      <div className="w-full max-w-md">
        <Card
          className="shadow-xl"
          style={{
            background: 'var(--apple-mat-card)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--apple-border-hair)',
            borderRadius: 'var(--r-xl)',
          }}
        >
          <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: 'hsla(0, 0%, 50%, 0.1)' }}
            >
              <Lock className="w-8 h-8" style={{ color: 'var(--apple-text-secondary)' }} />
            </div>

            <h2 className="text-xl font-semibold" style={{ color: 'var(--apple-text-primary)' }}>
              Módulo não disponível
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--apple-text-secondary)' }}>
              Você não tem acesso a este módulo. Fale com o administrador.
            </p>

            <Button
              onClick={() => navigate('/')}
              style={{
                background: 'var(--apple-blue)',
                borderRadius: 'var(--r-pill)',
                color: '#fff',
              }}
              className="mt-2"
            >
              Ir para Home
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
