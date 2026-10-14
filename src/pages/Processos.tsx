import { useMemo, useState } from 'react';
import { format, startOfMonth, subDays } from 'date-fns';
import {
  CalendarRange, Landmark, ListChecks, MessageCircle, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2, User, Wrench, X,
} from 'lucide-react';
import { toast } from 'sonner';

import { DateField, DsBadge, PageHeader, SearchField, StatCard, segmentedListClass, segmentedTriggerClass } from '@/components/ds';
import { TABELA_ROLAVEL } from '@/components/monitor/MonitorUi';
import { SearchableSelect } from '@/components/fiscal/SearchableSelect';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useUserRole } from '@/hooks/useUserRole';
import { useTeamProfiles } from '@/hooks/useTeamProfiles';
import {
  DIAS_ATRASO, PapelStatus, ProcessoOpcao, ProcessoRow, nomeCliente, situacaoProcesso,
  useExcluirProcesso, useProcessoOpcoes, useProcessos, useTrocarStatusProcesso,
} from '@/hooks/useProcessos';
import { ProcessoFormDialog } from '@/components/processos/ProcessoFormDialog';
import { NotificarProcessoDialog } from '@/components/processos/NotificarProcessoDialog';

type Aba = 'abertos' | 'finalizados' | 'todos';
type Recorte = 'atrasados' | 'aguardando' | 'concluidos_mes' | null;
type Periodo = 'todos' | '7' | '30' | '90' | 'personalizado';

const TOM_STATUS: Record<PapelStatus, 'neutral' | 'warn' | 'ok'> = {
  inicial: 'neutral', aguardando_cliente: 'warn', concluido: 'ok', cancelado: 'neutral',
};

const RECORTE_LABEL: Record<Exclude<Recorte, null>, string> = {
  atrasados: `Atrasados (+${DIAS_ATRASO} dias)`,
  aguardando: 'Aguardando cliente',
  concluidos_mes: 'Concluídos no mês',
};

/**
 * Processos (14/10/2026, pedido de Gabriel): controle dos processos de abertura, alteração, baixa etc. pedidos pelo cliente,
 * no lugar da planilha "TAREFAS COMERCIAL" do Legalização. Linha vermelha: não concluído e com mais de 30 dias desde a
 * solicitação; laranja: aguardando cliente (o laranja prevalece).
 */
