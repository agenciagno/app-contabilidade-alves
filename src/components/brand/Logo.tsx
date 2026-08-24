import { cn } from '@/lib/utils';

/**
 * Logo da Contabilidade Alves, trocado por tema.
 * O arquivo branco só tem contraste em fundo escuro e o azul só em fundo claro —
 * por isso os dois ficam no DOM e o CSS escolhe, em vez de depender do hook de tema
 * (que só resolve depois da hidratação e faria o logo piscar).
 *
 * `variant="white"` ignora o tema e força sempre a marca branca — usada onde o
 * fundo é --nav-surface (shell, redesign 24/08/2026): azul no claro, neutro
 * escuro no escuro, os dois só têm contraste com a marca branca.
 */
export function Logo({ className, variant = 'auto' }: { className?: string; variant?: 'auto' | 'white' }) {
  if (variant === 'white') {
    return <img src="/logo-branco.png" alt="Contabilidade Alves" className={cn('w-auto', className)} />;
  }
  return (
    <>
      <img
        src="/logo-azul.png"
        alt="Contabilidade Alves"
        className={cn('w-auto dark:hidden', className)}
      />
      <img
        src="/logo-branco.png"
        alt="Contabilidade Alves"
        className={cn('hidden w-auto dark:block', className)}
      />
    </>
  );
}
