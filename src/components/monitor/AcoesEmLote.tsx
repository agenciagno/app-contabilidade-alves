import { useEffect, useMemo, useState } from 'react';
import { ListChecks } from 'lucide-react';

import { SearchField } from '@/components/ds';
import { SeloMini } from '@/components/monitor/MonitorUi';
import { DICA_RODAPE, DicaBotao } from '@/components/serpro/DicaBotao';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { DICA_ESTADO, ROTULO_ESTADO, type EstadoMonitor, type Selo } from '@/lib/monitorEstados';
import { cn } from '@/lib/utils';

const digitos = (v: string) => v.replace(/\D/g, '');
const formatarCnpj = (d: string) => {
  const n = digitos(d);
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};

/** Grupos por situação, na ordem em que aparecem (processando fica de fora: a Receita ainda está respondendo). */
const GRUPOS_ESTADO: EstadoMonitor[] = ['pendencia', 'atencao', 'nao_verificado', 'em_dia'];
const ORDEM_LISTA: Record<EstadoMonitor, number> = { pendencia: 0, atencao: 1, nao_verificado: 2, processando: 3, em_dia: 4 };

export interface ClienteDoLote { id: string; nome: string; documento: string; selo: Selo | null }

export interface AcaoDoLote {
  chave: string;
  rotulo: string;
  dica: string;
  custo?: 'Consultar' | 'Emitir';
  vezes?: number;
  /** Grupos que já vêm ligados ao escolher a ação: situações (`pendencia`, `atencao`...) ou chaves de `extras`. Padrão: Pendência e Atenção. */
  padrao?: string[];
  /** Situação usada pelos grupos desta ação, quando a tela tem mais de uma (ex.: PGDAS-D × DAS). Padrão: o selo do cliente. */
  seloDe?: (id: string) => Selo | null;
  /** Motivo para o cliente não entrar nesta ação (fica cinza na lista e fora dos grupos). */
  fora?: (id: string) => string | null;
}

/** Grupo além das situações (ex.: "Recebe a guia pela CA", "Movimento novo"). */
export interface GrupoExtra { chave: string; rotulo: string; dica: string; ids: string[] }

/** Botão fixo do topo das telas do Monitoramento (10/10/2026): as ações em lote ficam à vista mesmo sem ninguém marcado na tabela. */
export function BotaoAcoesEmLote({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <DicaBotao texto="Escolha a ação e os clientes de uma vez: por situação, por grupo ou marcando à mão. Você confere a lista e o custo antes de começar.">
      <Button size="sm" className="h-10" disabled={disabled} onClick={onClick}><ListChecks className="mr-1.5 h-4 w-4" />Ações em lote</Button>
    </DicaBotao>
  );
}

/**
 * Ações em lote (10/10/2026, molde da Consulta em Lote da Caixa Postal): 1) escolher a ação; 2) escolher os clientes por grupo
 * (interruptor) ou à mão. "Continuar" devolve a ação e os clientes para a tela, que marca esses clientes na tabela e abre a janela
 * de sempre daquela ação (com conferência, custo e um de cada vez). Este passo não chama a Receita.
 */
