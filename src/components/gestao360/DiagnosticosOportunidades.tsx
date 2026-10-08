import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Send } from 'lucide-react';

import { DsAlert, DsBadge, type BadgeTone } from '@/components/ds';
import { formatarCnpj } from '@/components/gestao360/ClienteFiltro';
import { EnviarClienteDialog } from '@/components/gestao360/EnviarClienteDialog';
import { DicaBotao } from '@/components/serpro/DicaBotao';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { FaturamentoRow } from '@/hooks/useSerproFaturamento';
import { oportunidades, type OportunidadeLimite } from '@/lib/diagnosticos';
import { modeloLimite } from '@/lib/mensagensCliente';
import { brl, mesAno } from '@/lib/pdfRelatorios';
import { digitos, type LinhaCarteira } from '@/lib/situacaoCarteira';

const TOM_LIMITE: Record<string, BadgeTone> = { acima: 'danger', critico: 'danger', atencao: 'warn' };
const ROTULO_LIMITE: Record<string, string> = { acima: 'Acima do limite', critico: 'Crítico', atencao: 'Atenção' };
const ROTULO_SUBLIMITE: Record<string, string> = { acima: 'Acima do sublimite', perto: 'Perto do sublimite' };

/** Limite, sublimite e Fator R: quem está perto do teto do Simples e quem depende do Fator R. Só com faturamento já lido; sem leitura, não aparece. */
export function DiagnosticosOportunidades({ linhas, faturamento }: { linhas: LinhaCarteira[]; faturamento: FaturamentoRow[] }) {
  const o = useMemo(() => oportunidades(linhas, faturamento), [linhas, faturamento]);
  const [avisar, setAvisar] = useState<OportunidadeLimite | null>(null);
  const falta = o.cobertura.simples - o.cobertura.lidos;

  return (
    <div className="space-y-6">
      {falta > 0 && (
        <DsAlert
          tone="info" title={`Faturamento lido de ${o.cobertura.lidos} de ${o.cobertura.simples} clientes do Simples`}
          description="Só quem já teve o PDF do PGDAS-D lido entra aqui. A rodada mensal do dia 30 lê os demais; a primeira é em 30/10/2026. Cliente sem leitura não aparece, o que não quer dizer que esteja longe do limite."
        />
      )}

      <section className="space-y-3 rounded-lg border border-line bg-paper p-5">
        <div>
          <h2 className="text-h4-card text-ink">Perto do limite ou do sublimite</h2>
          <p className="text-meta text-muted-ink">80% do limite ou mais (atenção), 95% ou mais (crítico), ou perto do sublimite estadual. A "folga" é quantos meses de faturamento médio dos últimos 12 meses cabem até o limite.</p>
        </div>
        {o.limite.length === 0 ? (
          <p className="py-8 text-center text-ui text-muted-ink">Nenhum cliente com faturamento lido está perto do limite.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Empresa</TableHead><TableHead>Uso do limite</TableHead><TableHead>Margem até o limite</TableHead><TableHead>Sublimite</TableHead><TableHead>Leitura</TableHead><TableHead className="text-right">Ação</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {o.limite.map((x) => (
                <TableRow key={x.linha.contact_id}>
                  <TableCell>
                    <p className="text-ui-strong text-ink">{x.linha.nome}</p>
                    <p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(x.linha.documento)} · {x.linha.responsavel?.nome ?? 'sem responsável'}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <p className="text-ui-strong text-ink">{x.percentual.toFixed(0)}% <span className="text-meta font-normal text-muted-ink-2">{x.base}</span></p>
                    {x.nivel && x.nivel !== 'regular' && <DsBadge tone={TOM_LIMITE[x.nivel] ?? 'neutral'}>{ROTULO_LIMITE[x.nivel] ?? x.nivel}</DsBadge>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-ui text-ink">
                    {x.margem >= 0 ? brl(x.margem) : `${brl(-x.margem)} acima`}
                    {x.mesesDeFolga !== null && x.margem >= 0 && <p className="text-meta text-muted-ink">≈ {String(x.mesesDeFolga).replace('.', ',')} {x.mesesDeFolga === 1 ? 'mês' : 'meses'} de folga</p>}
                  </TableCell>
                  <TableCell>{x.sublimite && x.sublimite !== 'regular' ? <DsBadge tone={x.sublimite === 'acima' ? 'danger' : 'warn'}>{ROTULO_SUBLIMITE[x.sublimite]}</DsBadge> : <span className="text-ui text-muted-ink-2">—</span>}</TableCell>
                  <TableCell className="whitespace-nowrap text-ui text-muted-ink">{mesAno(`${x.competencia}-01`)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <DicaBotao texto="Abre um aviso consultivo ao cliente sobre o limite, com texto pronto para você revisar.">
                        <Button variant="ghost" size="icon" aria-label="Avisar cliente" onClick={() => setAvisar(x)}><Send className="h-4 w-4" /></Button>
                      </DicaBotao>
                      <Link to={`/dashboard-federal/simples-nacional?q=${digitos(x.linha.documento)}`} className="px-2 text-ui-strong text-action hover:underline">Ver</Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-line bg-paper p-5">
        <div>
          <h2 className="text-h4-card text-ink">Fator R</h2>
          <p className="text-meta text-muted-ink">Clientes em que a Receita indica o Fator R na declaração. O valor oficial é o que a Receita escreve; o calculado (folha ÷ receita de 12 meses) é só referência e depende da folha constar no PDF.</p>
        </div>
        {o.fatorR.length === 0 ? (
          <p className="py-8 text-center text-ui text-muted-ink">Nenhum cliente com Fator R na leitura de faturamento.</p>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Fator r (Receita)</TableHead><TableHead>Calculado</TableHead><TableHead>Leitura</TableHead></TableRow></TableHeader>
            <TableBody>
              {o.fatorR.map((x) => (
                <TableRow key={x.linha.contact_id}>
                  <TableCell><p className="text-ui-strong text-ink">{x.linha.nome}</p><p className="font-mono text-meta text-muted-ink-2">{formatarCnpj(x.linha.documento)}</p></TableCell>
                  <TableCell className="text-ui text-ink">{x.texto}</TableCell>
                  <TableCell className="text-ui text-muted-ink">{x.calculado === null ? 'Sem folha no PDF' : `${(x.calculado * 100).toFixed(1).replace('.', ',')}%`}</TableCell>
                  <TableCell className="whitespace-nowrap text-ui text-muted-ink">{mesAno(`${x.competencia}-01`)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {avisar && (
        <EnviarClienteDialog
          key={avisar.linha.contact_id} contactId={avisar.linha.contact_id} nome={avisar.linha.nome} origem="oportunidade"
          modelo={modeloLimite(avisar.percentual, avisar.margem, avisar.nivel === 'acima')} onClose={() => setAvisar(null)}
        />
      )}
    </div>
  );
}
