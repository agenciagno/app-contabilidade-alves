import {
  AlertTriangle, ArrowRight, Check, Download, Save, TrendingDown, TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { LinhaDoTempo } from '@/components/rt/LinhaDoTempo';
import { TrajetoriaChart } from '@/components/rt/TrajetoriaChart';
import { REGIME_LABEL } from '@/lib/rt/tabelas';
import type { Diagnostico } from '@/lib/rt/types';

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const pct = (v: number) => `${(v * 100).toFixed(2).replace('.', ',')}%`;
/** O empresário raciocina no mês; o ano fica como referência secundária. */
const mes = (v: number) => v / 12;

interface Props {
  diagnostico: Diagnostico;
  nomeEmpresa: string;
  cnpj?: string | null;
  onSalvar: () => void;
  onExportarPdf: () => void;
  salvando?: boolean;
  jaSalvo?: boolean;
}

export function DiagnosticoResultado({
  diagnostico: d, nomeEmpresa, cnpj, onSalvar, onExportarPdf, salvando, jaSalvo,
}: Props) {
  const subiu = d.variacaoValor > 0;
  const semMudanca = Math.abs(d.variacaoValor) < 1;
  const noUnificado = d.simplesFicaNoUnificado;

  return (
    <div className="space-y-6">
      {/* Resumo executivo — a resposta em uma olhada */}
      <Card
        className={
          noUnificado ? 'border-primary/40' : subiu ? 'border-destructive/40' : 'border-emerald-500/40'
        }
      >
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {noUnificado || semMudanca ? null : subiu ? (
                  <TrendingUp className="h-5 w-5 text-destructive" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-emerald-600" />
                )}
                <span className="text-sm font-medium text-muted-foreground">
                  {nomeEmpresa}
                  {cnpj ? ` · ${cnpj}` : ''} · {REGIME_LABEL[d.input.regimeAtual]}
                  {d.atual.anexo ? ` · Anexo ${d.atual.anexo}` : ''}
                </span>
              </div>
              <h2 className="text-2xl font-semibold leading-tight">
                {noUnificado
                  ? 'Ficando no DAS unificado, a conta não muda'
                  : semMudanca
                    ? 'A carga sobre consumo fica praticamente igual'
                    : subiu
                      ? 'Com a reforma, a carga sobre consumo tende a subir'
                      : 'Com a reforma, a carga sobre consumo tende a cair'}
              </h2>
              {noUnificado ? (
                <p className="text-3xl font-bold">
                  {brl(mes(d.atual.cargaConsumo))}
                  <span className="ml-2 text-base font-medium text-muted-foreground">
                    por mês, como hoje ({brl(d.atual.cargaConsumo)} no ano)
                  </span>
                </p>
              ) : (
                !semMudanca && (
                  <p className={`text-3xl font-bold ${subiu ? 'text-destructive' : 'text-emerald-600'}`}>
                    {subiu ? '+' : '−'}{brl(mes(Math.abs(d.variacaoValor)))}
                    <span className="ml-2 text-base font-medium text-muted-foreground">
                      por mês ({subiu ? '+' : '−'}{Math.abs(d.variacaoPercentual * 100).toFixed(1).replace('.', ',')}%) ·{' '}
                      {brl(Math.abs(d.variacaoValor))} no ano
                    </span>
                  </p>
                )
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onExportarPdf}>
                <Download className="mr-2 h-4 w-4" /> PDF
              </Button>
              <Button size="sm" onClick={onSalvar} disabled={salvando || jaSalvo}>
                {jaSalvo ? <Check className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
                {jaSalvo ? 'Salvo' : 'Salvar'}
              </Button>
            </div>
          </div>

          <p className="mt-4 border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground">
            {d.explicacao}
          </p>
        </CardContent>
      </Card>

      {/* De / Para */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Hoje</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-2xl font-semibold">
                {brl(mes(d.atual.cargaConsumo))}
                <span className="ml-1.5 text-sm font-normal text-muted-foreground">/mês</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {pct(d.atual.aliquotaEfetivaConsumo)} do faturamento · {brl(d.atual.cargaConsumo)} no ano
              </p>
            </div>
            <Table>
              <TableBody>
                {d.atual.linhas.filter((l) => l.consumo).map((l) => (
                  <TableRow key={l.tributo}>
                    <TableCell className="py-1.5 text-xs">{l.tributo}</TableCell>
                    <TableCell className="py-1.5 text-right text-xs tabular-nums">
                      {brl(mes(l.valor))}<span className="text-muted-foreground">/mês</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground">
              Fora desta conta, sem mudança pela reforma:{' '}
              <strong>{brl(mes(d.atual.cargaNaoConsumo))}/mês</strong> de IRPJ, CSLL e INSS patronal.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {noUnificado ? 'Se optar pelo regime regular (CBS + IBS)' : 'Com a reforma (CBS + IBS)'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-2xl font-semibold">
                {brl(mes(d.posReforma.liquido))}
                <span className="ml-1.5 text-sm font-normal text-muted-foreground">/mês</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {pct(d.posReforma.aliquotaEfetiva)} do faturamento · {brl(d.posReforma.liquido)} no ano
                {noUnificado ? ' — só se a empresa optar na janela de setembro' : ''}
              </p>
            </div>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="py-1.5 text-xs">
                    Débito ({pct(d.posReforma.aliquotaTotal)} sobre o faturamento)
                  </TableCell>
                  <TableCell className="py-1.5 text-right text-xs tabular-nums">
                    {brl(mes(d.posReforma.debito))}<span className="text-muted-foreground">/mês</span>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="py-1.5 text-xs text-emerald-600">
                    Crédito das compras
                  </TableCell>
                  <TableCell className="py-1.5 text-right text-xs tabular-nums text-emerald-600">
                    − {brl(mes(d.posReforma.credito))}/mês
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <div className="space-y-1">
              {d.posReforma.observacoes.map((o, i) => (
                <p key={i} className="text-xs text-muted-foreground">{o}</p>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trajetória ano a ano */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">A trajetória da sua carga até 2033</CardTitle>
          <p className="text-sm text-muted-foreground">
            A reforma entra aos poucos. Veja como a carga sobre consumo caminha de hoje até o
            modelo pleno.
          </p>
        </CardHeader>
        <CardContent>
          <TrajetoriaChart
            trajetoria={d.trajetoria}
            temCredito={(d.input.comprasComCredito12m ?? 0) > 0}
          />
        </CardContent>
      </Card>

      {/* Comparativo de regimes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">A empresa está no regime certo?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Regime</TableHead>
                <TableHead className="text-right">Por mês</TableHead>
                <TableHead className="text-right">No ano</TableHead>
                <TableHead className="text-right">Alíquota efetiva</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.comparativo.map((r) => {
                const atual = r.regime === d.input.regimeAtual;
                const melhor = d.melhorRegime?.regime === r.regime;
                return (
                  <TableRow key={r.regime} className={atual ? 'bg-muted/50' : undefined}>
                    <TableCell className="font-medium">
                      {r.label}
                      {r.anexo ? <span className="ml-1 text-xs text-muted-foreground">· Anexo {r.anexo}</span> : null}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {r.indisponivel && r.totalAnual === 0 ? '—' : brl(mes(r.totalAnual))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.indisponivel && r.totalAnual === 0 ? '—' : brl(r.totalAnual)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.indisponivel && r.totalAnual === 0 ? '—' : pct(r.aliquotaEfetiva)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {atual && <Badge variant="secondary">Atual</Badge>}
                        {melhor && !atual && <Badge>Mais barato</Badge>}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {d.economiaMigracao > 0 && d.melhorRegime && (
            <p className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
              Migrar para {d.melhorRegime.label} economizaria cerca de{' '}
              <strong>{brl(mes(d.economiaMigracao))} por mês</strong> ({brl(d.economiaMigracao)} no
              ano). Vale confirmar com uma análise
              individual antes de mudar — a troca de regime tem regras de prazo e efeitos que vão
              além do imposto.
            </p>
          )}

          <div className="space-y-1">
            {d.comparativo.flatMap((r) =>
              [...(r.indisponivel ? [`${r.label}: ${r.indisponivel}`] : []), ...r.observacoes].map(
                (o, i) => (
                  <p key={`${r.regime}-${i}`} className="text-xs text-muted-foreground">
                    <span className="font-medium">{r.label}:</span> {o.replace(`${r.label}: `, '')}
                  </p>
                )
              )
            )}
          </div>
        </CardContent>
      </Card>

      {/* Decisão de setembro — só para o Simples */}
      {d.hibrido && (
        <Card className="border-primary/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              A decisão de setembro: continuar no DAS ou apurar IBS/CBS por fora
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border p-4">
                <p className="text-sm font-medium">Continuar no DAS unificado</p>
                <p className="mt-1 text-xl font-semibold">
                  {brl(mes(d.hibrido.unificadoTotal))}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">/mês</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  tudo em uma guia só · {brl(d.hibrido.unificadoTotal)} no ano
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Crédito repassado a clientes PJ:{' '}
                  <strong>{brl(mes(d.hibrido.creditoRepassadoUnificado))}/mês</strong>
                </p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-sm font-medium">Regime regular de IBS/CBS ("híbrido")</p>
                <p className="mt-1 text-xl font-semibold">
                  {brl(mes(d.hibrido.hibridoTotal))}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">/mês</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {brl(mes(d.hibrido.hibridoDasResidual))} no DAS +{' '}
                  {brl(mes(d.hibrido.hibridoCbsIbs))} de CBS/IBS · {brl(d.hibrido.hibridoTotal)} no ano
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Crédito repassado a clientes PJ:{' '}
                  <strong>{brl(mes(d.hibrido.creditoRepassadoHibrido))}/mês</strong>
                </p>
              </div>
            </div>

            <div className="rounded-md bg-muted/60 p-4">
              <div className="mb-1 flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">
                  {d.hibrido.recomendacao === 'hibrido'
                    ? 'Caminho sugerido: regime regular'
                    : d.hibrido.recomendacao === 'unificado'
                      ? 'Caminho sugerido: continuar no DAS unificado'
                      : 'Precisa de análise individual'}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{d.hibrido.justificativa}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Linha do tempo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">A transição é gradual</CardTitle>
          <p className="text-sm text-muted-foreground">
            Nada muda de uma vez. Toque em cada etapa para ver o que acontece — e quando o negócio
            precisa estar pronto.
          </p>
        </CardHeader>
        <CardContent>
          <LinhaDoTempo />
        </CardContent>
      </Card>

      {/* Alertas e disclaimer */}
      <Card className="border-amber-500/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            O que observar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {d.alertas.map((a, i) => (
            <p key={i} className="text-sm text-muted-foreground">• {a}</p>
          ))}
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
            Este diagnóstico é uma estimativa para orientar a decisão e não substitui a análise
            individual da empresa. Os números partem das informações declaradas e das regras
            conhecidas hoje — a regulamentação da reforma segue em andamento.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
