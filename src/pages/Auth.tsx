import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User, Lock, Eye, EyeOff, ShieldX, Shield } from 'lucide-react';
import { PendingApprovalScreen } from '@/components/auth/PendingApprovalScreen';
import { z } from 'zod';

const loginSchema = z.object({
  emailOrUsername: z.string().min(1, 'Campo obrigatório'),
  password: z.string().min(6, 'Mínimo 6 caracteres')
});

export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [statusBlock, setStatusBlock] = useState<'pending' | 'blocked' | null>(null);
  const [loginData, setLoginData] = useState({
    emailOrUsername: '',
    password: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const [sessionRevoked, setSessionRevoked] = useState(false);

  // Check for session_revoked reason
  useEffect(() => {
    if (searchParams.get('reason') === 'session_revoked') {
      setSessionRevoked(true);
      setSearchParams({}, { replace: true });
      const timer = setTimeout(() => setSessionRevoked(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = loginSchema.safeParse(loginData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach(err => {
        if (err.path[0]) fieldErrors[err.path[0].toString()] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);
    setStatusBlock(null);
    const { error } = await signIn(loginData.emailOrUsername, loginData.password);
    setIsLoading(false);

    if (error) {
      const code = (error as any).code;
      if (code === 'STATUS_PENDING') {
        setStatusBlock('pending');
        return;
      }
      if (code === 'STATUS_BLOCKED') {
        setStatusBlock('blocked');
        return;
      }
      toast({
        title: 'Erro ao entrar',
        description: error.message,
        variant: 'destructive'
      });
    } else {
      navigate('/');
    }
  };

  if (statusBlock === 'pending') {
    return <PendingApprovalScreen onBack={() => setStatusBlock(null)} />;
  }

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
          <CardHeader className="pb-4">
            <h2 className="text-lg font-semibold text-center" style={{ color: 'var(--apple-text-primary)' }}>
              Entrar no Sistema
            </h2>
          </CardHeader>

          <CardContent>
            {sessionRevoked && (
              <div
                className="flex items-center gap-2 p-3 rounded-lg mb-4"
                style={{ background: 'rgba(255, 149, 0, 0.10)', border: '1px solid rgba(255, 149, 0, 0.2)' }}
              >
                <Shield className="w-5 h-5 shrink-0" style={{ color: 'var(--apple-yellow)' }} />
                <p className="text-sm" style={{ color: 'var(--apple-yellow)' }}>
                  Sua sessão foi encerrada pelo administrador.
                </p>
              </div>
            )}
            {statusBlock === 'blocked' && (
              <div
                className="flex items-center gap-2 p-3 rounded-lg mb-4"
                style={{ background: 'hsla(0, 70%, 50%, 0.1)', border: '1px solid hsla(0, 70%, 50%, 0.2)' }}
              >
                <ShieldX className="w-5 h-5 shrink-0" style={{ color: 'var(--apple-red)' }} />
                <p className="text-sm" style={{ color: 'var(--apple-red)' }}>
                  Seu acesso foi bloqueado. Entre em contato com o administrador.
                </p>
              </div>
            )}
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="emailOrUsername" style={{ color: 'var(--apple-text-secondary)' }}>
                  Email ou Nome de Usuário
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--apple-text-secondary)' }} />
                  <Input
                    id="emailOrUsername"
                    placeholder="email@empresa.com ou usuario"
                    className="pl-10"
                    style={{
                      background: 'var(--apple-bg-base)',
                      border: '1px solid var(--apple-border-hair)',
                      color: 'var(--apple-text-primary)',
                    }}
                    value={loginData.emailOrUsername}
                    onChange={e => setLoginData(prev => ({
                      ...prev,
                      emailOrUsername: e.target.value
                    }))}
                  />
                </div>
                {errors.emailOrUsername && (
                  <p className="text-destructive text-sm">{errors.emailOrUsername}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" style={{ color: 'var(--apple-text-secondary)' }}>
                  Senha
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--apple-text-secondary)' }} />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="pl-10 pr-10"
                    style={{
                      background: 'var(--apple-bg-base)',
                      border: '1px solid var(--apple-border-hair)',
                      color: 'var(--apple-text-primary)',
                    }}
                    value={loginData.password}
                    onChange={e => setLoginData(prev => ({
                      ...prev,
                      password: e.target.value
                    }))}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 transition-opacity"
                    style={{ background: 'none', border: 'none', outline: 'none', padding: 0, color: 'var(--apple-text-secondary)' }}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-destructive text-sm">{errors.password}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
                style={{
                  background: 'var(--apple-blue)',
                  borderRadius: 'var(--r-pill)',
                  color: '#fff',
                }}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Entrar
              </Button>
            </form>

            <p className="text-xs text-center mt-4" style={{ color: 'var(--apple-text-secondary)' }}>
              Usuários são criados internamente por um administrador.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
