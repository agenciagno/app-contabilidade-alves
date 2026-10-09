import { useEffect, useMemo, useState } from 'react';

import { SearchField } from '@/components/ds';
import { AcaoLoteDialog } from '@/components/monitor/GuiasLote';
import { SeloMini } from '@/components/monitor/MonitorUi';
import { DICA_RODAPE, DicaBotao } from '@/components/serpro/DicaBotao';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { seloCaixa, useConsultarCaixa, type ClienteCaixa } from '@/hooks/useSerproCaixaPostal';
import { hojeBR } from '@/lib/prazosFederais';
import { seloCaixaPostal } from '@/lib/monitorEstados';
import { cn } from '@/lib/utils';

const digitos = (v: string) => v.replace(/\D/g, '');
const formatarCnpj = (d: string) => {
  const n = digitos(d);
  return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d;
};

const ORDEM = { nao_lida: 0, nova: 1 } as const;
const ordemDe = (c: ClienteCaixa) => ORDEM[seloCaixa(c).estado as keyof typeof ORDEM] ?? 2;

/**
 * Consulta em Lote da Caixa Postal: escolher quem consultar e depois rodar um cliente por vez.
 * Dois grupos têm interruptor (mensagem não lida e mensagem nova); qualquer outro cliente pode ser marcado à mão.
 * `inicial`: quem já vem marcado (null = os dois grupos). A consulta baixa só a lista de mensagens e não registra ciência.
 */
