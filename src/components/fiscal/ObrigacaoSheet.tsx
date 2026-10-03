import { format, parseISO } from 'date-fns';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, Plus, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { tabsListClass, tabsTriggerClass } from '@/components/ds';
import { useAlterarObrigacaoCliente, useDatasDaObrigacao, useObrigacaoClientes, type ClienteDaObrigacao } from '@/hooks/useObrigacoesResumo';

export type AbaObrigacao = 'clientes' | 'datas';

interface Props {
  obligation: { id: string; name: string; description?: string | null } | null;
  /** Texto "Dia 20 · Mensal", "Último dia útil · Mensal"… */
  regraTexto: string;
  aba: AbaObrigacao;
  onAbaChange: (a: AbaObrigacao) => void;
  onClose: () => void;
}

const fmt = (s: string) => format(parseISO(s), 'dd/MM/yyyy');
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function Situacao({ c }: { c: ClienteDaObrigacao }) {
  if (c.divergencia === 'falta')
    return <span className="flex items-start gap-1.5 text-warn"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />Falta marcar. {c.motivo}</span>;
  if (c.divergencia === 'sobra')
    return <span className="flex items-start gap-1.5 text-warn"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />Pode sair. {c.motivo}</span>;
  if (c.divergencia === 'revisar')
    return <span className="flex items-start gap-1.5 text-muted-ink"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />Confira. {c.motivo}</span>;
  return <span className="flex items-center gap-1.5 text-ok"><CheckCircle2 className="h-3.5 w-3.5" />Confere</span>;
}

/** Painel lateral da obrigação: clientes (com o cruzamento com a Receita e botões marcar/remover) e as próximas datas do calendário. */
export function ObrigacaoSheet({ obligation, regraTexto, aba, onAbaChange, onClose }: Props) {
  const clientes = useObrigacaoClientes(obligation?.id ?? null);
  const datas = useDatasDaObrigacao(obligation?.id ?? null);
  const alterar = useAlterarObrigacaoCliente();

  const lista = clientes.data ?? [];
  const diverg = lista.filter((c) => c.divergencia === 'falta' || c.divergencia === 'sobra').length;
  const marcados = lista.filter((c) => c.marcada).length;

  return (
    <Sheet open={!!obligation} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[620px]">
        <SheetHeader>
          <SheetTitle>{obligation?.name}</SheetTitle>
          <p className="text-sm text-muted-foreground">{regraTexto}</p>
          {obligation?.description && <p className="text-sm">{obligation.description}</p>}
        </SheetHeader>

        {obligation && (
          <Tabs value={aba} onValueChange={(v) => onAbaChange(v as AbaObrigacao)} className="mt-4">
            <TabsList className={tabsListClass}>
              <TabsTrigger value="clientes" className={tabsTriggerClass}>
                Clientes ({marcados})
                {diverg > 0 && <Badge className="ml-1 border-warn/30 bg-warn/15 px-1.5 py-0 text-[10px] text-warn">{diverg} a conferir</Badge>}
              </TabsTrigger>
              <TabsTrigger value="datas" className={tabsTriggerClass}>Datas</TabsTrigger>
            </TabsList>

            <TabsContent value="clientes" className="mt-4">
              {clientes.isLoading ? (
                <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : lista.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum cliente com esta obrigação.</p>
              ) : (
                <>
                  <p className="mb-3 text-meta text-muted-ink">
                    O cruzamento usa a última declaração do Simples com receita (ISS e ICMS, e o que acompanha cada um). Outros regimes mostram só quem tem a obrigação.
                  </p>
                  <div className="divide-y divide-line rounded-md border border-line">
                    {lista.map((c) => (
                      <div key={c.contact_id} className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <Link to={`/contatos/${c.contact_id}`} className="text-ui-strong text-ink hover:underline">{c.nome}</Link>
                          <div className="mt-0.5 text-meta"><Situacao c={c} /></div>
                        </div>
                        {c.divergencia === 'falta' && !c.marcada && (
                          <Button
                            size="sm"
                            disabled={alterar.isPending}
                            onClick={() => alterar.mutate({ contactId: c.contact_id, obligationId: obligation.id, marcar: true })}
                          >
                            {alterar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Marcar
                          </Button>
                        )}
                        {(c.divergencia === 'sobra' || c.divergencia === 'revisar') && c.marcada && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            disabled={alterar.isPending}
                            onClick={() => alterar.mutate({ contactId: c.contact_id, obligationId: obligation.id, marcar: false })}
                          >
                            Remover
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="datas" className="mt-4">
              {datas.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (datas.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Ainda não há datas no calendário para esta obrigação. Elas aparecem quando a agenda do mês é importada.</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Competência</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Entrega interna</TableHead>
                        <TableHead>Origem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(datas.data ?? []).map((d) => (
                        <TableRow key={d.id}>
                          <TableCell>{MESES[d.competence_month - 1]}/{d.competence_year}</TableCell>
                          <TableCell>
                            {fmt(d.effective_due_date)}
                            {d.has_override && <Badge className="ml-2 border-warn/30 bg-warn/15 px-1.5 py-0 text-[10px] text-warn">Ajustada</Badge>}
                          </TableCell>
                          <TableCell>{fmt(d.effective_delivery_date)}</TableCell>
                          <TableCell>
                            {d.fonte === 'receita'
                              ? <Badge className="border-brand/30 bg-brand-tint px-1.5 py-0 text-[10px] text-brand">Receita</Badge>
                              : <Badge variant="outline" className="px-1.5 py-0 text-[10px]">Regra</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <p className="mt-3 text-meta text-muted-ink">Datas do calendário fiscal (fonte única). Para ajustar uma, use o Calendário Fiscal.</p>
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
