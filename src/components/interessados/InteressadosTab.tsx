import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { DndContext, DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { CalendarClock, MessageCircle, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DsBadge } from '@/components/ds';
import { cn } from '@/lib/utils';
import { useTeamProfiles } from '@/hooks/useTeamProfiles';
import {
  ETAPAS_FUNIL, EtapaInteressado, INTERESSE_ROTULO, Interessado, InteressadoForm, MOTIVO_PERDA_ROTULO, MotivoPerda,
  hojeBR, linkWhatsapp, mensagemFollowup, useInteressados,
} from '@/hooks/useInteressados';
import { InteressadoDialog } from './InteressadoDialog';
import { NovoClienteDialog, PrefillCliente } from '@/components/contacts/NovoClienteDialog';

const moeda = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const TODOS = '_todos';

function Indicador({ rotulo, valor, detalhe, alerta }: { rotulo: string; valor: string; detalhe?: string; alerta?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-paper p-3">
      <p className="text-meta text-muted-ink">{rotulo}</p>
      <p className={cn('text-[22px] font-bold tabular-nums text-ink', alerta && 'text-danger')}>{valor}</p>
      {detalhe && <p className="truncate text-meta text-muted-ink" title={detalhe}>{detalhe}</p>}
    </div>
  );
}

function Cartao({ i, responsavel, onAbrir }: { i: Interessado; responsavel?: string; onAbrir: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: i.id, disabled: i.etapa === 'fechou' });
  const hoje = hojeBR();
  const atrasado = i.etapa !== 'fechou' && !!i.proximo_contato && i.proximo_contato < hoje;
  const ehHoje = i.etapa !== 'fechou' && i.proximo_contato === hoje;
  const whats = linkWhatsapp(i.whatsapp, mensagemFollowup(i));
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onAbrir}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        'cursor-pointer space-y-1.5 rounded-md border bg-paper p-2.5 text-[13px] shadow-sm transition-colors hover:border-action',
        atrasado ? 'border-danger bg-danger-soft' : 'border-line',
        isDragging && 'z-10 opacity-80 shadow-lg',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold leading-snug text-ink">{i.nome}</p>
        {whats && (
          <a
            href={whats} target="_blank" rel="noopener noreferrer" title="WhatsApp com texto pronto"
            onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}
            className="shrink-0 text-ok hover:opacity-80"
          >
            <MessageCircle className="h-4 w-4" />
          </a>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        <DsBadge tone="neutral" dot={false}>{INTERESSE_ROTULO[i.interesse]}</DsBadge>
        {i.honorario_proposto != null && <DsBadge tone="info" dot={false}>{moeda(Number(i.honorario_proposto))}</DsBadge>}
      </div>
      {i.indicado_por && <p className="text-meta text-muted-ink">Indicado por {i.indicado_por}</p>}
      <div className="flex items-center justify-between gap-2 text-meta">
        {i.proximo_contato && i.etapa !== 'fechou' ? (
          <span className={cn('flex items-center gap-1', atrasado ? 'font-semibold text-danger' : ehHoje ? 'font-semibold text-warn' : 'text-muted-ink')}>
            <CalendarClock className="h-3.5 w-3.5" />
            {ehHoje ? 'Hoje' : format(parseISO(i.proximo_contato), 'dd/MM')}
          </span>
        ) : <span />}
        {responsavel && <span className="truncate text-muted-ink">{responsavel}</span>}
      </div>
    </div>
  );
}

function Coluna({ etapa, rotulo, itens, children }: { etapa: EtapaInteressado; rotulo: string; itens: Interessado[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa });
  const soma = itens.reduce((t, i) => t + (Number(i.honorario_proposto) || 0), 0);
  return (
    <section ref={setNodeRef} className={cn('flex min-h-[220px] flex-col gap-2 rounded-lg border border-line bg-bg p-2', isOver && 'border-action bg-action-tint')}>
      <header className="flex items-center justify-between px-1">
        <h3 className="text-[13px] font-semibold text-ink">{rotulo} <span className="font-normal text-muted-ink">({itens.length})</span></h3>
        {soma > 0 && <span className="text-meta text-muted-ink">{moeda(soma)}/mês</span>}
      </header>
      {children}
    </section>
  );
}

/**
 * Aba Interessados (17/10/2026): funil de quem procurou a CA. Quadro de arrastar (Novo → Atendido → Proposta → Fechou), próximo
 * contato com aviso no sino e cartão vermelho quando atrasado, motivo de perda e indicadores. Fechou abre o assistente de cadastro
 * já preenchido; o interessado guarda o vínculo com o cliente criado.
 */