export function AcoesEmLoteDialog({ aberto, onClose, acoes, clientes, extras = [], onContinuar }: {
  aberto: boolean;
  onClose: () => void;
  acoes: AcaoDoLote[];
  clientes: ClienteDoLote[];
  extras?: GrupoExtra[];
  onContinuar: (acao: string, ids: string[]) => void;
}) {
  const [acaoChave, setAcaoChave] = useState(acoes[0]?.chave ?? '');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');
  const acao = acoes.find((a) => a.chave === acaoChave) ?? acoes[0];

  const seloDe = (c: ClienteDoLote) => (acao?.seloDe ? acao.seloDe(c.id) : c.selo);
  const foraDe = (id: string) => acao?.fora?.(id) ?? null;

  const grupos = useMemo(() => {
    if (!acao) return [];
    const porEstado = GRUPOS_ESTADO.map((e) => ({
      chave: e as string, rotulo: ROTULO_ESTADO[e], dica: DICA_ESTADO[e],
      ids: clientes.filter((c) => seloDe(c)?.estado === e && !foraDe(c.id)).map((c) => c.id),
    })).filter((g) => g.ids.length > 0);
    const extrasValidos = extras.map((g) => ({ ...g, ids: g.ids.filter((id) => !foraDe(id)) }));
    return [...extrasValidos, ...porEstado];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acao, clientes, extras]);

  const preencher = (a: AcaoDoLote | undefined) => {
    const padrao = new Set(a?.padrao ?? ['pendencia', 'atencao']);
    const ids = new Set<string>();
    for (const c of clientes) {
      if (a?.fora?.(c.id)) continue;
      const estado = (a?.seloDe ? a.seloDe(c.id) : c.selo)?.estado;
      if (estado && padrao.has(estado)) ids.add(c.id);
    }
    for (const g of extras) if (padrao.has(g.chave)) for (const id of g.ids) if (!a?.fora?.(id)) ids.add(id);
    setMarcados(ids);
  };

  useEffect(() => {
    if (!aberto) return;
    const primeira = acoes[0];
    setAcaoChave(primeira?.chave ?? '');
    setBusca('');
    preencher(primeira);
    // só ao abrir: mudanças na lista com a janela aberta não podem desmarcar o que a pessoa escolheu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const escolherAcao = (a: AcaoDoLote) => { setAcaoChave(a.chave); preencher(a); };
  const ligado = (ids: string[]) => ids.length > 0 && ids.every((id) => marcados.has(id));
  const alternarGrupo = (ids: string[], on: boolean) => setMarcados((s) => {
    const n = new Set(s);
    for (const id of ids) { if (on) n.add(id); else n.delete(id); }
    return n;
  });
  const alternar = (id: string) => setMarcados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qd = digitos(q);
    const ordem = (c: ClienteDoLote) => { const e = seloDe(c)?.estado; return e ? ORDEM_LISTA[e] : 5; };
    return clientes
      .filter((c) => !q || c.nome.toLowerCase().includes(q) || (!!qd && digitos(c.documento).includes(qd)))
      .sort((a, b) => ordem(a) - ordem(b) || a.nome.localeCompare(b.nome, 'pt-BR'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes, busca, acao]);

  const escolhidos = clientes.filter((c) => marcados.has(c.id) && !foraDe(c.id)).map((c) => c.id);

  if (!acao) return null;

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-[680px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ações em lote</DialogTitle>
          <DialogDescription>
            Escolha o que fazer e para quem. No passo seguinte você confere a lista e o custo antes de começar; nada é feito nesta janela.
          </DialogDescription>
        </DialogHeader>

        {acoes.length > 1 && (
          <div className="space-y-1.5">
            <p className="text-ui-strong text-ink">1. O que fazer</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {acoes.map((a) => (
                <button key={a.chave} type="button" onClick={() => escolherAcao(a)} aria-pressed={a.chave === acao.chave}
                  className={cn('rounded-md border px-3 py-2 text-left transition-colors',
                    a.chave === acao.chave ? 'border-ink bg-bg-2' : 'border-line hover:border-ink/40')}>
                  <span className="block text-ui-strong text-ink">{a.rotulo}</span>
                  <span className="block text-meta leading-snug text-muted-ink-2">{a.dica}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-ui-strong text-ink">{acoes.length > 1 ? '2. Para quem' : `${acao.rotulo}: para quem`}</p>
          {grupos.length > 0 ? (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {grupos.map((g) => (
                <label key={g.chave} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-ui-strong text-ink">{g.rotulo} <span className="font-normal text-muted-ink">({g.ids.length})</span></span>
                    <span className="block text-meta leading-snug text-muted-ink-2">{g.dica}</span>
                  </span>
                  <Switch checked={ligado(g.ids)} onCheckedChange={(v) => alternarGrupo(g.ids, v)} aria-label={`Incluir ${g.rotulo.toLowerCase()}`} />
                </label>
              ))}
            </div>
          ) : (
            <p className="text-meta text-muted-ink-2">Nenhum grupo para esta ação. Marque os clientes à mão.</p>
          )}
        </div>

        <div className="space-y-2">
          <SearchField placeholder="Buscar cliente para marcar à mão..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          <div className="max-h-[30vh] space-y-0.5 overflow-y-auto rounded-md border border-line p-1.5">
            {lista.length === 0 ? (
              <p className="p-4 text-center text-ui text-muted-ink">Nenhum cliente encontrado.</p>
            ) : lista.map((c) => {
              const motivo = foraDe(c.id);
              return (
                <label key={c.id} className={cn('flex items-center gap-3 rounded-sm px-2 py-1.5', motivo ? 'opacity-60' : 'cursor-pointer hover:bg-bg-2')}>
                  <Checkbox checked={!motivo && marcados.has(c.id)} disabled={!!motivo} onCheckedChange={() => alternar(c.id)} aria-label={`Marcar ${c.nome}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui text-ink">{c.nome}</span>
                    <span className="block font-mono text-meta text-muted-ink-2">{formatarCnpj(c.documento)}{motivo ? ` · ${motivo}` : ''}</span>
                  </span>
                  <SeloMini selo={seloDe(c)} />
                </label>
              );
            })}
          </div>
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-ui text-ink">
            {escolhidos.length} {escolhidos.length === 1 ? 'cliente escolhido' : 'clientes escolhidos'}
            {escolhidos.length > 0 && (
              <Button variant="link" size="sm" className="ml-1 h-auto p-0 text-meta" onClick={() => setMarcados(new Set())}>limpar</Button>
            )}
          </span>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <DicaBotao className={DICA_RODAPE} texto="Fecha sem fazer nada.">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
            </DicaBotao>
            <DicaBotao className={DICA_RODAPE} custo={acao.custo} vezes={acao.vezes} texto={`${acao.dica} Marca os clientes escolhidos na tabela e abre a conferência; nada é feito sem você confirmar.`}>
              <Button disabled={escolhidos.length === 0} onClick={() => { onContinuar(acao.chave, escolhidos); onClose(); }}>
                Continuar ({escolhidos.length})
              </Button>
            </DicaBotao>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
