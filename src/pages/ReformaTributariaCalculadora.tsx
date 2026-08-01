import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calculator, Download, History, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CalculadoraForm } from '@/components/rt/CalculadoraForm';
import { DiagnosticoResultado } from '@/components/rt/DiagnosticoResultado';
import { useContacts } from '@/hooks/useContacts';
import { useRtAliquotas } from '@/hooks/useRtAliquotas';
import { useRtSimulations, type RtSimulation } from '@/hooks/useRtSimulations';
import { gerarDiagnostico } from '@/lib/rt/diagnostico';
import { gerarPdfDiagnostico } from '@/lib/rt/pdf';
import { REGIME_LABEL } from '@/lib/rt/tabelas';
import type { Diagnostico, DiagnosticoInput } from '@/lib/rt/types';

interface MetaSimulacao {
  contactId: string | null;
  nomeReferencia: string | null;
  cnpj: string | null;
  uf: string | null;
  municipio: string | null;
  cnae: { codigo?: string; descricao?: string } | null;
}

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export default function ReformaTributariaCalculadora() {
  const { contacts, isLoading: carregandoContatos } = useContacts();
  const { aliquotas, isLoading: carregandoAliquotas } = useRtAliquotas();
  const { simulacoes, isLoading: carregandoHistorico, salvar, excluir } = useRtSimulations();

  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null);
  const [meta, setMeta] = useState<MetaSimulacao | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [aExcluir, setAExcluir] = useState<RtSimulation | null>(null);
  const [aba, setAba] = useState('nova');

  const nomeDe = (m: MetaSimulacao | null) => {
    if (!m) return 'Empresa';
    if (m.contactId) return contacts.find((c) => c.id === m.contactId)?.name ?? 'Cliente';
    return m.nomeReferencia || 'Simulação avulsa';
  };

  const calcular = (input: DiagnosticoInput, m: MetaSimulacao) => {
    setDiagnostico(gerarDiagnostico(input));
    setMeta(m);
    setSalvo(false);
  };

  const salvarDiagnostico = () => {
    if (!diagnostico || !meta) return;
    salvar.mutate(
      {
        contactId: meta.contactId,
        nomeReferencia: meta.nomeReferencia,
        cnpj: meta.cnpj,
        diagnostico,
        cnae: meta.cnae,
        uf: meta.uf,
        municipio: meta.municipio,
        aliquotaFonte: aliquotas.fonte,
      },
      { onSuccess: () => setSalvo(true) }
    );
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Calculator className="h-6 w-6 text-primary" strokeWidth={1.75} />
            Calculadora RT
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Estima o impacto da Reforma Tributária no cliente e monta um diagnóstico pronto para
            entregar — com o motivo de o imposto subir ou cair.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${aliquotas.fonte === 'api_oficial' ? 'bg-emerald-500' : 'bg-amber-500'}`}
          />
          {aliquotas.fonte === 'api_oficial' ? 'Alíquota da Receita Federal' : 'Teto legal (26,5%)'}
        </Badge>
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="nova">Nova simulação</TabsTrigger>
          <TabsTrigger value="historico" className="gap-1.5">
            <History className="h-3.5 w-3.5" />
            Histórico
            {simulacoes.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">({simulacoes.length})</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="nova" className="mt-4 space-y-6">
          {carregandoContatos ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <CalculadoraForm
              contacts={contacts}
              aliquotaCbs={aliquotas.cbs}
              aliquotaIbs={aliquotas.ibs}
              carregandoAliquotas={carregandoAliquotas}
              onCalcular={calcular}
            />
          )}

          {diagnostico && (
            <DiagnosticoResultado
              diagnostico={diagnostico}
              nomeEmpresa={nomeDe(meta)}
              cnpj={meta?.cnpj}
              onSalvar={salvarDiagnostico}
              onExportarPdf={() => gerarPdfDiagnostico(diagnostico, nomeDe(meta), meta?.cnpj)}
              salvando={salvar.isPending}
              jaSalvo={salvo}
            />
          )}
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Diagnósticos gerados</CardTitle>
            </CardHeader>
            <CardContent>
              {carregandoHistorico ? (
                <Skeleton className="h-40 w-full" />
              ) : simulacoes.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum diagnóstico salvo ainda.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Regime</TableHead>
                      <TableHead className="text-right">Faturamento 12m</TableHead>
                      <TableHead className="text-right">Impacto/mês</TableHead>
                      <TableHead>Gerado em</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {simulacoes.map((s) => {
                      const variacao = s.resultado?.variacaoValor ?? 0;
                      const noUnificado = s.resultado?.simplesFicaNoUnificado;
                      const nome = s.contacts?.name ?? s.nome_referencia ?? 'Simulação avulsa';
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{nome}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {REGIME_LABEL[s.regime_atual as keyof typeof REGIME_LABEL] ?? s.regime_atual}
                            {s.anexo_simples ? ` · ${s.anexo_simples}` : ''}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {brl(Number(s.faturamento_12m))}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${
                              noUnificado
                                ? 'text-muted-foreground'
                                : variacao > 0
                                  ? 'text-destructive'
                                  : 'text-emerald-600'
                            }`}
                          >
                            {noUnificado
                              ? 'Não muda no DAS'
                              : `${variacao > 0 ? '+' : '−'}${brl(Math.abs(variacao) / 12)}/mês`}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(s.created_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Baixar PDF"
                                onClick={() => gerarPdfDiagnostico(s.resultado, nome, s.cnpj)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Excluir"
                                onClick={() => setAExcluir(s)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!aExcluir} onOpenChange={(o) => !o && setAExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir diagnóstico?</AlertDialogTitle>
            <AlertDialogDescription>
              O diagnóstico de{' '}
              {aExcluir?.contacts?.name ?? aExcluir?.nome_referencia ?? 'esta simulação'} será
              removido. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (aExcluir) excluir.mutate(aExcluir.id);
                setAExcluir(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
