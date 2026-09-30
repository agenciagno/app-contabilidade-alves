import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deslocarCompetencia, rotuloCompetencia, siglaCompetencia } from '@/hooks/useSerproPagamentos';

/** Seletor de mês de apuração (AAAA-MM), igual nas telas de Pagamentos, PGDAS e DAS. `limite` = último mês permitido. */
export function CompetenciaNav({ competencia, onChange, limite }: { competencia: string; onChange: (c: string) => void; limite: string }) {
  return (
    <div className="flex justify-center">
      <div className="flex items-center gap-2 rounded-lg border border-line bg-paper p-1.5">
        <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => onChange(deslocarCompetencia(competencia, -1))} title="Mês anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-[200px] text-center">
          <p className="text-[15px] font-medium text-ink">{rotuloCompetencia(competencia)}</p>
          <p className="text-meta text-muted-ink-2">Período de apuração {siglaCompetencia(competencia)}</p>
        </div>
        <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => onChange(deslocarCompetencia(competencia, 1))} disabled={competencia >= limite} title="Próximo mês">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
