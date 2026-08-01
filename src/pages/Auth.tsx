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
import { Logo } from '@/components/brand/Logo';
import { supabase } from '@/integrations/supabase/client';
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
  const [sendingReset, setSendingReset] = useState(false);
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

  // O campo de login aceita e-mail ou usuário, mas o reset do Supabase só
  // funciona por e-mail — por isso a exigência do '@' antes de disparar.
  const handleForgotPassword = async () => {
    const email = loginData.emailOrUsername.trim();
    if (!email.includes('@')) {
      toast({
        title: 'Informe seu e-mail',
        description: 'Digite o e-mail da sua conta no campo acima para receber o link.',
      });
      return;
    }
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setSendingReset(false);
    if (error) {
      toast({
        title: 'Erro ao enviar o link',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    // Mensagem igual exista ou não a conta — não confirmar e-mail cadastrado.
    toast({
      title: 'Link enviado',
      description: `Se existir uma conta com ${email}, o link de redefinição chega em instantes.`,
    });
  };

  if (statusBlock === 'pending') {
    return <PendingApprovalScreen onBack={() => setStatusBlock(null)} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <Logo className="h-12" />
        </div>

        <Card className="rounded-xl border border-line bg-paper shadow-sc-lg">
          <CardHeader className="pb-4">
            <h2 className="text-center text-h4-card text-ink">Entrar no Sistema</h2>
          </CardHeader>

          <CardContent>
            {sessionRevoked && (
              <div className="mb-4 flex items-center gap-2 rounded-md border-l-[3px] border-warn bg-warn-soft p-3">
                <Shield className="h-5 w-5 shrink-0 text-warn" />
                <p className="text-body-sm text-ink-2">
                  Sua sessão foi encerrada pelo administrador.
                </p>
              </div>
            )}
            {statusBlock === 'blocked' && (
              <div className="mb-4 flex items-center gap-2 rounded-md border-l-[3px] border-danger bg-danger-soft p-3">
                <ShieldX className="h-5 w-5 shrink-0 text-danger" />
                <p className="text-body-sm text-ink-2">
                  Seu acesso foi bloqueado. Entre em contato com o administrador.
                </p>
              </div>
            )}
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="emailOrUsername" className="text-ui text-muted-ink">
                  Email ou Nome de Usuário
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-ink" />
                  <Input
                    id="emailOrUsername"
                    placeholder="email@empresa.com ou usuario"
                    className="rounded-sm border-line bg-bg pl-10 text-ink"
                    value={loginData.emailOrUsername}
                    onChange={e => setLoginData(prev => ({
                      ...prev,
                      emailOrUsername: e.target.value
                    }))}
                  />
                </div>
                {errors.emailOrUsername && (
                  <p className="text-meta text-danger">{errors.emailOrUsername}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-ui text-muted-ink">
                  Senha
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-ink" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="rounded-sm border-line bg-bg pl-10 pr-10 text-ink"
                    value={loginData.password}
                    onChange={e => setLoginData(prev => ({
                      ...prev,
                      password: e.target.value
                    }))}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 border-none bg-transparent p-0 text-muted-ink opacity-70 outline-none transition-opacity hover:opacity-100"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-meta text-danger">{errors.password}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Entrar
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={sendingReset}
                  className="border-none bg-transparent text-link text-muted-ink underline underline-offset-2 disabled:opacity-60"
                >
                  {sendingReset ? 'Enviando...' : 'Esqueci minha senha'}
                </button>
              </div>
            </form>

            <p className="mt-4 text-center text-meta text-muted-ink">
              Usuários são criados internamente por um administrador.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
