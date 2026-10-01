import { useNavigate } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useContadorCaixaNova } from '@/hooks/useSerproCaixaPostal';

/** Header › Mensagens e-CAC: atalho para a Caixa Postal com o contador de caixas com mensagem nova. */
export function HeaderMensagensEcac() {
  const navigate = useNavigate();
  const novas = useContadorCaixaNova(true);

  return (
    <Button
      variant="ghost"
      size="icon"
      title="Mensagens e-CAC"
      aria-label="Mensagens e-CAC"
      onClick={() => navigate('/mensagens')}
      className="relative text-nav-on-surface hover:bg-white/10 hover:text-nav-on-surface"
    >
      <Mail className="h-5 w-5" />
      {novas > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
          {novas > 99 ? '99+' : novas}
        </span>
      )}
    </Button>
  );
}