export function ConsultaLoteCaixaDialog({ aberto, onClose, clientes, inicial }: {
  aberto: boolean;
  onClose: () => void;
  /** Clientes monitorados (só a matriz). */
  clientes: ClienteCaixa[];
  inicial: string[] | null;
}) {
  const consultarCaixa = useConsultarCaixa();
  const [etapa, setEtapa] = useState<'escolher' | 'executar'>('escolher');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');
  const hoje = hojeBR();

  const elegiveis = useMemo(() => clientes.filter((c) => c.procuracao !== 'ausente'), [clientes]);
  const naoLidas = useMemo(() => elegiveis.filter((c) => seloCaixa(c).estado === 'nao_lida'), [elegiveis]);
  const novas = useMemo(() => elegiveis.filter((c) => seloCaixa(c).estado === 'nova'), [elegiveis]);

  useEffect(() => {
    if (!aberto) return;
    setEtapa('escolher');
    setBusca('');
    setMarcados(new Set(inicial ?? [...naoLidas, ...novas].map((c) => c.contact_id)));
    // só ao abrir: mudanças na lista com a janela aberta não podem desmarcar o que a pessoa escolheu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const ligado = (g: ClienteCaixa[]) => g.length > 0 && g.every((c) => marcados.has(c.contact_id));
  const alternarGrupo = (g: ClienteCaixa[], on: boolean) => setMarcados((s) => {
    const n = new Set(s);
    for (const c of g) { if (on) n.add(c.contact_id); else n.delete(c.contact_id); }
    return n;
  });
  const alternar = (id: string) => setMarcados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qd = digitos(q);
    return [...clientes]
      .filter((c) => !q || c.nome.toLowerCase().includes(q) || (!!qd && digitos(c.documento).includes(qd)))
      .sort((a, b) => ordemDe(a) - ordemDe(b) || a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [clientes, busca]);

  const escolhidos = useMemo(() => elegiveis.filter((c) => marcados.has(c.contact_id)), [elegiveis, marcados]);

  const grupo = (rotulo: string, dica: string, g: ClienteCaixa[]) => (
    <label className="flex items-center justify-between gap-3 rounded-md border border-line px-4 py-3">
      <span className="min-w-0">
        <span className="block text-ui-strong text-ink">{rotulo} <span className="font-normal text-muted-ink">({g.length})</span></span>
        <span className="block text-meta text-muted-ink-2">{dica}</span>
      </span>
      <Switch checked={ligado(g)} disabled={g.length === 0} onCheckedChange={(v) => alternarGrupo(g, v)} aria-label={`Consultar ${rotulo.toLowerCase()}`} />
    </label>
  );

  if (etapa === 'executar') {
    return (
      <AcaoLoteDialog
        aberto={aberto}
        onClose={onClose}
        titulo="Consulta em lote da Caixa Postal"
        descricao="Baixa da Receita a lista de mensagens de cada cliente escolhido, um de cada vez. Não abre as mensagens nem registra ciência."
        itens={escolhidos.map((c) => ({
          contactId: c.contact_id, nome: c.nome, pular: c.consultado_em?.slice(0, 10) === hoje ? 'Consultado hoje' : null,
        }))}
        tipo="Consultar"
        rotuloAcao="Consultar"
        rotuloFeito="Lista baixada"
        executar={async (item) => {
          const r = await consultarCaixa.mutateAsync({ contactId: item.contactId });
          return {
            ok: r.ok, recente: r.recente, error: r.semProcuracao ? 'Sem procuração para a Caixa Postal' : r.error,
            resumo: r.novas ? `${r.novas} ${r.novas === 1 ? 'mensagem nova' : 'mensagens novas'}` : 'Lista baixada, sem mensagem nova',
          };
        }}
      />
    );
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Consulta em Lote</DialogTitle>
          <DialogDescription>
            Escolha quem consultar agora. Ligue ou desligue cada grupo e, se quiser, marque outros clientes à mão. No passo seguinte você confere a lista antes de começar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {grupo('Mensagem não lida', 'Clientes com mensagem que ainda não foi lida na Caixa Postal.', naoLidas)}
          {grupo('Nova mensagem', 'A Receita avisou de mensagem nova desde a última consulta.', novas)}
        </div>

        <div className="space-y-2">
          <SearchField placeholder="Buscar cliente para marcar à mão..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          <div className="max-h-[32vh] space-y-0.5 overflow-y-auto rounded-md border border-line p-1.5">
            {lista.length === 0 ? (
              <p className="p-4 text-center text-ui text-muted-ink">Nenhum cliente encontrado.</p>
            ) : lista.map((c) => {
              const sem = c.procuracao === 'ausente';
              return (
                <label key={c.contact_id} className={cn('flex items-center gap-3 rounded-sm px-2 py-1.5', sem ? 'opacity-60' : 'cursor-pointer hover:bg-bg-2')}>
                  <Checkbox checked={marcados.has(c.contact_id)} disabled={sem} onCheckedChange={() => alternar(c.contact_id)} aria-label={`Marcar ${c.nome}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui text-ink">{c.nome}</span>
                    <span className="block font-mono text-meta text-muted-ink-2">{formatarCnpj(c.documento)}</span>
                  </span>
                  <SeloMini selo={seloCaixaPostal(seloCaixa(c).estado)} />
                </label>
              );
            })}
          </div>
          <p className="text-meta text-muted-ink-2">Clientes sem procuração para a Caixa Postal não podem ser consultados.</p>
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-ui text-ink">
            {escolhidos.length} {escolhidos.length === 1 ? 'cliente escolhido' : 'clientes escolhidos'}
            {escolhidos.length > 0 && (
              <Button variant="link" size="sm" className="ml-1 h-auto p-0 text-meta" onClick={() => setMarcados(new Set())}>limpar</Button>
            )}
          </span>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <DicaBotao className={DICA_RODAPE} texto="Fecha sem consultar ninguém.">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
            </DicaBotao>
            <DicaBotao className={DICA_RODAPE} texto="Mostra a lista dos clientes escolhidos com o total antes de consultar. Nada é consultado neste passo.">
              <Button disabled={escolhidos.length === 0} onClick={() => setEtapa('executar')}>Continuar ({escolhidos.length})</Button>
            </DicaBotao>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
