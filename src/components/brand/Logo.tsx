import { cn } from '@/lib/utils';

/**
 * Logo da Contabilidade Alves, trocado por tema.
 * O arquivo branco só tem contraste em fundo escuro e o azul só em fundo claro —
 * por isso os dois ficam no DOM e o CSS escolhe, em vez de depender do hook de tema
 * (que só resolve depois da hidratação e faria o logo piscar).
 */
export function Logo({ className }: { className?: string }) {
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
