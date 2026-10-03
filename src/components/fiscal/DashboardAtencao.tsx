import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronDown, ChevronUp, History } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { FiscalTaskRow } from '@/hooks/useFiscalDashboard';

/** Até quantos dias de atraso conta como "recente"; acima disso é "atraso antigo" (separado para não afogar o alerta). */
export const ATRASO_RECENTE_DIAS = 30;

export const diasDeAtraso = (dueDate: string | null, today: string): number =>
  dueDate ? Math.round((parseISO(today).getTime() - parseISO(dueDate).getTime()) / 86_400_000) : 0;

export const isAtrasoAntigo = (t: { due_date: string | null }, today: string) => diasDeAtraso(t.due_date, today) > ATRASO_RECENTE_DIAS;

interface Props {
  /** Vencidas e não concluídas, de todos os meses (já com os filtros de regime e setor). */
  overdue: FiscalTaskRow[];
  /** Não concluídas que vencem de hoje até daqui a 7 dias. */
  dueSoon: FiscalTaskRow[];
  /** Tarefas que vencem no mês aberto. */
  monthTasks: FiscalTaskRow[];
  profiles: { id: string; full_name: string | null }[];
  today: string;
  onClient: (contactId: string) => void;
  onCollaborator: (profileId: string) => void;
}

const nomeObrigacao = (t: FiscalTaskRow) => t.fiscal_obligations_catalog?.name ?? t.title ?? 'Obrigação';

function Barra({ valor, max, className }: { valor: number; max: number; className?: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-muted">
      <div className={cn('h-full rounded-full', className ?? 'bg-danger')} style={{ width: `${max > 0 ? Math.max(4, Math.round((valor / max) * 100)) : 0}%` }} />
    </div>
  );
}

