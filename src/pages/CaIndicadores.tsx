import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { DsAlert, PageHeader } from '@/components/ds';
import { BarrasHorizontais, BarrasVerticais, Cartao, Evolucao, LinhaDoTempo } from '@/components/gestao360/GraficosCarteira';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFotosCarteira, useEnviosPorMes, useIndicadoresMensais, useMetricaMae, useSalvarMetricaMae } from '@/hooks/useDiagnosticos';
import { useProfile } from '@/hooks/useProfile';
import { useMensagensCriticas } from '@/hooks/useSerproCaixaPostal';
import { anoDe, useMatrizPgdasd } from '@/hooks/useSerproPgdasd';
import { useSituacaoCarteira } from '@/hooks/useSituacaoCarteira';
import { useTeamProfiles } from '@/hooks/useTeamProfiles';
import { cargaResponsavel, coberturaDados, entregasNoPrazo, mensagensParadas } from '@/lib/diagnosticos';
import { usePerfilCarteira } from '@/hooks/useDiagnosticos';
import { dataBR, montarGraficos } from '@/lib/situacaoCarteira';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (m: string) => `${MESES_CURTOS[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const mesesRecentes = (n: number, hoje: string) => {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1 - i, 1)); out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`); }
  return out;
};

/** Como está a operação: métrica-mãe, o que o sistema fez no lugar da equipe, entregas no prazo, carga por responsável, mensagens paradas, evolução, envios e cobertura de dados. */
export default function CaIndicadores() {
  const { linhas, carregando, erro, competencia, hoje, faturamento } = useSituacaoCarteira();
  const ano = anoDe(competencia);
  const matriz = useMatrizPgdasd(ano);
  const mensagens = useMensagensCriticas();
  const mensais = useIndicadoresMensais(6);
  const envios = useEnviosPorMes(6);
  const fotos = useFotosCarteira();
  const mae = useMetricaMae();
  const perfil = usePerfilCarteira();
  const equipe = useTeamProfiles();
  const { profile } = useProfile();
  const salvarMae = useSalvarMetricaMae();
  const admin = profile?.is_super_admin === true || profile?.role === 'admin';

  const meses = useMemo(() => mesesRecentes(6, hoje), [hoje]);
  const [mesMae, setMesMae] = useState(meses[meses.length - 1]);
  const [valorMae, setValorMae] = useState('');
  const [notaMae, setNotaMae] = useState('');

  const entregas = useMemo(() => entregasNoPrazo(matriz.data ?? [], ano, hoje), [matriz.data, ano, hoje]);
  const carga = useMemo(() => cargaResponsavel(linhas), [linhas]);
  const paradas = useMemo(() => mensagensParadas(mensagens.data ?? [], hoje), [mensagens.data, hoje]);
  const cobertura = useMemo(() => coberturaDados(linhas, perfil.data ?? new Map(), faturamento), [linhas, perfil.data, faturamento]);
  const evolucaoAno = useMemo(() => montarGraficos(linhas, competencia, hoje).evolucao, [linhas, competencia, hoje]);
  const nomes = useMemo(() => new Map((equipe.data ?? []).map((p) => [p.id, p.full_name ?? 'Sem nome'] as const)), [equipe.data]);

  const maePorMes = new Map((mae.data ?? []).map((m) => [m.mes, m] as const));
  const serieMae = meses.filter((m) => maePorMes.has(m)).map((m) => ({ nome: rotuloMes(m), valor: maePorMes.get(m)!.valor }));
  const soma = (metrica: string, mes: string) => (mensais.data ?? []).filter((x) => x.metrica === metrica && x.mes === mes).reduce((s, x) => s + x.n, 0);
  const enviosDoMes = (mes: string) => (envios.data ?? []).filter((e) => e.enviado_em.slice(0, 7) === mes).length;
  const enviosPorPessoa = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of (envios.data ?? []).filter((x) => x.enviado_em.slice(0, 7) === meses[meses.length - 1])) { const n = e.enviado_por ? nomes.get(e.enviado_por) ?? 'Outro' : 'Sem registro'; m.set(n, (m.get(n) ?? 0) + 1); }
    return [...m.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
  }, [envios.data, nomes, meses]);
  const linhasFoto = (fotos.data ?? []).map((f) => ({ dia: `${f.dia.slice(8, 10)}/${f.dia.slice(5, 7)}`, 'Clientes com PGDAS-D em falta': f.pgdas_clientes_em_falta, 'Competências em falta': f.pgdas_competencias_em_falta }));

  const salvar = async () => {
    const v = Number(valorMae);
    if (!Number.isInteger(v) || v < 0) { toast.error('Informe um número inteiro, zero ou mais.'); return; }
    try { await salvarMae.mutateAsync({ mes: mesMae, valor: v, nota: notaMae }); toast.success('Métrica-mãe registrada.'); setValorMae(''); setNotaMae(''); }
    catch { toast.error('Não foi possível salvar. Só administrador registra.'); }
  };

  const carregandoTudo = carregando || matriz.isLoading;
  return (
    <div className="space-y-6">
      <PageHeader kicker="~/gestão 360°" title="CA · Indicadores." subtitle="Como está a operação: o que o sistema fez no lugar da equipe, se as entregas saem no prazo e quem carrega o quê." />
      {(erro || matriz.error) ? <DsAlert tone="danger" title="Não foi possível carregar tudo" description="Alguma fonte falhou. Os números abaixo podem estar incompletos; recarregue a página." /> : null}

      {carregandoTudo ? <Skeleton className="h-[420px] w-full" /> : (
        <>
          <section className="space-y-4 rounded-lg border border-line bg-paper p-5">
            <div>
              <h2 className="text-h4-card text-ink">Métrica-mãe: processos manuais eliminados no mês</h2>
              <p className="text-meta text-muted-ink">É o número que guia o H2. O sistema não sabe contar sozinho: um administrador registra o do mês. Mês sem registro fica fora do gráfico.</p>
            </div>
            <BarrasVerticais dados={serieMae} vazio="Ainda não há mês registrado." altura={170} />
            {admin ? (
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5"><Label className="text-ink">Mês</Label>
                  <select value={mesMae} onChange={(e) => setMesMae(e.target.value)} className="h-10 rounded-md border border-line bg-paper px-3 text-ui text-ink">{meses.map((m) => <option key={m} value={m}>{rotuloMes(m)}</option>)}</select></div>
                <div className="space-y-1.5"><Label className="text-ink">Processos eliminados</Label><Input value={valorMae} onChange={(e) => setValorMae(e.target.value)} inputMode="numeric" className="w-[140px]" placeholder={maePorMes.has(mesMae) ? String(maePorMes.get(mesMae)!.valor) : 'Ex.: 12'} /></div>
                <div className="min-w-[220px] flex-1 space-y-1.5"><Label className="text-ink">Nota (quais foram)</Label><Input value={notaMae} onChange={(e) => setNotaMae(e.target.value)} maxLength={300} /></div>
                <Button onClick={salvar} disabled={!valorMae || salvarMae.isPending}>Registrar</Button>
              </div>
            ) : <p className="text-meta text-muted-ink-2">Só administrador registra.</p>}
          </section>

          <section className="space-y-3 rounded-lg border border-line bg-paper p-5">
            <div>
              <h2 className="text-h4-card text-ink">O que o sistema fez no lugar da equipe</h2>
              <p className="text-meta text-muted-ink">Medido pelo sistema, por mês. Não é a métrica-mãe: é o trabalho automático que ajuda a explicá-la.</p>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Trabalho</TableHead>{meses.map((m) => <TableHead key={m} className="text-right">{rotuloMes(m)}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {([
                  ['Tarefas fiscais concluídas sozinhas (a Receita provou)', (m: string) => soma('auto_concluidas', m)],
                  ['Tarefas criadas sozinhas a partir da Receita', (m: string) => soma('auto_criadas', m)],
                  ['Alertas enviados à equipe (Gestão 360°)', (m: string) => soma('alertas', m)],
                  ['Envios ao cliente (e-mail, WhatsApp ou texto copiado)', (m: string) => enviosDoMes(m)],
                  ['Relatórios para o cliente gerados', (m: string) => soma('relatorios', m)],
                ] as [string, (m: string) => number][]).map(([rotulo, f]) => (
                  <TableRow key={rotulo}><TableCell className="text-ui text-ink">{rotulo}</TableCell>{meses.map((m) => <TableCell key={m} className="text-right text-ui-strong text-ink">{f(m)}</TableCell>)}</TableRow>
                ))}
              </TableBody>
            </Table>
            {enviosPorPessoa.length > 0 && <p className="text-meta text-muted-ink">Envios em {rotuloMes(meses[meses.length - 1])} por pessoa: {enviosPorPessoa.map((e) => `${e.nome} ${e.valor}`).join(' · ')}.</p>}
          </section>

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
        </>
      )}
    </div>
  );
}
