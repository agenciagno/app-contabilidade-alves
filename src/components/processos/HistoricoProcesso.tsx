import { useMemo } from 'react';
import { format } from 'date-fns';

import { Skeleton } from '@/components/ui/skeleton';
import { useTeamProfiles } from '@/hooks/useTeamProfiles';
import { ProcessoOpcao, useProcessoEventos } from '@/hooks/useProcessos';

const CANAL: Record<string, string> = { email: 'E-mail', whatsapp: 'WhatsApp', copiar: 'Texto copiado' };

interface Props {
  processoId: string;
  opcoes: Map<string, ProcessoOpcao>;
  /** 'mensagens' mostra só os envios ao cliente (janela de notificação). */
  so?: 'mensagens';
}

/** Linha do tempo do processo: cada troca de status (gravada pelo banco) e cada mensagem enviada ao cliente. */
export function HistoricoProcesso({ processoId, opcoes, so }: Props) {
  const { data: eventos = [], isLoading } = useProcessoEventos(processoId);
  const { data: equipe = [] } = useTeamProfiles();
  const nomes = useMemo(() => new Map(equipe.map((p) => [p.id, p.full_name])), [equipe]);
  const lista = so === 'mensagens' ? eventos.filter((e) => e.tipo === 'mensagem') : eventos;

  if (isLoading) return <Skeleton className="h-10 w-full" />;
  if (lista.length === 0) {
    return <p className="text-meta text-muted-ink-2">{so === 'mensagens' ? 'Nenhuma mensagem enviada ainda.' : 'Sem histórico ainda.'}</p>;
  }
  return (
    <ul className="max-h-48 space-y-1.5 overflow-y-auto">
      {lista.map((e) => {
        const quem = e.autor_id ? nomes.get(e.autor_id) : null;
        const oque = e.tipo === 'status'
          ? <>Status: <span className="text-ink">{opcoes.get(e.status_id ?? '')?.nome ?? '—'}</span></>
          : <>Mensagem · {CANAL[e.canal ?? ''] ?? e.canal}</>;
        return (
          <li key={e.id} className="flex gap-2 text-meta text-muted-ink">
            <span className="shrink-0 font-mono text-muted-ink-2">{format(new Date(e.created_at), 'dd/MM/yyyy HH:mm')}</span>
            <span className="min-w-0">{oque}{quem ? ` · ${quem}` : ''}</span>
          </li>
        );
      })}
    </ul>
  );
}
