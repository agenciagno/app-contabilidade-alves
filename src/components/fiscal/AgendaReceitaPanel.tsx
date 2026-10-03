import { format, parseISO } from 'date-fns';
import { CheckCircle2, FileSpreadsheet, Loader2, RefreshCw, Rocket, TriangleAlert, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AgendaAprovacao, AgendaImportacao } from '@/hooks/useAgendaReceita';

interface Props {
  importacao: AgendaImportacao;
  aprovacao: AgendaAprovacao | null;
  podeAprovar: boolean;
  /** Tarefas e clientes que o lançamento vai criar (já descontado o que existe). */
  tarefasALancar: number | null;
  clientesALancar: number | null;
  lancando: boolean;
  desfazendo: boolean;
  atualizando: boolean;
  onAprovar: () => void;
  onDesfazer: () => void;
  onAtualizar: () => void;
}

/** Faixa única do Calendário Fiscal: de onde vêm as datas e o botão que aprova e lança as tarefas (um clique). */
export function AgendaReceitaPanel({
  importacao, aprovacao, podeAprovar, tarefasALancar, clientesALancar, lancando, desfazendo, atualizando, onAprovar, onDesfazer, onAtualizar,
}: Props) {
  const oficiais = importacao.resumo.filter((r) => r.fonte === 'receita').length;
  const diferem = importacao.resumo.filter((r) => r.divergente).length;
  const semPlanilha = importacao.fonte === 'regras';
  const aprovada = !!aprovacao;

  const titulo = aprovada
    ? 'Tarefas lançadas'
    : semPlanilha
      ? 'Rascunho pelas regras do sistema (a Receita ainda não publicou a planilha)'
      : 'Agenda da Receita pronta';
  const detalhe = aprovada
    ? `Aprovado em ${format(parseISO(aprovacao!.aprovado_em), "dd/MM/yyyy 'às' HH:mm")} · ${aprovacao!.tarefas_criadas} tarefas lançadas`
    : semPlanilha
      ? 'Quando a planilha sair, as datas oficiais entram sozinhas se você ainda não tiver aprovado.'
      : `${importacao.ade_titulo ?? 'ADE Corat'} · ${oficiais} datas da Receita, o resto pela regra do sistema${diferem ? ` · ${diferem} diferem da regra` : ''}`;

  return (
    <Card className={cn('border-l-[3px] p-5', aprovada ? 'border-l-ok' : semPlanilha ? 'border-l-warn' : 'border-l-brand')}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          {aprovada ? (
            <CheckCircle2 className="mt-0.5 h-[22px] w-[22px] shrink-0 text-ok" />
          ) : semPlanilha ? (
            <TriangleAlert className="mt-0.5 h-[22px] w-[22px] shrink-0 text-warn" />
          ) : (
            <FileSpreadsheet className="mt-0.5 h-[22px] w-[22px] shrink-0 text-brand" />
          )}
          <div className="min-w-0">
            <p className="text-ui-strong text-ink">{titulo}</p>
            <p className="text-meta text-muted-ink">{detalhe}</p>
            {!aprovada && tarefasALancar !== null && (
              <p className="mt-1 text-meta text-muted-ink">
                Ao aprovar: <strong className="text-ink">{tarefasALancar}</strong> tarefa{tarefasALancar === 1 ? '' : 's'} para{' '}
                <strong className="text-ink">{clientesALancar ?? 0}</strong> cliente{clientesALancar === 1 ? '' : 's'}. Para mudar uma data, use o lápis na linha antes de aprovar.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {importacao.xlsx_url && (
            <Button variant="ghost" size="sm" asChild>
              <a href={importacao.xlsx_url} target="_blank" rel="noreferrer">
                <FileSpreadsheet className="h-4 w-4" /> Planilha oficial
              </a>
            </Button>
          )}
          {podeAprovar && !aprovada && (
            <>
              <Button variant="outline" size="sm" onClick={onAtualizar} disabled={atualizando || lancando}>
                {atualizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Atualizar da Receita
              </Button>
              <Button onClick={onAprovar} disabled={lancando} className="bg-ok hover:bg-ok">
                {lancando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Aprovar e lançar tarefas
              </Button>
            </>
          )}
          {podeAprovar && aprovada && (
            <Button variant="outline" size="sm" onClick={onDesfazer} disabled={desfazendo} className="text-destructive hover:text-destructive">
              {desfazendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
              Desfazer lançamento
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
