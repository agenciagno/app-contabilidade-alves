/**
 * Rodada 5 do Monitoramento (09/10/2026): gerar guias em lote pela tela e enviar com conferência.
 * Nada sai sozinho: a equipe marca os clientes, vê o custo, confirma; depois confere a lista e manda os e-mails.
 * Usado pela tela Simples Nacional (DAS) e pela tela DCTFWeb e MIT (guia da DCTFWeb).
 */
import { useEffect, useRef, useState } from 'react';
import { format, lastDayOfMonth } from 'date-fns';
import { CheckCircle2, Loader2, Mail, MinusCircle, XCircle } from 'lucide-react';

import { DateField } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Preco } from '@/components/serpro/CustoSerpro';
import { useEnviarCliente } from '@/hooks/useEnvioCliente';
import { ORIGEM_ENVIO, type ProcessoGuia } from '@/hooks/useGuiasCliente';
import { cn } from '@/lib/utils';

type Resultado = { estado: 'ok' | 'ja' | 'erro'; msg: string };
const msgErro = (e: unknown) => (e as Error)?.message || 'Falha. Tente de novo em instantes.';

function IconeResultado({ r, rodando }: { r?: Resultado; rodando: boolean }) {
  if (rodando) return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-ink" />;
  if (!r) return <span className="h-4 w-4 shrink-0" />;
  if (r.estado === 'ok') return <CheckCircle2 className="h-4 w-4 shrink-0 text-em-dia" />;
  if (r.estado === 'ja') return <MinusCircle className="h-4 w-4 shrink-0 text-muted-ink-2" />;
  return <XCircle className="h-4 w-4 shrink-0 text-danger" />;
}

// ---------------------------------------------------------------- barra de seleção
export function BarraSelecao({ quantos, onLimpar, children }: { quantos: number; onLimpar: () => void; children: React.ReactNode }) {
  if (!quantos) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-ink/20 bg-bg-2 px-4 py-2.5">
      <span className="text-ui-strong text-ink">{quantos} {quantos === 1 ? 'cliente marcado' : 'clientes marcados'}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <Button size="sm" variant="ghost" className="ml-auto" onClick={onLimpar}>Limpar seleção</Button>
    </div>
  );
}

// ---------------------------------------------------------------- gerar em lote
export interface ItemLote {
  contactId: string;
  nome: string;
  /** Já há guia guardada e válida: sem data de pagamento, abre a guardada e não emite (não cobra). */
  guardada: boolean;
  /** Algo que deve impedir a Receita de gerar (ex.: sem declaração no mês). */
  aviso?: string | null;
}

