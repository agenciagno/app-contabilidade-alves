import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { DsBadge } from '@/components/ds';
import { getContactStatusTone } from '@/lib/contact-display';
import { statusEhInativo } from '@/constants/statusCliente';
import { useClientesForaDeAtendimento } from '@/hooks/useStatusPeriodos';
import { cn } from '@/lib/utils';

/**
 * Box "Fora de atendimento" dos dashboards fiscais (12/10/2026): todo cliente cujo status vigente não é "Ativo", com desde quando.
 * Sem tarefa e sem consulta no Serpro, esses clientes somem das contagens; aqui ficam à vista (inclusive Baixada, Ex-cliente...).
 */
export function ForaDeAtendimentoBox({ className }: { className?: string }) {
  const { data: periodos = [], isLoading } = useClientesForaDeAtendimento();
  const [filtro, setFiltro] = useState<string | null>(null);

  const linhas = useMemo(() => {
    const nome = (p: (typeof periodos)[number]) =>
      p.contacts?.display_name?.trim() || p.contacts?.razao_social?.trim() || p.contacts?.name || 'Cliente';
    return periodos
      .map((p) => ({ ...p, nome: nome(p) }))
      .sort((a, b) =>
        Number(statusEhInativo(a.status)) - Number(statusEhInativo(b.status))
        || (a.inicio ?? '9999').localeCompare(b.inicio ?? '9999')
        || a.nome.localeCompare(b.nome));
  }, [periodos]);

  const porStatus = useMemo(() => {
    const m = new Map<string, number>();
    linhas.forEach((l) => m.set(l.status, (m.get(l.status) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => Number(statusEhInativo(a[0])) - Number(statusEhInativo(b[0])) || b[1] - a[1]);
  }, [linhas]);

  if (isLoading || linhas.length === 0) return null;
  const visiveis = filtro ? linhas.filter((l) => l.status === filtro) : linhas;
  const semData = linhas.filter((l) => !l.inicio).length;

  return (
    <section className={cn('space-y-4 rounded-lg border border-line bg-paper p-5', className)}>
      <div>
        <h2 className="text-h4-card text-ink">Fora de atendimento</h2>
        <p className="text-meta text-muted-ink">
          {linhas.length} {linhas.length === 1 ? 'cliente fora' : 'clientes fora'} do Ativo: sem tarefas e sem consulta no Serpro.
          {semData > 0 && ` ${semData} sem data de início informada.`}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {porStatus.map(([status, n]) => (
          <button
            key={status}
            type="button"
            onClick={() => setFiltro((f) => (f === status ? null : status))}
            aria-pressed={filtro === status}
            className={cn('rounded-pill border px-1 py-0.5 transition-colors', filtro === status ? 'border-ink/60' : 'border-transparent')}
          >
            <DsBadge tone={getContactStatusTone(status)}>{status} · {n}</DsBadge>
          </button>
        ))}
      </div>

      <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-md border border-line">
        {visiveis.map((l) => (
          <li key={l.id}>
            <Link to={`/crm/cliente/${l.contact_id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm hover:bg-bg-2">
              <span className="min-w-0 flex-1 truncate text-ink">{l.nome}</span>
              <DsBadge tone={getContactStatusTone(l.status)}>{l.status}</DsBadge>
              <span className={cn('text-meta', l.inicio ? 'text-muted-ink' : 'text-warn')}>
                {l.inicio ? `desde ${format(parseISO(l.inicio), 'dd/MM/yyyy')}` : 'data não informada'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
