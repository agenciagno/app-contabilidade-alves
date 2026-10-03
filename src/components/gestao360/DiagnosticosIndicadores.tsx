import { useMemo } from 'react';

import { BarrasHorizontais, BarrasVerticais, Cartao, Evolucao, LinhaDoTempo } from '@/components/gestao360/GraficosCarteira';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFotosCarteira } from '@/hooks/useDiagnosticos';
import { useMensagensCriticas } from '@/hooks/useSerproCaixaPostal';
import { anoDe, useMatrizPgdasd } from '@/hooks/useSerproPgdasd';
import { cargaResponsavel, coberturaDados, entregasNoPrazo, mensagensParadas } from '@/lib/diagnosticos';
import type { PerfilContato } from '@/lib/diagnosticos';
import { dataBR, montarGraficos, type LinhaCarteira } from '@/lib/situacaoCarteira';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (m: string) => `${MESES_CURTOS[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

/** Aba Indicadores de CA · Diagnósticos: entregas no prazo, mensagens paradas, evolução, carga por responsável e cobertura de dados. */
export function DiagnosticosIndicadores({ linhas, competencia, hoje, faturamento, perfis }: {
  linhas: LinhaCarteira[]; competencia: string; hoje: string; faturamento: Parameters<typeof coberturaDados>[2]; perfis: Map<string, PerfilContato>;
}) {
  const ano = anoDe(competencia);
  const matriz = useMatrizPgdasd(ano);
  const mensagens = useMensagensCriticas();
  const fotos = useFotosCarteira();

  const entregas = useMemo(() => entregasNoPrazo(matriz.data ?? [], ano, hoje), [matriz.data, ano, hoje]);
  const carga = useMemo(() => cargaResponsavel(linhas), [linhas]);
  const paradas = useMemo(() => mensagensParadas(mensagens.data ?? [], hoje), [mensagens.data, hoje]);
  const cobertura = useMemo(() => coberturaDados(linhas, perfis, faturamento), [linhas, perfis, faturamento]);
  const evolucaoAno = useMemo(() => montarGraficos(linhas, competencia, hoje).evolucao, [linhas, competencia, hoje]);
  const linhasFoto = (fotos.data ?? []).map((f) => ({ dia: `${f.dia.slice(8, 10)}/${f.dia.slice(5, 7)}`, 'Clientes com PGDAS-D em falta': f.pgdas_clientes_em_falta, 'Competências em falta': f.pgdas_competencias_em_falta }));

  if (matriz.isLoading) return <Skeleton className="h-[420px] w-full" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Cartao titulo={`PGDAS-D no prazo em ${ano}`} subtitulo="Das declarações originais já transmitidas, quantas saíram até o vencimento. Quem ainda não transmitiu fica em CA · Ausências">
          <BarrasVerticais dados={entregas.map((e) => ({ nome: rotuloMes(e.competencia), valor: e.percentual }))} formato={(v) => `${v}%`} cor="var(--ok)" vazio="Nenhuma competência com prazo vencido e declaração transmitida neste ano." />
          {entregas.length > 0 && <p className="text-meta text-muted-ink">{entregas.map((e) => `${rotuloMes(e.competencia)}: ${e.noPrazo} de ${e.total}`).join(' · ')}</p>}
        </Cartao>
        <Cartao titulo="Mensagens críticas da Receita em aberto" subtitulo={paradas.total === 0 ? 'Há quanto tempo estão paradas' : `${paradas.total} em aberto (${paradas.novas} novas, ${paradas.emTratamento} em tratamento), por tempo desde o envio`}>
          <BarrasHorizontais dados={paradas.faixas} unidade={['mensagem', 'mensagens']} vazio="Nenhuma mensagem crítica em aberto." />
        </Cartao>
        <Cartao titulo="Evolução diária da carteira" subtitulo={fotos.data && fotos.data.length > 0 ? `Foto diária desde ${dataBR(fotos.data[0].dia)} (${fotos.data.length} ${fotos.data.length === 1 ? 'dia' : 'dias'}). O histórico começa quando a rotina foi ligada` : 'Foto diária da carteira'}>
          <LinhaDoTempo dados={linhasFoto} series={[{ chave: 'Clientes com PGDAS-D em falta', nome: 'Clientes com PGDAS-D em falta', cor: 'var(--danger)' }, { chave: 'Competências em falta', nome: 'Competências em falta', cor: 'var(--warn)' }]} vazio="A foto diária começou agora: o gráfico aparece a partir do segundo dia." />
        </Cartao>
        <Cartao titulo="PGDAS-D em falta por competência" subtitulo="Situação de hoje de cada competência do ano com prazo vencido, não o retrato da época">
          <Evolucao dados={evolucaoAno} />
        </Cartao>
      </div>

      <section className="space-y-3 rounded-lg border border-line bg-paper p-5">
        <div><h2 className="text-h4-card text-ink">Carga por responsável</h2><p className="text-meta text-muted-ink">Clientes de cada pessoa e o que está pendente com eles hoje.</p></div>
        <Table>
          <TableHeader><TableRow><TableHead>Responsável</TableHead><TableHead className="text-right">Clientes</TableHead><TableHead className="text-right">Com declaração em falta</TableHead><TableHead className="text-right">Com mensagem da Receita em aberto</TableHead><TableHead className="text-right">Com DAS vencido</TableHead></TableRow></TableHeader>
          <TableBody>
            {carga.map((c) => (
              <TableRow key={c.nome}>
                <TableCell className="text-ui-strong text-ink">{c.nome}</TableCell>
                <TableCell className="text-right text-ui text-ink">{c.clientes}</TableCell>
                <TableCell className="text-right text-ui text-ink">{c.declaracoesEmFalta}</TableCell>
                <TableCell className="text-right text-ui text-ink">{c.comMensagemAberta}</TableCell>
                <TableCell className="text-right text-ui text-ink">{c.dasVencidos}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-3 rounded-lg border border-line bg-paper p-5">
        <div><h2 className="text-h4-card text-ink">Cobertura de dados</h2><p className="text-meta text-muted-ink">Quanto da carteira tem dado para o monitoramento funcionar. Cobertura baixa deixa os outros números parciais.</p></div>
        <div className="space-y-3">
          {cobertura.map((c) => (
            <div key={c.rotulo} className="space-y-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-ui text-ink">{c.rotulo}</span><span className="text-ui-strong text-ink">{c.n} de {c.total} <span className="text-meta font-normal text-muted-ink-2">({c.percentual ?? '—'}%) · {c.dica}</span></span></div>
              <div className="h-2 overflow-hidden rounded-pill bg-bg-2"><div className="h-full rounded-pill" style={{ width: `${c.percentual ?? 0}%`, background: (c.percentual ?? 0) >= 90 ? 'var(--ok)' : (c.percentual ?? 0) >= 50 ? 'var(--warn)' : 'var(--danger)' }} /></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
