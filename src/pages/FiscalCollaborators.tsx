import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowRightLeft, UserCheck, ChevronDown, AlertTriangle, Gauge } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
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

import { cn } from '@/lib/utils';

const CAPACITY = 50;

function loadColor(pct: number) {
  if (pct > 100) return { bar: 'bg-red-500', text: 'text-red-600 dark:text-red-400' };
  if (pct > 70) return { bar: 'bg-yellow-500', text: 'text-yellow-600 dark:text-yellow-400' };
  return { bar: 'bg-green-500', text: 'text-green-600 dark:text-green-400' };
}

function useWorkloadByProfile(companyId: string | undefined, year: number, month: number) {
  return useQuery<Record<string, number>>({
    queryKey: ['workload-by-profile', companyId, year, month],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fiscal_tasks')
        .select('responsible_id')
        .eq('company_id', companyId)
        .eq('competence_year', year)
        .eq('competence_month', month)
        .neq('status', 'concluido');
      if (error) throw error;
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        if (!r.responsible_id) return;
        map[r.responsible_id] = (map[r.responsible_id] ?? 0) + 1;
      });
      return map;
    },
  });
}

const STATUS_BADGE: Record<string, string> = {
  a_fazer: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
  em_progresso: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30',
  aguardando_cliente: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
  concluido: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
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
  const { data: workloadMap = {} } = useWorkloadByProfile(
    companyId,
    now.getFullYear(),
    now.getMonth() + 1
  );

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

  // Workload distribution summary
  const distribution = useMemo(() => {
    const items = collaborators.map((c) => {
      const load = workloadMap[c.id] ?? 0;
      const pct = Math.round((load / CAPACITY) * 100);
      return { id: c.id, name: c.full_name || c.email || '—', load, pct };
    });
    if (items.length === 0) {
      return { items, most: null, least: null, avg: 0, spread: 0 };
    }
    const sorted = [...items].sort((a, b) => b.pct - a.pct);
    const most = sorted[0];
    const least = sorted[sorted.length - 1];
    const avg = Math.round(items.reduce((s, i) => s + i.pct, 0) / items.length);
    return { items, most, least, avg, spread: most.pct - least.pct };
  }, [collaborators, workloadMap]);


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between py-4 flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Colaboradores</h1>
        <Button className="gap-2" onClick={() => setModalOpen(true)}>
          <ArrowRightLeft className="w-4 h-4" />
          Transferência Temporária
        </Button>
      </div>

      {distribution.most && distribution.least && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Gauge className="w-5 h-5 text-primary" />
              Distribuição de Carga
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Mais sobrecarregado</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">{distribution.most.name}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px]',
                      distribution.most.pct > 100
                        ? 'bg-red-500/10 text-red-600 border-red-500/30'
                        : distribution.most.pct > 80
                        ? 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30'
                        : 'bg-green-500/10 text-green-600 border-green-500/30'
                    )}
                  >
                    {distribution.most.pct}% da capacidade
                  </Badge>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Mais disponível</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">{distribution.least.name}</span>
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-green-500/10 text-green-600 border-green-500/30"
                  >
                    {distribution.least.pct}% da capacidade
                  </Badge>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Média da equipe</p>
                <div className="flex items-center gap-2">
                  <Progress value={Math.min(distribution.avg, 100)} className="h-2 flex-1" />
                  <span className="text-sm font-medium tabular-nums">{distribution.avg}%</span>
                </div>
              </div>
            </div>
            {distribution.spread > 40 && (
              <Alert className="bg-yellow-500/10 border-yellow-500/40">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertDescription>
                  Distribuição desbalanceada — considerar redistribuição (diferença de {distribution.spread} pontos
                  percentuais entre o mais e o menos carregado).
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Colaboradores Ativos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {collaborators.map((c) => {
            const name = c.full_name || c.email;
            const initials = (name || '?').substring(0, 2).toUpperCase();
            const clientsCount = clientCountMap[c.id] ?? 0;
            const isExpanded = expandedId === c.id;
            const covering = coveringFor[c.id] ?? [];
            const absent = absentTo[c.id] ?? [];
            const load = workloadMap[c.id] ?? 0;
            const loadPct = Math.round((load / CAPACITY) * 100);
            const loadStyle = loadColor(loadPct);
            return (
              <Card
                key={c.id}
                className={cn(
                  'bg-card border-border/50 overflow-hidden cursor-pointer transition-all hover:border-primary/30',
                  isExpanded && 'sm:col-span-2 lg:col-span-3 xl:col-span-4 border-primary/40'
                )}
                onClick={() => setExpandedId(isExpanded ? null : c.id)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Avatar className="w-10 h-10">
                      {c.avatar_url && <AvatarImage src={c.avatar_url} />}
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{name}</p>
                      <Badge variant="outline" className="mt-1 text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                        Ativo
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                        <UserCheck className="w-3 h-3" />
                        {clientsCount} cliente{clientsCount === 1 ? '' : 's'} vinculado{clientsCount === 1 ? '' : 's'}
                      </p>
                      {covering.map((cov, i) => (
                        <Badge
                          key={`cov-${i}`}
                          variant="outline"
                          className="mt-2 mr-1 text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/30"
                        >
                          Cobrindo {cov.count} de {cov.absentName} até {format(parseISO(cov.end_date), 'dd/MM')}
                        </Badge>
                      ))}
                      {absent.map((abs, i) => (
                        <Badge
                          key={`abs-${i}`}
                          variant="outline"
                          className="mt-2 mr-1 text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30"
                        >
                          Ausente — {abs.count} com {abs.coveringName} até {format(parseISO(abs.end_date), 'dd/MM')}
                        </Badge>
                      ))}
                    </div>
                    <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Carga do mês</span>
                      <span className={cn('font-medium tabular-nums', loadStyle.text)}>
                        {load}/{CAPACITY} tarefas ({loadPct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn('h-full transition-all', loadStyle.bar)}
                        style={{ width: `${Math.min(loadPct, 100)}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
                {isExpanded && (
                  <CollaboratorDetailPanel
                    profileId={c.id}
                    onSeeAll={() => navigate(`/fiscal/tarefas?responsible=${c.id}`)}
                  />
                )}
              </Card>
            );
          })}
          {collaborators.length === 0 && (
            <div className="col-span-full text-muted-foreground text-sm">Nenhum colaborador com clientes atribuídos.</div>
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
