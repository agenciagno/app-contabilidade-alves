import { Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EM_BREVE } from '@/constants/modules';
import { PageHeader } from '@/components/ds';
import { Button } from '@/components/ui/button';

interface EmBreveProps {
  /** Chave do módulo em `EM_BREVE` (src/constants/modules.ts). */
  moduleKey: string;
}

/**
 * Casca padrão das rotas que já estão no menu mas ainda não têm tela — frame
 * "Template · Em breve" do Figma (105:28445), reutilizado pelas 19 rotas que
 * hoje renderizam <EmBreve />. Quando a tela real nascer, troca a rota no
 * App.tsx e remove a entrada de `EM_BREVE`.
 */
export function EmBreve({ moduleKey }: EmBreveProps) {
  const navigate = useNavigate();
  const info = EM_BREVE[moduleKey];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/módulo"
        title="Em breve."
        subtitle="Este módulo já aparece no menu, mas ainda não tem tela."
      />

      <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-line">
        <div className="max-w-md space-y-4 px-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-bg-2">
            <Clock className="h-6 w-6 text-muted-ink" strokeWidth={1.75} />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-h4-card text-ink">{info?.titulo ?? 'Módulo em construção'}</h2>
            <p className="text-body text-muted-ink">
              {info?.descricao ?? 'Este módulo está em construção.'}
            </p>
            {info?.fase && <p className="text-meta text-muted-ink-2">{info.fase}</p>}
          </div>

          <Button variant="outline" onClick={() => navigate('/')}>
            Voltar ao início
          </Button>
        </div>
      </div>
    </div>
  );
}