export default function Processos() {
  const { data: processos = [], isLoading } = useProcessos();
  const { data: opcoes = [] } = useProcessoOpcoes();
  const { data: equipe = [] } = useTeamProfiles();
  const { isAdmin, isSuperAdmin } = useUserRole();
  const trocarStatus = useTrocarStatusProcesso();
  const excluir = useExcluirProcesso();

  const [aba, setAba] = useState<Aba>('abertos');
  const [recorte, setRecorte] = useState<Recorte>(null);
  const [busca, setBusca] = useState('');
  const [filtroServico, setFiltroServico] = useState('all');
  const [filtroOrgao, setFiltroOrgao] = useState('all');
  const [filtroStatus, setFiltroStatus] = useState('all');
  const [filtroResp, setFiltroResp] = useState('all');
  const [periodo, setPeriodo] = useState<Periodo>('todos');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');

  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<ProcessoRow | null>(null);
  const [notificando, setNotificando] = useState<ProcessoRow | null>(null);
  const [excluindo, setExcluindo] = useState<ProcessoRow | null>(null);

  const mapaOpcoes = useMemo(() => new Map(opcoes.map((o) => [o.id, o])), [opcoes]);
  const nomesEquipe = useMemo(() => new Map(equipe.map((p) => [p.id, p.full_name])), [equipe]);
  const listaStatus = useMemo(() => opcoes.filter((o) => o.tipo === 'status'), [opcoes]);
  const opcoesFiltro = (tipo: ProcessoOpcao['tipo']) => opcoes
    .filter((o) => o.tipo === tipo)
    .map((o) => ({ value: o.id, label: o.nome }))
    .sort((a, b) => (tipo === 'status' ? 0 : a.label.localeCompare(b.label, 'pt-BR')));

  const linhas = useMemo(() => processos.map((p) => ({ p, s: situacaoProcesso(p, mapaOpcoes) })), [processos, mapaOpcoes]);

  const inicioMes = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const concluidoNoMes = (p: ProcessoRow, papel: PapelStatus | null) =>
    papel === 'concluido' && !!p.concluido_em && format(new Date(p.concluido_em), 'yyyy-MM-dd') >= inicioMes;

  const stats = useMemo(() => ({
    abertos: linhas.filter(({ s }) => !s.finalizado).length,
    atrasados: linhas.filter(({ s }) => s.atrasado).length,
    aguardando: linhas.filter(({ s }) => s.aguardandoCliente).length,
    concluidosMes: linhas.filter(({ p, s }) => concluidoNoMes(p, s.papel)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [linhas, inicioMes]);

  const [dataDe, dataAte] = useMemo((): [string, string] => {
    if (periodo === 'personalizado') return [de, ate];
    if (periodo === 'todos') return ['', ''];
    return [format(subDays(new Date(), Number(periodo)), 'yyyy-MM-dd'), ''];
  }, [periodo, de, ate]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas
      .filter(({ s }) => aba === 'todos' || (aba === 'abertos' ? !s.finalizado : s.finalizado))
      .filter(({ p, s }) => {
        if (recorte === 'atrasados') return s.atrasado;
        if (recorte === 'aguardando') return s.aguardandoCliente;
        if (recorte === 'concluidos_mes') return concluidoNoMes(p, s.papel);
        return true;
      })
      .filter(({ p }) => filtroServico === 'all' || p.servico_id === filtroServico)
      .filter(({ p }) => filtroOrgao === 'all' || p.orgao_id === filtroOrgao)
      .filter(({ p }) => filtroStatus === 'all' || p.status_id === filtroStatus)
      .filter(({ p }) => filtroResp === 'all' || p.responsavel_id === filtroResp)
      .filter(({ p }) => (!dataDe || p.data_solicitacao >= dataDe) && (!dataAte || p.data_solicitacao <= dataAte))
      .filter(({ p }) => !q || [nomeCliente(p), p.contacts?.name, p.contacts?.document, p.protocolo, p.observacao]
        .some((t) => (t ?? '').toLowerCase().includes(q)))
      // Abertos primeiro e, dentro de cada grupo, a solicitação mais antiga no topo (os atrasados sobem sozinhos).
      .sort((a, b) => Number(a.s.finalizado) - Number(b.s.finalizado) || a.p.data_solicitacao.localeCompare(b.p.data_solicitacao));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, aba, recorte, busca, filtroServico, filtroOrgao, filtroStatus, filtroResp, dataDe, dataAte, inicioMes]);

  const temFiltro = !!busca || filtroServico !== 'all' || filtroOrgao !== 'all' || filtroStatus !== 'all' || filtroResp !== 'all' || periodo !== 'todos' || !!recorte;
  const limparFiltros = () => {
    setBusca(''); setFiltroServico('all'); setFiltroOrgao('all'); setFiltroStatus('all'); setFiltroResp('all');
    setPeriodo('todos'); setDe(''); setAte(''); setRecorte(null);
  };

  const clicarCard = (r: Recorte, abaDoCard: Aba) => {
    if (recorte === r && aba === abaDoCard) { setRecorte(null); return; }
    setAba(abaDoCard);
    setRecorte(r);
  };

  const handleTrocarStatus = async (p: ProcessoRow, statusId: string) => {
    if (statusId === p.status_id) return;
    try {
      await trocarStatus.mutateAsync({ id: p.id, status_id: statusId });
      toast.success(`Status: ${mapaOpcoes.get(statusId)?.nome ?? 'atualizado'}.`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao trocar o status.');
    }
  };

  const handleExcluir = async () => {
    if (!excluindo) return;
    try {
      await excluir.mutateAsync(excluindo.id);
      toast.success('Processo excluído.');
      setExcluindo(null);
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao excluir.');
    }
  };

  const cards: { key: string; label: string; value: number; hint: string; ativo: boolean; onClick: () => void; warm?: boolean }[] = [
    { key: 'abertos', label: 'Em aberto', value: stats.abertos, hint: 'não concluídos', ativo: aba === 'abertos' && !recorte, onClick: () => clicarCard(null, 'abertos') },
    { key: 'atrasados', label: 'Atrasados', value: stats.atrasados, hint: `mais de ${DIAS_ATRASO} dias`, ativo: recorte === 'atrasados', onClick: () => clicarCard('atrasados', 'abertos'), warm: stats.atrasados > 0 },
    { key: 'aguardando', label: 'Aguardando cliente', value: stats.aguardando, hint: 'cobrar o cliente', ativo: recorte === 'aguardando', onClick: () => clicarCard('aguardando', 'abertos') },
    { key: 'concluidos', label: 'Concluídos no mês', value: stats.concluidosMes, hint: format(new Date(), 'MM/yyyy'), ativo: recorte === 'concluidos_mes', onClick: () => clicarCard('concluidos_mes', 'finalizados') },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="~/legalização · processos"
        title="Processos."
        subtitle="Abertura, alteração, baixa e outros pedidos do cliente, do início ao protocolo."
        actions={(
          <Button onClick={() => { setEditando(null); setFormAberto(true); }}>
            <Plus className="mr-1.5 h-4 w-4" /> Novo processo
          </Button>
        )}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c, i) => (
          <StatCard
            key={c.key}
            index={String(i + 1).padStart(2, '0')}
            label={c.label}
            value={c.value}
            hint={c.hint}
            emphasis={c.warm ? 'warm' : 'none'}
            role="button"
            tabIndex={0}
            aria-pressed={c.ativo}
            onClick={c.onClick}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.onClick(); } }}
            className={cn('cursor-pointer transition-shadow hover:shadow-sc-sm', c.ativo && 'ring-2 ring-action')}
          />
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchField
            placeholder="Buscar cliente, CNPJ, protocolo ou observação..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            wrapperClassName="max-w-[429px] flex-1"
          />
          <Tabs value={aba} onValueChange={(v) => { if (v) { setAba(v as Aba); setRecorte(null); } }}>
            <TabsList className={segmentedListClass}>
              <TabsTrigger value="abertos" className={segmentedTriggerClass}>Abertos</TabsTrigger>
              <TabsTrigger value="finalizados" className={segmentedTriggerClass}>Finalizados</TabsTrigger>
              <TabsTrigger value="todos" className={segmentedTriggerClass}>Todos</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchableSelect value={filtroServico} onChange={setFiltroServico} options={opcoesFiltro('servico')} placeholder="Serviço" allLabel="Todos os serviços" icon={Wrench} width="w-[190px]" />
          <SearchableSelect value={filtroOrgao} onChange={setFiltroOrgao} options={opcoesFiltro('orgao')} placeholder="Órgão" allLabel="Todos os órgãos" icon={Landmark} width="w-[170px]" />
          <SearchableSelect value={filtroStatus} onChange={setFiltroStatus} options={opcoesFiltro('status')} placeholder="Status" allLabel="Todos os status" icon={ListChecks} width="w-[180px]" />
          <SearchableSelect value={filtroResp} onChange={setFiltroResp} options={equipe.map((p) => ({ value: p.id, label: p.full_name }))} placeholder="Responsável" allLabel="Toda a equipe" icon={User} width="w-[180px]" />
          <Select value={periodo} onValueChange={(v) => { if (v) setPeriodo(v as Periodo); }}>
            <SelectTrigger className="w-[190px]">
              <CalendarRange className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-ink" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Qualquer data</SelectItem>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="personalizado">Escolher período</SelectItem>
            </SelectContent>
          </Select>
          {periodo === 'personalizado' && (
            <div className="flex items-center gap-2">
              <DateField value={de} onChange={setDe} placeholder="de" className="w-[150px]" max={ate || undefined} />
              <span className="text-meta text-muted-ink">até</span>
              <DateField value={ate} onChange={setAte} placeholder="até" className="w-[150px]" min={de || undefined} />
            </div>
          )}
          {temFiltro && (
            <Button variant="ghost" size="sm" onClick={limparFiltros}>
              <X className="mr-1.5 h-3.5 w-3.5" /> Limpar filtros
            </Button>
          )}
        </div>
        {recorte && (
          <p className="text-meta text-muted-ink">
            Mostrando: <span className="text-ink">{RECORTE_LABEL[recorte]}</span> ·{' '}
            <button type="button" className="text-action hover:underline" onClick={() => setRecorte(null)}>ver todos</button>
          </p>
        )}
      </div>

      <div className={TABELA_ROLAVEL}>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : filtrados.length === 0 ? (
          <div className="p-10 text-center text-ui text-muted-ink">
            {processos.length === 0 ? 'Nenhum processo cadastrado ainda. Use "Novo processo".' : 'Nenhum processo com esses filtros.'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Data da solicitação</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead>Órgão</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Protocolo</TableHead>
                <TableHead>Observação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map(({ p, s }) => {
                const status = mapaOpcoes.get(p.status_id);
                const responsavel = p.responsavel_id ? nomesEquipe.get(p.responsavel_id) : null;
                return (
                  <TableRow
                    key={p.id}
                    // warn-soft e danger-soft quase não se distinguem: o laranja usa o próprio --warn mais forte, e cada cor ganha a faixa à esquerda.
                    className={cn(
                      s.cor === 'vermelho' && 'bg-danger-soft shadow-[inset_3px_0_0_var(--danger)] hover:bg-danger-soft',
                      s.cor === 'laranja' && 'bg-[color-mix(in_srgb,var(--warn)_18%,transparent)] shadow-[inset_3px_0_0_var(--warn)] hover:bg-[color-mix(in_srgb,var(--warn)_18%,transparent)]',
                    )}
                  >
                    <TableCell className="max-w-[260px]">
                      <p className="truncate text-ui text-ink" title={nomeCliente(p)}>{nomeCliente(p)}</p>
                      <p className="truncate text-meta text-muted-ink-2">
                        {p.contact_id ? (p.contacts?.document ?? '—') : 'sem cadastro'}
                        {responsavel ? ` · ${responsavel}` : ''}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <p className="font-mono text-ui">{format(new Date(`${p.data_solicitacao}T00:00:00`), 'dd/MM/yyyy')}</p>
                      <p className={cn('text-meta', s.cor === 'vermelho' ? 'text-danger' : 'text-muted-ink-2')}>
                        {s.finalizado && p.concluido_em
                          ? `encerrado em ${format(new Date(p.concluido_em), 'dd/MM')}`
                          : s.dias <= 0 ? 'hoje' : `há ${s.dias} ${s.dias === 1 ? 'dia' : 'dias'}`}
                      </p>
                    </TableCell>
                    <TableCell className="text-ui">{mapaOpcoes.get(p.servico_id)?.nome ?? '—'}</TableCell>
                    <TableCell className="text-ui">{p.orgao_id ? mapaOpcoes.get(p.orgao_id)?.nome ?? '—' : <span className="text-muted-ink-2">—</span>}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <DsBadge tone={status?.papel ? TOM_STATUS[status.papel] : 'info'}>{status?.nome ?? '—'}</DsBadge>
                      <p className="mt-0.5 text-meta text-muted-ink-2">desde {format(new Date(p.status_desde), 'dd/MM')}</p>
                    </TableCell>
                    <TableCell className="max-w-[180px]">
                      <p className="truncate font-mono text-meta text-ink" title={p.protocolo ?? ''}>{p.protocolo || <span className="text-muted-ink-2">—</span>}</p>
                    </TableCell>
                    <TableCell className="max-w-[240px]">
                      <p className="line-clamp-2 text-meta text-muted-ink" title={p.observacao ?? ''}>{p.observacao || '—'}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="Mensagem ao cliente" onClick={() => setNotificando(p)}>
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Mais ações">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <RefreshCw className="mr-2 h-4 w-4" /> Mudar status
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                {listaStatus.map((o) => (
                                  <DropdownMenuItem key={o.id} disabled={o.id === p.status_id} onClick={() => handleTrocarStatus(p, o.id)}>
                                    {o.nome}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuItem onClick={() => { setEditando(p); setFormAberto(true); }}>
                              <Pencil className="mr-2 h-4 w-4" /> Editar
                            </DropdownMenuItem>
                            {(isAdmin || isSuperAdmin) && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-danger focus:text-danger" onClick={() => setExcluindo(p)}>
                                  <Trash2 className="mr-2 h-4 w-4" /> Excluir
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <p className="text-meta text-muted-ink-2">
        <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-danger align-middle" /> não concluído há mais de {DIAS_ATRASO} dias
        <span className="ml-4 mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-warn align-middle" /> aguardando cliente
      </p>

      <ProcessoFormDialog open={formAberto} onOpenChange={setFormAberto} processo={editando} opcoes={opcoes} />
      <NotificarProcessoDialog open={!!notificando} onOpenChange={(o) => !o && setNotificando(null)} processo={notificando} opcoes={mapaOpcoes} />

      <AlertDialog open={!!excluindo} onOpenChange={(o) => { if (!o) setExcluindo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir processo?</AlertDialogTitle>
            <AlertDialogDescription>
              {excluindo && <><strong>{nomeCliente(excluindo)}</strong> · {mapaOpcoes.get(excluindo.servico_id)?.nome}. </>}
              O histórico também é apagado. Se o cliente desistiu, prefira o status "Cancelado".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluir} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
