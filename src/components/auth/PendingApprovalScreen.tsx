import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface PendingApprovalScreenProps {
  onBack: () => void;
}

export function PendingApprovalScreen({ onBack }: PendingApprovalScreenProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--apple-bg-base)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8 flex flex-col items-center">
          <img
            src="/Contabilidade_Alves_Branco.svg"
            alt="Contabilidade Alves"
            style={{ width: '220px', marginBottom: '32px' }}
          />
        </div>

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
              style={{ background: 'hsla(45, 90%, 50%, 0.12)' }}
            >
              <Clock className="w-8 h-8" style={{ color: 'hsl(45, 90%, 45%)' }} />
            </div>

            <h2 className="text-xl font-semibold" style={{ color: 'var(--apple-text-primary)' }}>
              Acesso em análise
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--apple-text-secondary)' }}>
              Seu cadastro foi recebido. Aguarde a aprovação do administrador para acessar o sistema.
            </p>

            <Button
              onClick={onBack}
              variant="outline"
              className="mt-2"
              style={{
                borderRadius: 'var(--r-pill)',
                borderColor: 'var(--apple-border-hair)',
                color: 'var(--apple-text-primary)',
              }}
            >
              Voltar ao login
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
