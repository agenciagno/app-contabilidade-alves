import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SearchField } from '@/components/ds';
import { maskCPFCNPJ } from '@/lib/utils';
import { useCandidatosLancamento, useLancarTarefasClientes } from '@/hooks/useLancarTarefas';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  month: number;
  mesLabel: string;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Lançar tarefa: escolhe um ou mais clientes e as obrigações do mês (todas marcadas), e "Lançar" cria o card de cada cliente no Kanban. */
export function LancarTarefasDialog({ open, onOpenChange, year, month, mesLabel }: Props) {
  const { data: candidatos = [], isLoading } = useCandidatosLancamento(year, month, open);
  const lancar = useLancarTarefasClientes(year, month);

  const [busca, setBusca] = useState('');
  const [clientes, setClientes] = useState<Set<string>>(new Set());
  // Guarda só as desmarcadas: assim toda obrigação nova que aparece ao escolher mais um cliente já vem marcada.
  const [desmarcadas, setDesmarcadas] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setBusca('');
      setClientes(new Set());
      setDesmarcadas(new Set());
    }
  }, [open, year, month]);

  const aLancarDe = (c: (typeof candidatos)[number]) => c.obrigacoes.filter((o) => !o.lancada && !o.sem_responsavel).length;

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const digitos = q.replace(/\D/g, '');
    const lista = q
      ? candidatos.filter((c) => c.nome.toLowerCase().includes(q) || (digitos && (c.documento ?? '').replace(/\D/g, '').includes(digitos)))
      : candidatos;
    // Quem tem tarefa a lançar vem primeiro.
    return [...lista].sort((a, b) => Number(aLancarDe(b) > 0) - Number(aLancarDe(a) > 0) || a.nome.localeCompare(b.nome));
  }, [candidatos, busca]); // eslint-disable-line react-hooks/exhaustive-deps

  const escolhidos = useMemo(() => candidatos.filter((c) => clientes.has(c.contact_id)), [candidatos, clientes]);

  // Obrigações do mês que ao menos um cliente escolhido tem no cadastro.
  const obrigacoes = useMemo(() => {
    const map = new Map<string, { id: string; nome: string; vencimento: string; clientes: number; aLancar: number }>();
    for (const c of escolhidos) {
      for (const o of c.obrigacoes) {
        const r = map.get(o.obligation_id) ?? { id: o.obligation_id, nome: o.nome, vencimento: o.vencimento, clientes: 0, aLancar: 0 };
        r.clientes += 1;
        if (!o.lancada && !o.sem_responsavel) r.aLancar += 1;
        map.set(o.obligation_id, r);
      }
    }
    return [...map.values()].sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.nome.localeCompare(b.nome));
  }, [escolhidos]);

  const resumo = useMemo(() => {
    let criar = 0, jaLancadas = 0, semResp = 0;
    const clientesComTarefa = new Set<string>();
    for (const c of escolhidos) {
      for (const o of c.obrigacoes) {
        if (desmarcadas.has(o.obligation_id)) continue;
        if (o.lancada) jaLancadas += 1;
        else if (o.sem_responsavel) semResp += 1;
        else { criar += 1; clientesComTarefa.add(c.contact_id); }
      }
    }
    return { criar, jaLancadas, semResp, clientes: clientesComTarefa.size };
  }, [escolhidos, desmarcadas]);

  const alternarCliente = (id: string, marcado: boolean) =>
    setClientes((prev) => { const n = new Set(prev); if (marcado) n.add(id); else n.delete(id); return n; });
  const alternarObrigacao = (id: string, marcada: boolean) =>
    setDesmarcadas((prev) => { const n = new Set(prev); if (marcada) n.delete(id); else n.add(id); return n; });

  const todosVisiveisMarcados = visiveis.length > 0 && visiveis.every((c) => clientes.has(c.contact_id));
  const marcarTodosVisiveis = (marcado: boolean) =>
    setClientes((prev) => { const n = new Set(prev); visiveis.forEach((c) => (marcado ? n.add(c.contact_id) : n.delete(c.contact_id))); return n; });

  const confirmar = () => {
    const obrigacoesMarcadas = obrigacoes.filter((o) => !desmarcadas.has(o.id)).map((o) => o.id);
    lancar.mutate(
      { contactIds: escolhidos.map((c) => c.contact_id), obligationIds: obrigacoesMarcadas },
      {
        onSuccess: (r) => {
          toast.success(
            r.criadas > 0
              ? `${plural(r.criadas, 'tarefa lançada', 'tarefas lançadas')} para ${plural(resumo.clientes, 'cliente', 'clientes')}.`
              : 'Nada novo para lançar: as tarefas já existiam.',
          );
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Lançar tarefa · {mesLabel}</DialogTitle>
          <DialogDescription>
            Escolha os clientes e as obrigações. O card de cada cliente é criado no Kanban de Tarefas, com as datas do calendário fiscal.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[3fr_2fr]">
          {/* Clientes */}
          <div className="flex min-h-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-[0.05em] text-muted-ink-2">Clientes</p>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-ink">
                <Checkbox checked={todosVisiveisMarcados} onCheckedChange={(v) => marcarTodosVisiveis(!!v)} aria-label="Marcar todos os clientes da lista" />
                Marcar todos da lista
              </label>
            </div>
            <SearchField placeholder="Buscar por nome ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} wrapperClassName="w-full" />
            <div className="min-h-[220px] flex-1 divide-y divide-line overflow-y-auto rounded-md border border-line">
              {isLoading ? (
                <div className="space-y-2 p-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
              ) : visiveis.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-ink">Nenhum cliente com obrigação neste mês.</p>
              ) : (
                visiveis.map((c) => {
                  const faltam = aLancarDe(c);
                  const semResp = c.obrigacoes.filter((o) => !o.lancada && o.sem_responsavel).length;
                  return (
                    <label key={c.contact_id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-bg-2">
                      <Checkbox checked={clientes.has(c.contact_id)} onCheckedChange={(v) => alternarCliente(c.contact_id, !!v)} aria-label={`Selecionar ${c.nome}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{c.nome}</p>
                        <p className="text-meta text-muted-ink">
                          {c.documento ? maskCPFCNPJ(c.documento) : 'Sem CNPJ'}
                          {semResp > 0 && <span className="text-warn"> · {plural(semResp, 'obrigação sem responsável', 'obrigações sem responsável')}</span>}
                        </p>
                      </div>
                      {faltam > 0
                        ? <Badge className="shrink-0 border-warn/30 bg-warn/15 text-warn">{faltam} a lançar</Badge>
                        : <span className="shrink-0 text-meta text-muted-ink">em dia</span>}
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Obrigações */}
          <div className="flex min-h-0 flex-col gap-2">
            <p className="text-[11px] uppercase tracking-[0.05em] text-muted-ink-2">Obrigações do mês</p>
            <div className="min-h-[220px] flex-1 divide-y divide-line overflow-y-auto rounded-md border border-line">
              {obrigacoes.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-ink">Escolha um ou mais clientes para ver as obrigações.</p>
              ) : (
                obrigacoes.map((o) => (
                  <label key={o.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-bg-2">
                    <Checkbox checked={!desmarcadas.has(o.id)} onCheckedChange={(v) => alternarObrigacao(o.id, !!v)} aria-label={`Lançar ${o.nome}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{o.nome}</p>
                      <p className="text-meta text-muted-ink">
                        Vence {format(parseISO(o.vencimento), 'dd/MM')}
                        {escolhidos.length > 1 && ` · ${o.clientes} de ${escolhidos.length} clientes`}
                        {o.aLancar === 0 && ' · já lançada'}
                      </p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between sm:gap-2">
          <p className="text-meta text-muted-ink">
            {escolhidos.length === 0
              ? 'Nenhum cliente escolhido.'
              : <>
                  {resumo.criar > 0
                    ? <strong className="text-ink">{plural(resumo.criar, 'tarefa será criada', 'tarefas serão criadas')}</strong>
                    : <strong className="text-ink">Nada a criar</strong>}
                  {resumo.criar > 0 && ` para ${plural(resumo.clientes, 'cliente', 'clientes')}`}
                  {resumo.jaLancadas > 0 && ` · ${plural(resumo.jaLancadas, 'já existe', 'já existem')}`}
                  {resumo.semResp > 0 && ` · ${plural(resumo.semResp, 'sem responsável (não lança)', 'sem responsável (não lançam)')}`}
                </>}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={confirmar} disabled={resumo.criar === 0 || lancar.isPending}>
              {lancar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Lançar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