/** Faixa de respostas do Dashboard Fiscal: o que está vencido, o que vem aí, quais clientes e qual colaborador. */
export function DashboardAtencao({ overdue, dueSoon, monthTasks, profiles, today, onClient, onCollaborator }: Props) {
  const [antigoAberto, setAntigoAberto] = useState(false);

  const { recentes, antigas } = useMemo(() => {
    const recentes: FiscalTaskRow[] = [];
    const antigas: FiscalTaskRow[] = [];
    overdue.forEach((t) => (isAtrasoAntigo(t, today) ? antigas : recentes).push(t));
    return { recentes, antigas };
  }, [overdue, today]);

  // ---- O que está vencido (recente), por obrigação
  const vencidoPorObrigacao = useMemo(() => {
    const map = new Map<string, { nome: string; qtd: number; maisAntiga: number; clientes: Set<string> }>();
    recentes.forEach((t) => {
      const nome = nomeObrigacao(t);
      const r = map.get(nome) ?? { nome, qtd: 0, maisAntiga: 0, clientes: new Set<string>() };
      r.qtd += 1;
      r.maisAntiga = Math.max(r.maisAntiga, diasDeAtraso(t.due_date, today));
      if (t.contact_id) r.clientes.add(t.contact_id);
      map.set(nome, r);
    });
    return [...map.values()].sort((a, b) => b.qtd - a.qtd);
  }, [recentes, today]);

  // ---- Atraso antigo, por obrigação
  const antigoPorObrigacao = useMemo(() => {
    const map = new Map<string, { nome: string; qtd: number; maisAntiga: number; clientes: Set<string> }>();
    antigas.forEach((t) => {
      const nome = nomeObrigacao(t);
      const r = map.get(nome) ?? { nome, qtd: 0, maisAntiga: 0, clientes: new Set<string>() };
      r.qtd += 1;
      r.maisAntiga = Math.max(r.maisAntiga, diasDeAtraso(t.due_date, today));
      if (t.contact_id) r.clientes.add(t.contact_id);
      map.set(nome, r);
    });
    return [...map.values()].sort((a, b) => b.qtd - a.qtd);
  }, [antigas, today]);
  const clientesAntigo = useMemo(() => new Set(antigas.map((t) => t.contact_id).filter(Boolean)).size, [antigas]);

  // ---- Vence nos próximos 7 dias: por dia, com as obrigações
  const aVencer = useMemo(() => {
    const dias = new Map<string, Map<string, number>>();
    dueSoon.forEach((t) => {
      if (!t.due_date) return;
      const d = dias.get(t.due_date) ?? new Map<string, number>();
      d.set(nomeObrigacao(t), (d.get(nomeObrigacao(t)) ?? 0) + 1);
      dias.set(t.due_date, d);
    });
    return [...dias.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([iso, obrs]) => ({
      iso,
      total: [...obrs.values()].reduce((s, n) => s + n, 0),
      obrigacoes: [...obrs.entries()].sort((a, b) => b[1] - a[1]),
    }));
  }, [dueSoon]);

  // ---- Clientes com mais vencidas
  const clientes = useMemo(() => {
    const map = new Map<string, { id: string; nome: string; recentes: number; antigas: number }>();
    overdue.forEach((t) => {
      if (!t.contact_id) return;
      const r = map.get(t.contact_id) ?? { id: t.contact_id, nome: t.contacts?.name ?? '—', recentes: 0, antigas: 0 };
      if (isAtrasoAntigo(t, today)) r.antigas += 1;
      else r.recentes += 1;
      map.set(t.contact_id, r);
    });
    return [...map.values()].sort((a, b) => b.recentes - a.recentes || b.antigas - a.antigas || a.nome.localeCompare(b.nome));
  }, [overdue, today]);

  // ---- Colaboradores
  const colaboradores = useMemo(() => {
    type R = { id: string | null; nome: string; recentes: number; antigas: number; aVencer: number; andamento: number; concluidas: number; totalMes: number };
    const map = new Map<string, R>();
    const get = (id: string | null): R => {
      const key = id ?? '__sem__';
      let r = map.get(key);
      if (!r) {
        r = { id, nome: id ? (profiles.find((p) => p.id === id)?.full_name ?? 'Colaborador') : 'Sem responsável', recentes: 0, antigas: 0, aVencer: 0, andamento: 0, concluidas: 0, totalMes: 0 };
        map.set(key, r);
      }
      return r;
    };
    overdue.forEach((t) => { const r = get(t.responsible_id); if (isAtrasoAntigo(t, today)) r.antigas += 1; else r.recentes += 1; });
    dueSoon.forEach((t) => { get(t.responsible_id).aVencer += 1; });
    monthTasks.forEach((t) => {
      const r = get(t.responsible_id);
      r.totalMes += 1;
      if (t.status === 'concluido') r.concluidas += 1;
      if (t.status === 'em_progresso') r.andamento += 1;
    });
    return [...map.values()].sort((a, b) => b.recentes - a.recentes || b.antigas - a.antigas || b.aVencer - a.aVencer);
  }, [overdue, dueSoon, monthTasks, profiles, today]);

  const maxObrig = vencidoPorObrigacao[0]?.qtd ?? 0;
  const topAntigo = antigoPorObrigacao.slice(0, 3);
  const pctTop = antigas.length > 0 ? Math.round((topAntigo.reduce((s, o) => s + o.qtd, 0) / antigas.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Atraso antigo: separado do recente para não afogar o alerta */}
      {antigas.length > 0 && (
        <Card className="border-l-[3px] border-l-muted-ink-2">
          <CardContent className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <History className="mt-0.5 h-5 w-5 shrink-0 text-muted-ink" />
                <div className="min-w-0">
                  <p className="text-ui-strong text-ink">
                    Atraso antigo: {antigas.length.toLocaleString('pt-BR')} tarefas vencidas há mais de {ATRASO_RECENTE_DIAS} dias
                  </p>
                  <p className="text-meta text-muted-ink">
                    Em {clientesAntigo} cliente{clientesAntigo === 1 ? '' : 's'}. {topAntigo.map((o) => `${o.nome} (${o.qtd})`).join(', ')}
                    {antigoPorObrigacao.length > 3 ? ` e mais ${antigoPorObrigacao.length - 3}` : ''} concentram {pctTop}%.
                    Fica fora dos alertas abaixo: confirme com o Fiscal o que ainda vale e encerre o resto em lote, em Tarefas.
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setAntigoAberto((v) => !v)} className="inline-flex shrink-0 items-center gap-1 text-meta text-muted-ink hover:text-ink">
                {antigoAberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {antigoAberto ? 'Ocultar' : 'Ver por obrigação'}
              </button>
            </div>
            {antigoAberto && (
              <div className="mt-3 overflow-hidden rounded-md border border-line">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Obrigação</TableHead>
                      <TableHead className="text-right">Tarefas</TableHead>
                      <TableHead className="text-right">Clientes</TableHead>
                      <TableHead className="text-right">Mais antiga</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {antigoPorObrigacao.map((o) => (
                      <TableRow key={o.nome}>
                        <TableCell className="font-medium">{o.nome}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.qtd}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.clientes.size}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-ink">{o.maisAntiga} dias</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 1) O que está vencido */}
        <Card>
          <CardHeader className="space-y-0 pb-3">
            <CardTitle className="text-base">Vencido nos últimos {ATRASO_RECENTE_DIAS} dias</CardTitle>
            <p className="text-meta text-muted-ink">{recentes.length} tarefa{recentes.length === 1 ? '' : 's'} · por obrigação</p>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {vencidoPorObrigacao.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-ink">Nada vencido nos últimos {ATRASO_RECENTE_DIAS} dias.</p>
            ) : (
              vencidoPorObrigacao.slice(0, 8).map((o) => (
                <div key={o.nome} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium text-ink">{o.nome}</span>
                    <span className="shrink-0 text-meta text-muted-ink">
                      <strong className="text-danger tabular-nums">{o.qtd}</strong> · {o.clientes.size} cliente{o.clientes.size === 1 ? '' : 's'} · há até {o.maisAntiga} dia{o.maisAntiga === 1 ? '' : 's'}
                    </span>
                  </div>
                  <Barra valor={o.qtd} max={maxObrig} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* 2) O que está pendente: vence nos próximos 7 dias */}
        <Card>
          <CardHeader className="space-y-0 pb-3">
            <CardTitle className="text-base">Vence nos próximos 7 dias</CardTitle>
            <p className="text-meta text-muted-ink">{dueSoon.length} tarefa{dueSoon.length === 1 ? '' : 's'} · por dia</p>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-0">
            {aVencer.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-ink">Nada vence nos próximos 7 dias.</p>
            ) : (
              aVencer.slice(0, 7).map((d) => (
                <div key={d.iso} className="flex items-start gap-3 rounded-md border border-line px-3 py-2">
                  <div className="w-14 shrink-0 text-center">
                    <p className="text-[10px] uppercase text-muted-ink">{format(parseISO(d.iso), 'EEE', { locale: ptBR })}</p>
                    <p className="text-sm font-bold text-ink">{format(parseISO(d.iso), 'dd/MM')}</p>
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    {d.obrigacoes.slice(0, 3).map(([nome, n]) => (
                      <p key={nome} className="truncate text-ink">{nome} <span className="text-muted-ink">· {n}</span></p>
                    ))}
                    {d.obrigacoes.length > 3 && <p className="text-meta text-muted-ink">e mais {d.obrigacoes.length - 3} obrigações</p>}
                  </div>
                  <Badge variant="secondary" className="shrink-0 tabular-nums">{d.total}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* 3) Quais clientes */}
        <Card>
          <CardHeader className="space-y-0 pb-3">
            <CardTitle className="text-base">Clientes com mais vencidas</CardTitle>
            <p className="text-meta text-muted-ink">{clientes.length} cliente{clientes.length === 1 ? '' : 's'} com tarefa vencida · clique para abrir no Kanban</p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Recentes</TableHead>
                  <TableHead className="text-right">Antigas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientes.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="py-8 text-center text-muted-ink">Nenhum cliente com tarefa vencida.</TableCell></TableRow>
                ) : (
                  clientes.slice(0, 10).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        <button type="button" onClick={() => onClient(c.id)} className="text-left hover:underline">{c.nome}</button>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.recentes > 0 ? <Badge className="border-danger/30 bg-danger/15 text-danger">{c.recentes}</Badge> : <span className="text-muted-ink">0</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-ink">{c.antigas}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 4) Qual colaborador */}
        <Card>
          <CardHeader className="space-y-0 pb-3">
            <CardTitle className="text-base">Colaboradores</CardTitle>
            <p className="text-meta text-muted-ink">Vencidas, o que vence em 7 dias e o mês concluído · clique para abrir as tarefas</p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead className="text-right">Recentes</TableHead>
                  <TableHead className="text-right">Antigas</TableHead>
                  <TableHead className="text-right">7 dias</TableHead>
                  <TableHead className="text-right">Mês</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {colaboradores.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-ink">Sem tarefas para mostrar.</TableCell></TableRow>
                ) : (
                  colaboradores.map((c) => (
                    <TableRow key={c.id ?? '__sem__'}>
                      <TableCell className="font-medium">
                        {c.id ? <button type="button" onClick={() => onCollaborator(c.id!)} className="text-left hover:underline">{c.nome}</button> : <span className="text-warn">{c.nome}</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.recentes > 0 ? <Badge className="border-danger/30 bg-danger/15 text-danger">{c.recentes}</Badge> : <span className="text-muted-ink">0</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-ink">{c.antigas}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.aVencer}</TableCell>
                      <TableCell
                        className="text-right tabular-nums text-muted-ink"
                        title={c.totalMes > 0 ? `${c.concluidas} de ${c.totalMes} concluídas no mês · ${c.andamento} em andamento` : undefined}
                      >
                        {c.totalMes > 0 ? `${Math.round((c.concluidas / c.totalMes) * 100)}%` : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