export function GerarLoteDialog({
  aberto, onClose, titulo, descricao, itens, executar,
}: {
  aberto: boolean;
  onClose: () => void;
  titulo: string;
  descricao: string;
  itens: ItemLote[];
  executar: (item: ItemLote, dataPagamento?: string) => Promise<{ ok: boolean; jaGerado?: boolean; error?: string }>;
}) {
  const [dataPagamento, setDataPagamento] = useState('');
  const [resultados, setResultados] = useState<Map<string, Resultado>>(new Map());
  const [atual, setAtual] = useState<string | null>(null);
  const [rodando, setRodando] = useState(false);
  const parar = useRef(false);

  useEffect(() => { if (aberto) { setDataPagamento(''); setResultados(new Map()); setAtual(null); setRodando(false); } }, [aberto]);

  const hoje = format(new Date(), 'yyyy-MM-dd');
  const fimDoMes = format(lastDayOfMonth(new Date()), 'yyyy-MM-dd');
  const dataValida = !dataPagamento || (dataPagamento >= hoje && dataPagamento <= fimDoMes);
  const emissoes = itens.filter((i) => !!dataPagamento || !i.guardada).length;
  const terminou = resultados.size > 0 && !rodando;
  const ok = [...resultados.values()].filter((r) => r.estado === 'ok').length;
  const ja = [...resultados.values()].filter((r) => r.estado === 'ja').length;
  const erros = [...resultados.values()].filter((r) => r.estado === 'erro').length;

  const iniciar = async () => {
    parar.current = false;
    setRodando(true);
    for (const item of itens) {
      if (parar.current) break;
      if (resultados.get(item.contactId)?.estado === 'ok') continue;
      setAtual(item.contactId);
      let r: Resultado;
      try {
        const res = await executar(item, dataPagamento || undefined);
        r = res.ok ? (res.jaGerado ? { estado: 'ja', msg: 'Já estava gerada: nada foi emitido' } : { estado: 'ok', msg: 'Gerada' }) : { estado: 'erro', msg: res.error ?? 'A Receita recusou' };
      } catch (e) {
        r = { estado: 'erro', msg: msgErro(e) };
      }
      setResultados((m) => new Map(m).set(item.contactId, r));
    }
    setAtual(null);
    setRodando(false);
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !rodando) onClose(); }}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[40vh] space-y-1 overflow-y-auto rounded-md border border-line p-2">
          {itens.map((i) => {
            const r = resultados.get(i.contactId);
            return (
              <div key={i.contactId} className="flex items-start gap-2 rounded-sm px-2 py-1.5">
                <IconeResultado r={r} rodando={atual === i.contactId} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ui text-ink">{i.nome}</p>
                  {r ? (
                    <p className={cn('text-meta', r.estado === 'erro' ? 'text-danger' : 'text-muted-ink-2')}>{r.msg}</p>
                  ) : (
                    <>
                      {i.guardada && !dataPagamento && <p className="text-meta text-muted-ink-2">Já tem guia guardada e válida: não emite de novo.</p>}
                      {i.aviso && <p className="text-meta text-warn">{i.aviso}</p>}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!terminou && (
          <div className="space-y-1.5">
            <label className="text-ui-strong text-ink">Data do pagamento (opcional)</label>
            <DateField value={dataPagamento} onChange={setDataPagamento} min={hoje} max={fimDoMes} placeholder="Em branco: guia pelo vencimento" disabled={rodando} />
            <p className={dataValida ? 'text-meta text-muted-ink-2' : 'text-meta text-danger'}>
              {dataValida
                ? 'Para quem vai pagar atrasado: a guia sai com multa e juros até essa data (dia útil do mês corrente). Com data, sempre emite uma guia nova.'
                : `Escolha um dia útil entre hoje e ${fimDoMes.split('-').reverse().join('/')}.`}
            </p>
          </div>
        )}

        {terminou && (
          <p className="text-ui text-ink">
            {ok} {ok === 1 ? 'gerada' : 'geradas'}{ja ? ` · ${ja} já existiam` : ''}{erros ? ` · ${erros} com erro` : ''}.
            {ok > 0 && ' Para mandar ao cliente, use "Conferir e enviar".'}
          </p>
        )}

        <DialogFooter>
          {rodando ? (
            <Button variant="outline" onClick={() => { parar.current = true; }}>Parar depois deste</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>{terminou ? 'Fechar' : 'Cancelar'}</Button>
              {(!terminou || erros > 0) && (
                <Button onClick={iniciar} disabled={!itens.length || !dataValida}>
                  {terminou ? 'Tentar de novo os com erro' : `Gerar ${itens.length}`}
                  {!terminou && emissoes > 0 && <Preco tipo="Emitir" vezes={emissoes} />}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- conferir e enviar
export interface ItemEnvio {
  contactId: string;
  nome: string;
  email: string | null;
  documento: { tipo: string; id: string };
  /** Ex.: "DAS 09/2026 · vence 20/10 · R$ 1.234,56". */
  rotulo: string;
  enviadoEm: string | null;
}

export function EnviarGuiasDialog({
  aberto, onClose, titulo, processo, competencia, itens, assuntoPadrao, mensagemPadrao,
}: {
  aberto: boolean;
  onClose: () => void;
  titulo: string;
  processo: ProcessoGuia;
  /** AAAA-MM */
  competencia: string;
  itens: ItemEnvio[];
  assuntoPadrao: string;
  /** Texto com {cliente} no lugar do nome. Os links das guias entram embaixo, sozinhos. */
  mensagemPadrao: string;
}) {
  const enviar = useEnviarCliente();
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [assunto, setAssunto] = useState(assuntoPadrao);
  const [mensagem, setMensagem] = useState(mensagemPadrao);
  const [resultados, setResultados] = useState<Map<string, Resultado>>(new Map());
  const [atual, setAtual] = useState<string | null>(null);
  const [rodando, setRodando] = useState(false);
  const parar = useRef(false);

  useEffect(() => {
    if (!aberto) return;
    setMarcados(new Set(itens.filter((i) => i.email && !i.enviadoEm).map((i) => i.contactId)));
    setAssunto(assuntoPadrao); setMensagem(mensagemPadrao); setResultados(new Map()); setAtual(null); setRodando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const alvo = itens.filter((i) => marcados.has(i.contactId) && i.email);
  const terminou = resultados.size > 0 && !rodando;
  const ok = [...resultados.values()].filter((r) => r.estado === 'ok').length;
  const erros = [...resultados.values()].filter((r) => r.estado === 'erro').length;
  const alternar = (id: string) => setMarcados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const iniciar = async () => {
    parar.current = false;
    setRodando(true);
    for (const item of alvo) {
      if (parar.current) break;
      if (resultados.get(item.contactId)?.estado === 'ok') continue;
      setAtual(item.contactId);
      let r: Resultado;
      try {
        await enviar.mutateAsync({
          contactId: item.contactId, canal: 'email', assunto: assunto.replace(/\{cliente\}/g, item.nome),
          mensagem: mensagem.replace(/\{cliente\}/g, item.nome), documentos: [item.documento],
          origem: ORIGEM_ENVIO[processo], referencia: { processo, competencia, id: item.documento.id },
        });
        r = { estado: 'ok', msg: `Enviado para ${item.email}` };
      } catch (e) {
        r = { estado: 'erro', msg: msgErro(e) };
      }
      setResultados((m) => new Map(m).set(item.contactId, r));
    }
    setAtual(null);
    setRodando(false);
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !rodando) onClose(); }}>
      <DialogContent className="max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            Clientes marcados no cadastro que já têm a guia gerada. Confira, ajuste o texto e envie. Cada cliente recebe um e-mail com o link da guia (vale 7 dias).
          </DialogDescription>
        </DialogHeader>

        {itens.length === 0 ? (
          <p className="rounded-md border border-dashed border-line p-6 text-center text-ui text-muted-ink">
            Nenhuma guia gerada para os clientes marcados nesta competência. Gere em lote primeiro ou marque quem recebe guia no cadastro.
          </p>
        ) : (
          <div className="max-h-[32vh] space-y-1 overflow-y-auto rounded-md border border-line p-2">
            {itens.map((i) => {
              const r = resultados.get(i.contactId);
              return (
                <label key={i.contactId} className={cn('flex items-start gap-2 rounded-sm px-2 py-1.5', i.email ? 'cursor-pointer hover:bg-bg-2' : 'opacity-60')}>
                  {r || atual === i.contactId
                    ? <IconeResultado r={r} rodando={atual === i.contactId} />
                    : <Checkbox checked={marcados.has(i.contactId)} disabled={!i.email || rodando} onCheckedChange={() => alternar(i.contactId)} className="mt-0.5" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ui text-ink">{i.nome}</p>
                    <p className="text-meta text-muted-ink-2">{i.rotulo}</p>
                    {r ? (
                      <p className={cn('text-meta', r.estado === 'erro' ? 'text-danger' : 'text-muted-ink-2')}>{r.msg}</p>
                    ) : (
                      <p className={cn('text-meta', i.email ? 'text-muted-ink-2' : 'text-warn')}>
                        {i.email ? <><Mail className="mr-1 inline h-3 w-3" />{i.email}</> : 'Sem e-mail no cadastro: não dá para enviar daqui.'}
                        {i.enviadoEm && ` · já enviado em ${format(new Date(i.enviadoEm), 'dd/MM HH:mm')}`}
                      </p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        )}

        {!terminou && itens.length > 0 && (
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-ui-strong text-ink">Assunto</label>
              <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} disabled={rodando} />
            </div>
            <div className="space-y-1">
              <label className="text-ui-strong text-ink">Mensagem</label>
              <Textarea rows={5} value={mensagem} onChange={(e) => setMensagem(e.target.value)} disabled={rodando} />
              <p className="text-meta text-muted-ink-2">{'{cliente}'} vira o nome de cada cliente. O link da guia entra embaixo da mensagem.</p>
            </div>
          </div>
        )}

        {terminou && <p className="text-ui text-ink">{ok} {ok === 1 ? 'e-mail enviado' : 'e-mails enviados'}{erros ? ` · ${erros} com erro` : ''}. Fica tudo no histórico de envios de cada cliente.</p>}

        <DialogFooter>
          {rodando ? (
            <Button variant="outline" onClick={() => { parar.current = true; }}>Parar depois deste</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>{terminou ? 'Fechar' : 'Cancelar'}</Button>
              {(!terminou || erros > 0) && itens.length > 0 && (
                <Button onClick={iniciar} disabled={!alvo.length || !mensagem.trim() || !assunto.trim()}>
                  <Mail className="mr-1.5 h-4 w-4" />
                  {terminou ? 'Tentar de novo os com erro' : `Enviar ${alvo.length} ${alvo.length === 1 ? 'e-mail' : 'e-mails'}`}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
