import { format, parseISO } from 'date-fns';
import { TriangleAlert } from 'lucide-react';
import { statusEhInativo } from '@/constants/statusCliente';
import { cn } from '@/lib/utils';

/**
 * Faixa no topo da ficha quando o cliente não está no "Ativo" (12/10/2026). Mostra qual status, desde quando e o que isso significa
 * para a equipe: nesse intervalo não há tarefa nem consulta no Serpro, então o que ficou sem entrega se explica por aqui.
 */
export function FaixaStatusCliente({ status, desde, motivo }: { status?: string | null; desde?: string | null; motivo?: string | null }) {
  if (!status || status === 'Ativo') return null;
  const inativo = statusEhInativo(status);

  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-md border px-4 py-3 text-sm',
        inativo ? 'border-line bg-bg-2 text-ink' : 'border-warn/40 bg-warn/10 text-warn',
      )}
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-0.5">
        <p>
          <strong>{status}</strong>{' '}
          {desde ? `desde ${format(parseISO(desde), 'dd/MM/yyyy')}` : '(data de início não informada)'}
          {motivo ? ` · ${motivo}` : ''}
        </p>
        <p className={inativo ? 'text-muted-ink' : ''}>
          {inativo
            ? 'Cliente inativo: sem tarefas, boletos, avisos nem Serpro.'
            : 'Fora do Ativo: sem tarefas e sem consulta no Serpro até voltar a Ativo. Os boletos continuam, com aviso.'}
          {' '}O que não foi entregue neste período se explica por aqui; o histórico está em Operacional › Datas.
        </p>
      </div>
    </div>
  );
}
