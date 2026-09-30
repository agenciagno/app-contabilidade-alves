import { format } from 'date-fns';
import { FileDown, Loader2 } from 'lucide-react';

import { DsBadge } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Preco } from '@/components/serpro/CustoSerpro';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { useAbrirGuia, useGerarGuiaComConfirmacao } from '@/components/serpro/parcelamentosUi';
import {
  ROTULO_MOD, competenciaAtual, consultadoEm, estadoParcelamento, modalidadesAtivas, rotuloParcela,
  type LinhaParcelamentos, type Modalidade,
} from '@/hooks/useSerproParcelamentos';

const moeda = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const REUSO_GUIA_MS = 24 * 3600_000;

/**
 * Painel de UM cliente: parcelamentos por modalidade e parcelas em aberto, cada uma com o botão de gerar a guia.
 * Abrir o painel é grátis (dados já salvos); só gerar a guia cobra, e pede confirmação.
 */
export function ParcelamentosClienteSheet({ linha, onClose }: { linha: LinhaParcelamentos | null; onClose: () => void }) {
  const { pedir, gerando, dialog } = useGerarGuiaComConfirmacao();
  const { ocupado, abrir } = useAbrirGuia();
  if (!linha) return null;

  const atual = competenciaAtual();
  const estado = estadoParcelamento(linha, atual);
  const ativas = modalidadesAtivas(linha);
  const ultima = consultadoEm(linha);
  const encerrados = linha.pedidos.filter((p) => !p.ativo);
  /** Guia recente (24 h) da mesma parcela: reabrir é grátis. */
  const guiaRecente = (mod: Modalidade, parcela: number) =>
    linha.guias.find((g) => g.modalidade === mod && g.parcela === parcela && Date.now() - Date.parse(g.gerado_em) < REUSO_GUIA_MS) ?? null;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[760px]">
        <SheetHeader className="space-y-1 text-left">
          <p className="font-mono text-meta text-muted-ink-2">{linha.documento}</p>
          <SheetTitle className="text-[20px]">{linha.nome}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-2">
              <DsBadge tone={estado === 'atrasado' ? 'danger' : estado === 'em_dia' ? 'ok' : 'neutral'}>
                {estado === 'atrasado' ? 'Parcela em atraso' : estado === 'em_dia' ? 'Parcelamento em dia' : estado === 'sem_parcelamento' ? 'Sem parcelamento ativo' : 'Não consultado'}
              </DsBadge>
              <span className="text-meta text-muted-ink">{ultima ? `Consultado em ${format(new Date(ultima), 'dd/MM/yyyy HH:mm')}` : 'Use "Consultar" na lista para baixar os parcelamentos'}</span>
            </div>
          </SheetDescription>
        </SheetHeader>

        {ativas.length === 0 && (
          <div className="mt-6 rounded-lg border border-dashed border-line p-8 text-center text-ui text-muted-ink">
            {linha.consultas.length ? 'Nenhum parcelamento ativo para este cliente.' : 'Este cliente ainda não foi consultado.'}
          </div>
        )}

        {ativas.map((mod) => {
          const pedidos = linha.pedidos.filter((p) => p.modalidade === mod && p.ativo);
          const parcelas = linha.parcelas.filter((p) => p.modalidade === mod);
          return (
            <section key={mod} className="mt-6 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-h4-card text-ink">{ROTULO_MOD[mod]}</h3>
                {pedidos.map((p) => (
                  <DsBadge key={p.id} tone="info" dot={false}>nº {p.numero} · pedido em {dataBR(p.data_pedido)}</DsBadge>
                ))}
              </div>
              {parcelas.length === 0 ? (
                <p className="rounded-lg border border-line bg-bg-2 p-4 text-ui text-muted-ink">Nenhuma parcela em aberto: o que a Receita liberou para imprimir está pago.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-line bg-paper">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Parcela</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead className="text-right">Guia</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parcelas.map((p) => {
                        const atrasada = p.parcela < atual;
                        const recente = guiaRecente(mod, p.parcela);
                        const chave = `${mod}:${p.parcela}`;
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="font-mono text-ui">{rotuloParcela(p.parcela)}</TableCell>
                            <TableCell className="text-right text-ui">{moeda(p.valor)}</TableCell>
                            <TableCell>
                              <DsBadge tone={atrasada ? 'danger' : p.parcela === atual ? 'warn' : 'neutral'} dot={false}>{atrasada ? 'Atrasada' : p.parcela === atual ? 'Do mês' : 'A vencer'}</DsBadge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {recente && (
                                  <DicaBotao texto={`Abre a guia desta parcela gerada em ${format(new Date(recente.gerado_em), 'dd/MM HH:mm')}, que já está guardada. Não consulta a Receita.`}>
                                    <Button size="icon" variant="ghost" className="h-8 w-8" disabled={ocupado === recente.id} onClick={() => abrir(recente.id)}>
                                      {ocupado === recente.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                                    </Button>
                                  </DicaBotao>
                                )}
                                <DicaBotao custo={recente ? undefined : 'Emitir'}
                                  texto={recente ? 'Já existe uma guia desta parcela gerada há menos de 24 horas: abre o arquivo guardado, sem emitir outra. Pede confirmação.'
                                    : 'Gera a guia desta parcela na Receita e abre o PDF. Fica registrada uma emissão. Pede confirmação antes.'}>
                                  <Button size="sm" variant={atrasada ? 'default' : 'outline'} disabled={gerando === chave} onClick={() => pedir(linha.contact_id, mod, p.parcela, linha.nome, !!recente)}>
                                    {gerando === chave && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                                    Gerar guia{!recente && <Preco tipo="Emitir" />}
                                  </Button>
                                </DicaBotao>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          );
        })}

        {encerrados.length > 0 && (
          <p className="mt-6 text-meta text-muted-ink-2">
            Histórico: {encerrados.length} pedido(s) já encerrado(s) ({[...new Set(encerrados.map((p) => ROTULO_MOD[p.modalidade]))].join(', ')}).
          </p>
        )}
        {dialog}
      </SheetContent>
    </Sheet>
  );
}
