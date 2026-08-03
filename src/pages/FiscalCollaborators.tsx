import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowRightLeft, UserCheck, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useUserRole } from '@/hooks/useUserRole';
import { useCompany } from '@/hooks/useCompany';
import {
  useCollaborators,
  useAllFiscalProfiles,
  useClientCountByProfile,
  useCollaboratorDetails,
} from '@/hooks/useCollaboratorCoverage';
import { useTransferHistory } from '@/hooks/useTemporaryTransfers';
import { TransferTemporaryModal } from '@/components/fiscal/TransferTemporaryModal';
import { TransferHistoryPanel } from '@/components/fiscal/TransferHistoryPanel';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader, StatCardRow, IconBox, DsBadge, type BadgeTone } from '@/components/ds';

import { cn } from '@/lib/utils';

const CAPACITY = 50;

function loadColor(pct: number) {
  if (pct > 100) return { bar: 'bg-danger', text: 'text-danger dark:text-danger' };
  if (pct > 70) return { bar: 'bg-warn', text: 'text-warn dark:text-warn' };
  return { bar: 'bg-ok', text: 'text-ok dark:text-ok' };
}

interface TaskStats { total: number; overdue: number; done: number }

/** Tarefas/Atrasadas/Entregues na competência, por responsável + um balde para
 * as sem responsável — uma varredura só, agregada no client (mesmo padrão já
 * usado nesta página para carga mensal). */
function useCompetenceTaskStats(companyId: string | undefined, year: number, month: number) {
  return useQuery<{ byProfile: Record<string, TaskStats>; unassigned: TaskStats }>({
    queryKey: ['competence-task-stats', companyId, year, month],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fiscal_tasks')
        .select('responsible_id, status, due_date')
        .eq('company_id', companyId)
        .eq('competence_year', year)
        .eq('competence_month', month);
      if (error) throw error;
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const byProfile: Record<string, TaskStats> = {};
      const unassigned: TaskStats = { total: 0, overdue: 0, done: 0 };
      (data ?? []).forEach((r: any) => {
        const bucket = r.responsible_id ? (byProfile[r.responsible_id] ??= { total: 0, overdue: 0, done: 0 }) : unassigned;
        bucket.total += 1;
        if (r.status === 'concluido') bucket.done += 1;
        else if (r.due_date && r.due_date < todayStr) bucket.overdue += 1;
      });
      return { byProfile, unassigned };
    },
  });
}