export function InteressadosTab() {
  const navigate = useNavigate();
  const { interessados, criar, atualizar, apagar } = useInteressados();
  const { data: equipe = [] } = useTeamProfiles();
  const [busca, setBusca] = useState('');
  const [filtroResp, setFiltroResp] = useState(TODOS);
  const [verPerdidos, setVerPerdidos] = useState(false);
  const [aberto, setAberto] = useState<Interessado | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [fechando, setFechando] = useState<Interessado | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const nomeResp = useMemo(() => new Map(equipe.map(p => [p.id, (p.full_name || '').split(' ')[0]])), [equipe]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return interessados.filter(i =>
      (!q || i.nome.toLowerCase().includes(q) || (i.indicado_por || '').toLowerCase().includes(q) || (i.whatsapp || '').includes(q.replace(/\D/g, '') || '§'))
      && (filtroResp === TODOS || i.responsavel_id === filtroResp));
  }, [interessados, busca, filtroResp]);

  // Fechados aparecem por 30 dias no quadro; depois saem (continuam nos indicadores e no cliente).
  const hoje = hojeBR();
  const porEtapa = (etapa: EtapaInteressado) => filtrados
    .filter(i => i.etapa === etapa && (etapa !== 'fechou' || differenceInCalendarDays(new Date(), parseISO(i.fechado_em || i.etapa_desde)) <= 30))
    .sort((a, b) => (a.proximo_contato || '9999').localeCompare(b.proximo_contato || '9999'));
  const perdidos = filtrados.filter(i => i.etapa === 'perdido');

  const indicadores = useMemo(() => {
    const mesAtual = hoje.slice(0, 7);
    const novosMes = interessados.filter(i => i.created_at.slice(0, 7) === mesAtual).length;
    const limite = new Date(Date.now() - 90 * 864e5);
    const decididos = interessados.filter(i => (i.etapa === 'fechou' || i.etapa === 'perdido') && parseISO(i.etapa_desde) >= limite);
    const fechados = decididos.filter(i => i.etapa === 'fechou');
    const taxa = decididos.length ? Math.round((fechados.length / decididos.length) * 100) : null;
    const dias = fechados.map(i => differenceInCalendarDays(parseISO(i.fechado_em || i.etapa_desde), parseISO(i.created_at)));
    const tempo = dias.length ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length) : null;
    const atrasados = interessados.filter(i => ['novo', 'atendido', 'proposta'].includes(i.etapa) && i.proximo_contato && i.proximo_contato < hoje).length;
    const contar = (xs: (string | null)[]) => {
      const m = new Map<string, number>();
      xs.forEach(x => { if (x) m.set(x, (m.get(x) || 0) + 1); });
      return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    };
    const indicam = contar(interessados.map(i => i.indicado_por?.trim() || null));
    const motivos = contar(interessados.filter(i => i.etapa === 'perdido').map(i => i.motivo_perda));
    return { novosMes, taxa, tempo, atrasados, indicam, motivos, decididos: decididos.length };
  }, [interessados, hoje]);

  const mover = (i: Interessado, etapa: EtapaInteressado) => {
    if (etapa === i.etapa) return;
    if (etapa === 'fechou') { setFechando(i); return; }
    atualizar.mutate({ id: i.id, etapa });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const i = interessados.find(x => x.id === e.active.id);
    if (i && e.over) mover(i, e.over.id as EtapaInteressado);
  };

  const salvar = async (form: InteressadoForm) => {
    if (aberto) {
      await atualizar.mutateAsync({ id: aberto.id, ...form });
      toast.success('Salvo');
      setAberto(null);
    } else {
      await criar.mutateAsync(form);
      setNovoAberto(false);
    }
  };

  // Memorizado: o modal reinicia os campos quando o prefill muda, então não pode ser um objeto novo a cada render.
  const prefill = useMemo<PrefillCliente | undefined>(() => (fechando ? {
    nome: fechando.nome, whatsapp: fechando.whatsapp, documento: fechando.documento, regime: fechando.regime_pretendido,
    honorario: fechando.honorario_proposto, responsavelId: fechando.responsavel_id, indicadoPor: fechando.indicado_por,
  } : undefined), [fechando]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Novos no mês" valor={String(indicadores.novosMes)} />
        <Indicador
          rotulo="Taxa de fechamento (90 dias)"
          valor={indicadores.taxa == null ? '—' : `${indicadores.taxa}%`}
          detalhe={indicadores.decididos ? `${indicadores.decididos} decididos` : 'Sem decisões ainda'}
        />
        <Indicador rotulo="Tempo médio até fechar" valor={indicadores.tempo == null ? '—' : `${indicadores.tempo} dias`} />
        <Indicador rotulo="Retornos atrasados" valor={String(indicadores.atrasados)} alerta={indicadores.atrasados > 0} />
      </div>
      {(indicadores.indicam.length > 0 || indicadores.motivos.length > 0) && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted-ink">
          {indicadores.indicam.length > 0 && (
            <p><span className="font-semibold text-ink">Quem mais indica:</span> {indicadores.indicam.map(([n, q]) => `${n} (${q})`).join(' · ')}</p>
          )}
          {indicadores.motivos.length > 0 && (
            <p><span className="font-semibold text-ink">Motivos de perda:</span> {indicadores.motivos.map(([m, q]) => `${MOTIVO_PERDA_ROTULO[m as MotivoPerda] ?? m} (${q})`).join(' · ')}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-ink" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome, WhatsApp ou quem indicou..." className="h-9 pl-9" />
        </div>
        <Select value={filtroResp} onValueChange={v => v && setFiltroResp(v)}>
          <SelectTrigger className="h-9 w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os responsáveis</SelectItem>
            {equipe.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name || 'Sem nome'}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 px-1">
          <Switch id="ver-perdidos" checked={verPerdidos} onCheckedChange={setVerPerdidos} />
          <Label htmlFor="ver-perdidos" className="text-[13px]">Perdidos ({perdidos.length})</Label>
        </div>
        <Button className="gap-2" onClick={() => setNovoAberto(true)}>
          <Plus className="h-4 w-4" /> Novo interessado
        </Button>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {ETAPAS_FUNIL.map(({ valor, rotulo }) => {
            const itens = porEtapa(valor);
            return (
              <Coluna key={valor} etapa={valor} rotulo={rotulo} itens={itens}>
                {itens.map(i => (
                  <Cartao key={i.id} i={i} responsavel={i.responsavel_id ? nomeResp.get(i.responsavel_id) : undefined} onAbrir={() => setAberto(i)} />
                ))}
                {itens.length === 0 && (
                  <p className="px-1 py-6 text-center text-meta text-muted-ink">
                    {valor === 'fechou' ? 'Arraste para cá quando fechar.' : 'Ninguém aqui.'}
                  </p>
                )}
              </Coluna>
            );
          })}
        </div>
      </DndContext>

      {verPerdidos && (
        <section className="space-y-2 rounded-lg border border-line bg-paper p-3">
          <h3 className="text-[13px] font-semibold text-ink">Perdidos</h3>
          {perdidos.length === 0 && <p className="text-meta text-muted-ink">Nenhum.</p>}
          <ul className="divide-y divide-line">
            {perdidos.map(i => (
              <li key={i.id}>
                <button type="button" onClick={() => setAberto(i)} className="flex w-full items-center justify-between gap-3 py-2 text-left text-[13px] hover:text-action">
                  <span className="font-medium text-ink">{i.nome}</span>
                  <span className="text-muted-ink">
                    {i.motivo_perda ? MOTIVO_PERDA_ROTULO[i.motivo_perda] : 'Sem motivo'} · {format(parseISO(i.etapa_desde), 'dd/MM/yyyy')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <InteressadoDialog
        open={novoAberto || !!aberto}
        onOpenChange={o => { if (!o) { setNovoAberto(false); setAberto(null); } }}
        interessado={aberto ?? undefined}
        salvando={criar.isPending || atualizar.isPending}
        onSalvar={salvar}
        onPerdido={async motivo => {
          if (!aberto) return;
          await atualizar.mutateAsync({ id: aberto.id, etapa: 'perdido', motivo_perda: motivo, proximo_contato: null });
          toast.success('Marcado como perdido');
          setAberto(null);
        }}
        onFechar={() => { if (aberto) { setFechando(aberto); setAberto(null); } }}
        onApagar={async () => { if (aberto) { await apagar.mutateAsync(aberto.id); setAberto(null); } }}
        onAbrirCliente={id => navigate(`/crm/cliente/${id}`)}
      />

      <NovoClienteDialog
        open={!!fechando}
        onOpenChange={o => { if (!o) setFechando(null); }}
        prefill={prefill}
        onCriado={async contactId => {
          if (!fechando) return;
          await atualizar.mutateAsync({ id: fechando.id, etapa: 'fechou', contact_id: contactId, proximo_contato: null });
        }}
      />
    </div>
  );
}
