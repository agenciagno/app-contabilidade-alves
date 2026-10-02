import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CheckCircle2, ChevronDown, ChevronUp, FileSpreadsheet, Loader2, RefreshCw, Rocket, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AgendaAprovacao, AgendaImportacao } from '@/hooks/useAgendaReceita';

interface Props {
  importacao: AgendaImportacao;
  aprovacao: AgendaAprovacao | null;
  podeAprovar: boolean;
  lancando: boolean;
  atualizando: boolean;
  onAprovar: () => void;
  onAtualizar: () => void;
}

const fmt = (s: string | null) => (s ? format(parseISO(s), 'dd/MM') : '—');

/** Faixa "Agenda oficial da Receita" do Calendário Fiscal: de onde vêm as datas, o que diverge das regras e o botão de aprovar (lança as tarefas). */
export function AgendaReceitaPanel({ importacao, aprovacao, podeAprovar, lancando, atualizando, onAprovar, onAtualizar }: Props) {
  const [aberto, setAberto] = useState(false);
  const oficiais = importacao.resumo.filter((r) => r.fonte === 'receita');
  const pelasRegras = importacao.resumo.length - oficiais.length;
  const divergentes = importacao.resumo.filter((r) => r.divergente);
  const semPlanilha = importacao.fonte === 'regras';
  const aprovada = !!aprovacao;

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
            <p className="text-ui-strong text-ink">
              {aprovada
                ? 'Agenda aprovada'
                : semPlanilha
                  ? 'Rascunho pelas regras do sistema (a Receita ainda não publicou a planilha)'
                  : 'Agenda oficial da Receita pronta para revisar'}
            </p>
            <p className="text-meta text-muted-ink">
              {aprovada
                ? `Aprovada em ${format(parseISO(aprovacao!.aprovado_em), "dd/MM/yyyy 'às' HH:mm")}${aprovacao!.tarefas_criadas ? ` · ${aprovacao!.tarefas_criadas} tarefas lançadas` : ''}`
                : semPlanilha
                  ? 'Quando a planilha sair, as datas oficiais entram sozinhas (se você ainda não tiver aprovado).'
                  : `${importacao.ade_titulo ?? 'ADE Corat'} · ${oficiais.length} obrigações com data da Receita${pelasRegras ? ` · ${pelasRegras} pela regra do sistema (estadual, municipal e pessoal)` : ''}`}
            </p>
            {!aprovada && !semPlanilha && (
              <p className="mt-1 text-meta text-muted-ink">
                Para ajustar uma data, use o lápis na linha da tabela (fica registrado como ajuste). Aprovar lança as tarefas.
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
          {!aprovada && podeAprovar && (
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
        </div>
      </div>

      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="mt-3 inline-flex items-center gap-1 text-meta text-muted-ink hover:text-ink"
      >
        {aberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {aberto ? 'Ocultar' : 'Ver'} de onde vem cada data
        {divergentes.length > 0 && (
          <Badge className="ml-1 border-warn/30 bg-warn/15 text-warn">{divergentes.length} diferem da regra</Badge>
        )}
      </button>

      {aberto && (
        <div className="mt-3 overflow-hidden rounded-md border border-line">
          <table className="w-full text-meta">
            <thead className="bg-paper text-muted-ink">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Obrigação</th>
                <th className="px-3 py-2 text-left font-medium">Origem</th>
                <th className="px-3 py-2 text-left font-medium">Receita</th>
                <th className="px-3 py-2 text-left font-medium">Regra do sistema</th>
                <th className="px-3 py-2 text-left font-medium">Na agenda</th>
              </tr>
            </thead>
            <tbody>
              {[...importacao.resumo].sort((a, b) => a.final.localeCompare(b.final)).map((r) => (
                <tr key={r.obligation_id} className="border-t border-line">
                  <td className="px-3 py-2 text-ink">{r.nome}</td>
                  <td className="px-3 py-2">
                    {r.fonte === 'receita' ? (
                      <Badge className="border-brand/30 bg-brand-tint text-brand">Receita</Badge>
                    ) : (
                      <Badge variant="outline">{r.sem_linha_oficial ? 'Regra (sem linha na planilha)' : 'Regra'}</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-ink" title={r.linhas.join('\n')}>{fmt(r.oficial)}</td>
                  <td className={cn('px-3 py-2', r.divergente ? 'text-warn' : 'text-muted-ink')}>{fmt(r.regra)}</td>
                  <td className="px-3 py-2 text-ui-strong text-ink">{fmt(r.final)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