function ColaboradorCard({
  nome, desde, subtitle, badge, stats, load, loadPct, onClick,
}: {
  nome: string; desde?: string | null; subtitle?: string; badge: { tone: BadgeTone; label: string };
  stats: TaskStats; load: number; loadPct: number; onClick?: () => void;
}) {
  const loadStyle = loadColor(loadPct);
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border border-line bg-paper text-left transition-colors',
        onClick && 'cursor-pointer hover:border-ink/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <div className="flex gap-3 px-[18px] pb-4 pt-[18px]">
        <IconBox tone="neutral" icon={<Users strokeWidth={1.75} />} />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-h4-card text-ink">{nome}</p>
            <DsBadge tone={badge.tone} className="shrink-0">{badge.label}</DsBadge>
          </div>
          <p className="truncate text-meta text-muted-ink-2">
            {subtitle ?? (desde ? `equipe fiscal · desde ${desde}` : 'equipe fiscal')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 border-t border-line-2">
        <MetricaCard label="Tarefas" valor={stats.total} />
        <MetricaCard label="Atrasadas" valor={stats.overdue} className="border-l border-line-2" />
        <MetricaCard label="Entregues" valor={stats.done} className="border-l border-line-2" />
      </div>

      {/* Carga do mês vs capacidade — não tem slot no Figma, mas é o dado que
          decide o badge de sobrecarga; mantido em faixa compacta abaixo. */}
      <div className="border-t border-line-2 px-[18px] py-2.5">
        <div className="mb-1 flex items-center justify-between text-meta">
          <span className="text-muted-ink-2">Carga do mês</span>
          <span className={cn('font-medium tabular-nums', loadStyle.text)}>{load}/{CAPACITY}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-pill bg-bg-2">
          <div className={cn('h-full transition-all', loadStyle.bar)} style={{ width: `${Math.min(loadPct, 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

function MetricaCard({ label, valor, className }: { label: string; valor: number; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-[3px] py-3 pl-3.5 pr-2.5', className)}>
      <span className="truncate text-kicker uppercase text-muted-ink-2">{label}</span>
      <span className="truncate text-h4-card text-ink">{valor}</span>
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  a_fazer: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
  em_progresso: 'bg-warn/15 text-warn dark:text-warn border-warn/30',
  aguardando_cliente: 'bg-warn/15 text-warn dark:text-warn border-warn/30',
  concluido: 'bg-ok/15 text-ok dark:text-ok border-ok/30',
};
const STATUS_LABEL: Record<string, string> = {
  a_fazer: 'A Fazer',
  em_progresso: 'Em Progresso',
  aguardando_cliente: 'Aguardando',
  concluido: 'Concluído',
};

function CollaboratorDetailPanel({ profileId, onSeeAll }: { profileId: string; onSeeAll: () => void }) {
  const now = new Date();
  const { data, isLoading } = useCollaboratorDetails(profileId, now.getFullYear(), now.getMonth() + 1);
  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Carregando...</div>;
  const total = data?.total ?? 0;
  const done = data?.done ?? 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const upcoming = data?.upcoming ?? [];
  return (
    <div className="p-4 space-y-4 border-t border-border/40 bg-muted/20">
      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>Progresso do mês</span>
          <span className="font-medium">{done} de {total} ({pct}%)</span>
        </div>
        <Progress value={pct} />
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Próximas tarefas pendentes</p>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma tarefa pendente.</p>
        ) : (
          <ul className="space-y-1.5">
            {upcoming.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">
                  <span className="font-medium">{t.contacts?.name ?? '—'}</span>
                  <span className="text-muted-foreground"> · {t.fiscal_obligations_catalog?.name ?? t.title ?? '—'}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {t.due_date ? format(parseISO(t.due_date), 'dd/MM', { locale: ptBR }) : '—'}
                </span>
                <Badge variant="outline" className={cn('text-[10px]', STATUS_BADGE[t.status])}>
                  {STATUS_LABEL[t.status] ?? t.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={onSeeAll}>Ver todas as tarefas</Button>
    </div>
  );
}

export default function FiscalCollaborators() {
  const navigate = useNavigate();
  const { isAdmin, isSuperAdmin } = useUserRole();
  const { company } = useCompany();
  const companyId = company?.id;

  useEffect(() => {
    if (!isAdmin && !isSuperAdmin) {
      navigate('/fiscal/tarefas', { replace: true });
    }
  }, [isAdmin, isSuperAdmin, navigate]);

  const { data: collaborators = [] } = useCollaborators();
  const { data: allFiscalProfiles = [] } = useAllFiscalProfiles();
  const { data: clientCountMap = {} } = useClientCountByProfile();
  const { data: history = [] } = useTransferHistory();

  const now = new Date();
  const { data: taskStats } = useCompetenceTaskStats(companyId, now.getFullYear(), now.getMonth() + 1);
  const byProfile = taskStats?.byProfile ?? {};
  const unassigned = taskStats?.unassigned ?? { total: 0, overdue: 0, done: 0 };

  const [modalOpen, setModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Active coverages per profile (as covering or as absent)
  const { coveringFor, absentTo } = useMemo(() => {
    const coveringFor: Record<string, { absentName: string; count: number; end_date: string }[]> = {};
    const absentTo: Record<string, { coveringName: string; count: number; end_date: string }[]> = {};
    history.filter((h) => h.is_active).forEach((h) => {
      const count = (h.clients_transferred ?? []).length;
      (coveringFor[h.covering_profile_id] ??= []).push({
        absentName: h.absent_profile?.full_name ?? '—',
        count,
        end_date: h.end_date,
      });
      (absentTo[h.absent_profile_id] ??= []).push({
        coveringName: h.covering_profile?.full_name ?? '—',
        count,
        end_date: h.end_date,
      });
    });
    return { coveringFor, absentTo };
  }, [history]);

  // Carga (pendentes/CAPACITY) por colaborador — decide o badge sobrecarga/no ritmo
  // e a faixa de capacidade do card; StatCard 03 usa a média de `stats.total`.
  const loads = useMemo(() => {
    return collaborators.map((c) => {
      const pending = (byProfile[c.id]?.total ?? 0) - (byProfile[c.id]?.done ?? 0);
      const pct = Math.round((pending / CAPACITY) * 100);
      return { id: c.id, load: pending, pct };
    });
  }, [collaborators, byProfile]);
  const loadById = useMemo(() => Object.fromEntries(loads.map((l) => [l.id, l])), [loads]);
  const sobrecarregados = loads.filter((l) => l.pct > 100).length;
  const mediaPorPessoa = collaborators.length
    ? Math.round(collaborators.reduce((s, c) => s + (byProfile[c.id]?.total ?? 0), 0) / collaborators.length)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/tarefas · equipe"
        title="Colaboradores."
        subtitle="Carga de trabalho da equipe fiscal na competência."
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <ArrowRightLeft className="h-4 w-4" />
            Distribuir tarefas
          </Button>
        }
      />

      <StatCardRow
        items={[
          { label: 'Colaboradores', value: collaborators.length, hint: 'na equipe fiscal' },
          { label: 'Sobrecarregados', value: sobrecarregados, hint: 'acima da capacidade mensal', emphasis: sobrecarregados > 0 ? 'warm' : 'none' },
          { label: 'Média por pessoa', value: mediaPorPessoa, hint: 'tarefas na competência' },
          { label: 'Sem responsável', value: unassigned.total, hint: 'a distribuir' },
        ]}
      />

      <section className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {collaborators.map((c) => {
            const name = c.full_name || c.email || '—';
            const clientsCount = clientCountMap[c.id] ?? 0;
            const isExpanded = expandedId === c.id;
            const covering = coveringFor[c.id] ?? [];
            const absent = absentTo[c.id] ?? [];
            const stats = byProfile[c.id] ?? { total: 0, overdue: 0, done: 0 };
            const { load, pct: loadPct } = loadById[c.id] ?? { load: 0, pct: 0 };
            const desde = c.created_at ? format(parseISO(c.created_at), 'yyyy') : null;
            const badge: { tone: BadgeTone; label: string } =
              loadPct > 100 ? { tone: 'warn', label: 'sobrecarga' } : { tone: 'ok', label: 'no ritmo' };
            return (
              <div key={c.id} className={cn(isExpanded && 'sm:col-span-2 xl:col-span-3')}>
                <ColaboradorCard
                  nome={name}
                  desde={desde}
                  badge={badge}
                  stats={stats}
                  load={load}
                  loadPct={loadPct}
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                />
                {(covering.length > 0 || absent.length > 0) && (
                  <div className="flex flex-wrap gap-1.5 px-1 pt-2">
                    {covering.map((cov, i) => (
                      <Badge key={`cov-${i}`} variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/30">
                        Cobrindo {cov.count} de {cov.absentName} até {format(parseISO(cov.end_date), 'dd/MM')}
                      </Badge>
                    ))}
                    {absent.map((abs, i) => (
                      <Badge key={`abs-${i}`} variant="outline" className="text-[10px] bg-warn/10 text-warn border-warn/30">
                        Ausente — {abs.count} com {abs.coveringName} até {format(parseISO(abs.end_date), 'dd/MM')}
                      </Badge>
                    ))}
                  </div>
                )}
                {isExpanded && (
                  <div className="mt-2 flex items-center gap-1.5 px-1 text-meta text-muted-ink-2">
                    <UserCheck className="h-3 w-3" />
                    {clientsCount} cliente{clientsCount === 1 ? '' : 's'} vinculado{clientsCount === 1 ? '' : 's'}
                  </div>
                )}
                {isExpanded && (
                  <div className="mt-2 overflow-hidden rounded-lg border border-line">
                    <CollaboratorDetailPanel
                      profileId={c.id}
                      onSeeAll={() => navigate(`/fiscal/tarefas?responsible=${c.id}`)}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* Não atribuídas — espelha o último card do Figma; sem clique (não há
              filtro "sem responsável" pronto em /fiscal/tarefas). */}
          <ColaboradorCard
            nome="Não atribuídas"
            desde={null}
            subtitle="aguardando distribuição"
            badge={{ tone: unassigned.total > 0 ? 'danger' : 'neutral', label: unassigned.total > 0 ? `${unassigned.total} tarefas` : 'em dia' }}
            stats={unassigned}
            load={0}
            loadPct={0}
          />

          {collaborators.length === 0 && (
            <div className="col-span-full text-sm text-muted-ink">Nenhum colaborador com clientes atribuídos.</div>
          )}
        </div>
      </section>

      {(isAdmin || isSuperAdmin) && <TransferHistoryPanel />}

      <TransferTemporaryModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        sourceCollaborators={collaborators}
        destinationCollaborators={allFiscalProfiles}
      />
    </div>
  );
}
