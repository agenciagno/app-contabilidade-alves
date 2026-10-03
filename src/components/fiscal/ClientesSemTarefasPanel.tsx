import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAtualizarCardCliente, useClientesSemTarefas } from '@/hooks/useFiscalCardCliente';

interface Props {
  year: number;
  month: number;
  mesLabel: string;
}

/** Cliente novo ou esquecido: tem obrigação marcada e nenhuma tarefa no mês. Lança o card dele sem refazer o mês inteiro. */
export function ClientesSemTarefasPanel({ year, month, mesLabel }: Props) {
  const { data: lista = [] } = useClientesSemTarefas(year, month, true);
  const atualizar = useAtualizarCardCliente();
  const [pendente, setPendente] = useState<string | null>(null);
  const [verSemRegime, setVerSemRegime] = useState(false);

  // Cadastro sem regime e sem responsável (empresas de energia, bancos, pessoas físicas…) não é cliente de obrigação: fica à parte.
  const reais = lista.filter((c) => c.regime);
  const semRegime = lista.filter((c) => !c.regime);
  if (reais.length === 0 && semRegime.length === 0) return null;

  const lancar = (id: string) => {
    setPendente(id);
    atualizar.mutate(id, { onSettled: () => setPendente(null) });
  };

  return (
    <Card className="space-y-3 border-l-[3px] border-l-warn p-5">
      <div className="flex items-center gap-2">
        <UserPlus className="h-5 w-5 text-warn" />
        <p className="text-ui-strong text-ink">
          {reais.length > 0
            ? `${reais.length} cliente${reais.length === 1 ? '' : 's'} sem tarefas em ${mesLabel}`
            : `Nenhum cliente real sem tarefas em ${mesLabel}`}
        </p>
      </div>
      {reais.length > 0 && (
        <p className="text-meta text-muted-ink">Cliente novo ou esquecido: tem obrigação marcada no cadastro e nenhum card neste mês.</p>
      )}

      <div className="divide-y divide-line rounded-md border border-line">
        {reais.map((c) => (
          <div key={c.contact_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <Link to={`/contatos/${c.contact_id}`} className="text-ui-strong text-ink hover:underline">{c.nome}</Link>
              <p className="text-meta text-muted-ink">
                {c.faltando.length > 0 && <>Faltam: {c.faltando.join(', ')}. </>}
                {c.sem_responsavel.length > 0 && <span className="text-warn">Sem responsável no setor de: {c.sem_responsavel.join(', ')}.</span>}
              </p>
            </div>
            {c.faltando.length > 0 ? (
              <Button size="sm" onClick={() => lancar(c.contact_id)} disabled={pendente !== null}>
                {pendente === c.contact_id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Lançar card
              </Button>
            ) : (
              <Button size="sm" variant="outline" asChild>
                <Link to={`/contatos/${c.contact_id}`}>Definir responsável</Link>
              </Button>
            )}
          </div>
        ))}
      </div>

      {semRegime.length > 0 && (
        <div>
          <button type="button" onClick={() => setVerSemRegime((v) => !v)} className="inline-flex items-center gap-1 text-meta text-muted-ink hover:text-ink">
            {verSemRegime ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {semRegime.length} cadastro{semRegime.length === 1 ? '' : 's'} sem regime e sem responsável (não entram no lançamento)
          </button>
          {verSemRegime && (
            <p className="mt-2 text-meta text-muted-ink">
              {semRegime.map((c, i) => (
                <span key={c.contact_id}>
                  <Link to={`/contatos/${c.contact_id}`} className="hover:underline">{c.nome}</Link>
                  {i < semRegime.length - 1 ? ' · ' : ''}
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
