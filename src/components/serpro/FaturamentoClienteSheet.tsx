import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Upload } from 'lucide-react';

import { DsBadge } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { siglaCompetencia } from '@/hooks/useSerproPagamentos';
import {
  ROTULO_NIVEL_LIMITE, fatorRCalculado, limiteDe, nivelLimite, nivelSublimite, percentualLimite, useAplicarFaturamento,
  type FaturamentoRow,
} from '@/hooks/useSerproFaturamento';
import { useLeituraFaturamento } from '@/components/serpro/useLeituraFaturamento';

export const moeda = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const mesBR = (aaaamm: string) => `${aaaamm.slice(5, 7)}/${aaaamm.slice(0, 4)}`;

export const ROTULO_REGIME: Record<string, string> = { competencia: 'Regime de competência', caixa: 'Regime de caixa' };

/** `comPercentual` = false para quem não pode ver valores: o percentual do limite revelaria a receita. */
export function NivelLimiteBadge({ f, comPercentual = true }: { f: FaturamentoRow; comPercentual?: boolean }) {
  const n = nivelLimite(f);
  const p = percentualLimite(f);
  if (!n || p === null) return null;
  const tom = n === 'regular' ? 'ok' : n === 'atencao' ? 'warn' : 'danger';
  return <DsBadge tone={tom}>{ROTULO_NIVEL_LIMITE[n]}{comPercentual && ` · ${p.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}</DsBadge>;
}

/**
 * Painel de UMA leitura de declaração: números, os 13 meses de receita, folha, tributos e avisos.
 * Só administrador abre este painel (tem valores em reais). "Reler" usa o PDF já guardado (sem custo).
 * "Aplicar ao Fiscal" copia a receita mensal para o faturamento do cliente com fonte "Receita"; lançamentos manuais nunca são alterados.
 */
export function FaturamentoClienteSheet({
  nome, documento, contactId, faturamento, onClose,
}: {
  nome: string;
  documento: string;
  contactId: string;
  faturamento: FaturamentoRow | null;
  onClose: () => void;
}) {
  const { executar, emAndamento } = useLeituraFaturamento();
  const aplicar = useAplicarFaturamento();
  const [confirmando, setConfirmando] = useState(false);

  const meses = useMemo(() => {
    const d = faturamento?.dados;
    if (!d) return [];
    const mapa = new Map<string, { interno: number; externo: number }>();
    for (const m of d.historico_interno ?? []) mapa.set(m.mes, { interno: m.valor, externo: 0 });
    for (const m of d.historico_externo ?? []) mapa.set(m.mes, { interno: mapa.get(m.mes)?.interno ?? 0, externo: m.valor });
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, v]) => ({ mes, ...v, total: v.interno + v.externo }));
  }, [faturamento]);

  if (!faturamento) return null;
  const f = faturamento;
  const d = f.dados;
  const pa = f.periodo_apuracao.slice(0, 7);
  const nSub = nivelSublimite(f);
  const fatorCalc = fatorRCalculado(f);
  const tributos = d?.debito_declarado;

  const confirmarAplicar = async () => {
    setConfirmando(false);
    try {
      const r = await aplicar.mutateAsync({ faturamentoId: f.id });
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível aplicar.'); return; }
      toast.success(`Faturamento aplicado: ${r.inseridos ?? 0} meses novos, ${r.atualizados ?? 0} atualizados${r.ignorados_manuais ? `, ${r.ignorados_manuais} mantidos (lançamento manual)` : ''}.`);
    } catch (e) {
      toast.error((e as Error)?.message || 'Não foi possível aplicar.');
    }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[760px]">
        <SheetHeader className="space-y-1 text-left">
          <p className="font-mono text-meta text-muted-ink-2">{documento}</p>
          <SheetTitle className="text-[20px]">{nome}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-2">
              <DsBadge tone="neutral" dot={false}>Declaração {siglaCompetencia(pa)} · nº {f.numero_declaracao}</DsBadge>
              {f.tipo === 'retificadora' && <DsBadge tone="info" dot={false}>Retificadora</DsBadge>}
              {f.regime_apuracao && <DsBadge tone={f.regime_apuracao === 'caixa' ? 'info' : 'neutral'} dot={false}>{ROTULO_REGIME[f.regime_apuracao]}</DsBadge>}
              <NivelLimiteBadge f={f} />
              {nSub === 'acima' && <DsBadge tone="danger">Acima do sublimite</DsBadge>}
              {nSub === 'perto' && <DsBadge tone="warn">Perto do sublimite</DsBadge>}
              {!f.confiavel && <DsBadge tone="warn">Conferir o PDF</DsBadge>}
            </div>
          </SheetDescription>
        </SheetHeader>

        {!f.confiavel && (
          <div className="mt-5 rounded-lg border border-line bg-bg-2 p-4">
            <p className="text-ui text-ink">Não usei estes números nos alertas.</p>
            <p className="mt-1 text-meta text-muted-ink">A leitura do PDF não fechou nas conferências. Abra o PDF na tela PGDAS e confira os valores à mão.</p>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-meta text-muted-ink">{f.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { rotulo: `Receita de ${siglaCompetencia(pa)}`, valor: moeda(f.rpa_total) },
            { rotulo: 'Últimos 12 meses (RBT12)', valor: moeda(f.rbt12_total) },
            { rotulo: 'No ano (RBA)', valor: moeda(f.rba_total) },
            { rotulo: 'Ano anterior (RBAA)', valor: moeda(f.rbaa_total) },
          ].map((c) => (
            <div key={c.rotulo} className="rounded-lg border border-line bg-paper p-3">
              <p className="text-meta text-muted-ink">{c.rotulo}</p>
              <p className="mt-1 text-[15px] font-medium text-ink">{c.valor}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-line bg-paper p-3">
            <p className="text-meta text-muted-ink">Limite do Simples</p>
            <p className="mt-1 text-[15px] font-medium text-ink">{moeda(limiteDe(f))}</p>
            <p className="text-meta text-muted-ink-2">{f.limite_total ? 'proporcionalizado, segundo a Receita' : 'teto anual (o PDF não trouxe o limite)'}</p>
          </div>
          <div className="rounded-lg border border-line bg-paper p-3">
            <p className="text-meta text-muted-ink">Sublimite ICMS/ISS{d?.uf ? ` (${d.uf})` : ''}</p>
            <p className="mt-1 text-[15px] font-medium text-ink">{moeda(f.sublimite)}</p>
            <p className="text-meta text-muted-ink-2">{d?.impedido_icms_iss ? 'impedido de recolher ICMS/ISS no DAS' : d?.municipio ?? ''}</p>
          </div>
          <div className="rounded-lg border border-line bg-paper p-3">
            <p className="text-meta text-muted-ink">Fator r</p>
            <p className="mt-1 text-[15px] font-medium text-ink">{f.fator_r_texto ?? '—'}</p>
            {f.fator_r_aplica && fatorCalc !== null && (
              <p className="text-meta text-muted-ink-2">folha ÷ RBT12 = {(fatorCalc * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% (conta nossa, só referência)</p>
            )}
          </div>
        </div>

        {meses.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-ui font-medium text-ink">Receita mensal anterior</p>
            <div className="overflow-hidden rounded-lg border border-line bg-paper">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">Mercado interno</TableHead>
                    <TableHead className="text-right">Mercado externo</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {meses.map((m) => (
                    <TableRow key={m.mes}>
                      <TableCell className="font-mono text-ui">{mesBR(m.mes)}</TableCell>
                      <TableCell className="text-right text-ui">{moeda(m.interno)}</TableCell>
                      <TableCell className="text-right text-ui">{moeda(m.externo)}</TableCell>
                      <TableCell className="text-right text-ui text-ink">{moeda(m.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {d && d.folha.length > 0 && (
          <p className="mt-4 text-meta text-muted-ink">Folha de salários informada: {d.folha.length} meses, total de {moeda(d.folha.reduce((s, m) => s + m.valor, 0))}.</p>
        )}

        {tributos && (
          <div className="mt-5">
            <p className="mb-2 text-ui font-medium text-ink">Débito declarado por tributo</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {([['IRPJ', tributos.irpj], ['CSLL', tributos.csll], ['COFINS', tributos.cofins], ['PIS', tributos.pis], ['CPP', tributos.cpp], ['ICMS', tributos.icms], ['IPI', tributos.ipi], ['ISS', tributos.iss], ['Total', tributos.total]] as const).map(([n, v]) => (
                <div key={n} className="rounded-lg border border-line bg-paper px-3 py-2">
                  <p className="text-meta text-muted-ink">{n}</p>
                  <p className="text-ui text-ink">{moeda(v)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <DicaBotao texto="Lê de novo o PDF da declaração que já está guardado. Não consulta a Receita.">
            <Button variant="outline" disabled={emAndamento === contactId} onClick={() => executar(contactId, pa)}>
              {emAndamento === contactId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Reler o PDF
            </Button>
          </DicaBotao>
          <DicaBotao texto={f.confiavel
            ? 'Copia a receita mês a mês deste cliente para o cadastro de faturamento dele (fonte: Receita). Não envia nada à Receita e não altera o que foi lançado à mão.'
            : 'Só disponível quando a leitura do PDF está confiável.'}>
            <Button disabled={!f.confiavel || aplicar.isPending} onClick={() => setConfirmando(true)}>
              {aplicar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Aplicar ao Fiscal
            </Button>
          </DicaBotao>
          <p className="min-w-[200px] flex-1 text-meta text-muted-ink-2">
            {`Lido em ${format(new Date(f.lido_em), 'dd/MM/yyyy HH:mm')}.`}
            {f.aplicado_fiscal_em && ` Aplicado ao Fiscal em ${format(new Date(f.aplicado_fiscal_em), 'dd/MM/yyyy HH:mm')}.`}
          </p>
        </div>

        <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Aplicar ao faturamento do Fiscal?</AlertDialogTitle>
              <AlertDialogDescription>
                Copia a receita de {meses.length + 1} meses de {nome} para o faturamento do cliente (fonte: Receita). Meses que já foram lançados à mão não são alterados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmarAplicar}>Aplicar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
