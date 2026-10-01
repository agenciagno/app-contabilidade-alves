import type { ReactNode } from 'react';
import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { FatiaGrafico, GraficosCarteira } from '@/lib/situacaoCarteira';

/** Cores dos tokens do design system (mudam sozinhas no modo escuro). */
const COR: Record<string, string> = {
  em_dia: 'var(--ok)', sem_pendencias: 'var(--ok)', regular: 'var(--ok)',
  em_falta: 'var(--danger)', com_pendencias: 'var(--danger)', irregular: 'var(--danger)',
  a_confirmar: 'var(--warn)', a_conferir: 'var(--warn)', vencida: 'var(--warn)',
  nao_consultado: 'var(--muted-ink-2)', sem_relatorio: 'var(--muted-ink-2)', sem_leitura: 'var(--muted-ink-2)',
};
const COR_BARRA = 'var(--action)';
const TICK = { fill: 'var(--muted-ink)', fontSize: 12 };

export function Cartao({ titulo, subtitulo, children, className }: { titulo: string; subtitulo: string; children: ReactNode; className?: string }) {
  return (
    <section className={`space-y-3 rounded-lg border border-line bg-paper p-5 ${className ?? ''}`}>
      <div>
        <h3 className="text-h4-card text-ink">{titulo}</h3>
        <p className="text-meta text-muted-ink">{subtitulo}</p>
      </div>
      {children}
    </section>
  );
}

const Vazio = ({ texto }: { texto: string }) => (
  <div className="flex h-[180px] items-center justify-center px-6 text-center text-ui text-muted-ink-2">{texto}</div>
);

function Rosca({ fatias, vazio }: { fatias: FatiaGrafico[]; vazio: string }) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  if (total === 0) return <Vazio texto={vazio} />;
  return (
    <div className="flex items-center gap-6">
      <div className="relative h-[180px] w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={fatias.filter((f) => f.valor > 0)} dataKey="valor" nameKey="nome" innerRadius={58} outerRadius={84} paddingAngle={2} stroke="none">
              {fatias.filter((f) => f.valor > 0).map((f) => <Cell key={f.chave} fill={COR[f.chave] ?? 'var(--muted-ink-2)'} />)}
            </Pie>
            <Tooltip formatter={(v: number, n: string) => [`${v} ${v === 1 ? 'cliente' : 'clientes'}`, n]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-metric-xl text-ink">{total}</span>
          <span className="text-meta text-muted-ink">{total === 1 ? 'cliente' : 'clientes'}</span>
        </div>
      </div>
      <ul className="space-y-1.5">
        {fatias.map((f) => (
          <li key={f.chave} className="flex items-center gap-2 text-ui text-ink">
            <span className="h-2.5 w-2.5 rounded-pill" style={{ background: COR[f.chave] ?? 'var(--muted-ink-2)' }} />
            <span className="text-muted-ink">{f.nome}</span>
            <span className="text-ui-strong">{f.valor}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BarrasHorizontais({ dados, vazio }: { dados: { nome: string; valor: number }[]; vazio: string }) {
  if (dados.length === 0 || dados.every((d) => d.valor === 0)) return <Vazio texto={vazio} />;
  return (
    <div style={{ height: Math.max(140, dados.length * 44 + 20) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} layout="vertical" margin={{ top: 0, right: 28, bottom: 0, left: 0 }}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="nome" width={130} tick={TICK} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: 'var(--bg-2)' }} formatter={(v: number) => [`${v} ${v === 1 ? 'cliente' : 'clientes'}`, '']} />
          <Bar dataKey="valor" fill={COR_BARRA} radius={[0, 4, 4, 0]} barSize={18}>
            <LabelList dataKey="valor" position="right" style={{ fill: 'var(--ink)', fontSize: 12 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarrasPorObrigacao({ dados }: { dados: GraficosCarteira['porObrigacao'] }) {
  if (dados.every((d) => d.emFalta === 0 && d.aConfirmar === 0)) return <Vazio texto="Nenhuma declaração em falta nem a confirmar." />;
  return (
    <div>
      <div style={{ height: dados.length * 44 + 20 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} layout="vertical" margin={{ top: 0, right: 28, bottom: 0, left: 0 }}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="nome" width={80} tick={TICK} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'var(--bg-2)' }} />
            <Bar dataKey="emFalta" name="Em falta" stackId="a" fill="var(--danger)" barSize={18}>
              <LabelList dataKey="emFalta" position="insideLeft" formatter={(v: number) => (v > 0 ? v : '')} style={{ fill: '#fff', fontSize: 11 }} />
            </Bar>
            <Bar dataKey="aConfirmar" name="A confirmar" stackId="a" fill="var(--warn)" radius={[0, 4, 4, 0]} barSize={18}>
              <LabelList dataKey="aConfirmar" position="insideLeft" formatter={(v: number) => (v > 0 ? v : '')} style={{ fill: '#fff', fontSize: 11 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 flex gap-4 text-meta text-muted-ink">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-pill" style={{ background: 'var(--danger)' }} />Em falta</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-pill" style={{ background: 'var(--warn)' }} />A confirmar (DCTFWeb e MIT: sem declaração não prova atraso)</span>
      </p>
    </div>
  );
}

export function Evolucao({ dados }: { dados: GraficosCarteira['evolucao'] }) {
  if (dados.length === 0) return <Vazio texto="Ainda não há competência com prazo vencido neste ano." />;
  const serie = dados.map((d) => ({ nome: `${d.competencia.slice(5, 7)}/${d.competencia.slice(2, 4)}`, valor: d.emFalta }));
  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={serie} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="nome" tick={TICK} axisLine={false} tickLine={false} />
          <YAxis hide allowDecimals={false} />
          <Tooltip cursor={{ fill: 'var(--bg-2)' }} formatter={(v: number) => [`${v} ${v === 1 ? 'cliente' : 'clientes'}`, 'Em falta']} />
          <Bar dataKey="valor" fill="var(--danger)" radius={[4, 4, 0, 0]} barSize={28}>
            <LabelList dataKey="valor" position="top" style={{ fill: 'var(--ink)', fontSize: 12 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficosCarteiraView({ g }: { g: GraficosCarteira }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Cartao titulo="Situação das entregas" subtitulo="PGDAS-D e DEFIS dos clientes do Simples">
        <Rosca fatias={g.entregas} vazio="Nenhum cliente com declaração a acompanhar." />
      </Cartao>
      <Cartao titulo="Em falta por obrigação" subtitulo="Clientes com a obrigação em falta ou a confirmar">
        <BarrasPorObrigacao dados={g.porObrigacao} />
      </Cartao>
      <Cartao titulo="Em falta por regime" subtitulo="Clientes com PGDAS-D ou DEFIS em falta">
        <BarrasHorizontais dados={g.porRegime} vazio="Nenhum cliente com declaração em falta." />
      </Cartao>
      <Cartao titulo="Situação fiscal" subtitulo="Último relatório da Receita e da PGFN de cada cliente">
        <Rosca fatias={g.situacaoFiscal} vazio="Sem relatório de Situação fiscal ainda." />
      </Cartao>
      <Cartao titulo="Pendências por regime" subtitulo="Clientes com pendência na Situação fiscal">
        <BarrasHorizontais dados={g.pendenciasPorRegime} vazio="Nenhum cliente com pendência na Situação fiscal." />
      </Cartao>
      <Cartao titulo="Certidão federal" subtitulo="Lida do relatório de Situação fiscal; estadual, municipal, FGTS e trabalhista não entram">
        <Rosca fatias={g.certidoes} vazio="Sem certidão lida ainda." />
      </Cartao>
      <Cartao className="lg:col-span-2" titulo="Evolução no ano" subtitulo="Clientes sem PGDAS-D em cada competência com prazo vencido. Mostra a situação de hoje, não o retrato da época">
        <Evolucao dados={g.evolucao} />
      </Cartao>
    </div>
  );
}

/** Gráficos da aba Visão geral de CA · Ausências: só o que é declaração em falta. */
export function GraficosAusencias({ g }: { g: GraficosCarteira }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Cartao titulo="Em falta por obrigação" subtitulo="Clientes com a obrigação em falta ou a confirmar">
        <BarrasPorObrigacao dados={g.porObrigacao} />
      </Cartao>
      <Cartao titulo="Em falta por regime" subtitulo="Clientes com PGDAS-D ou DEFIS em falta">
        <BarrasHorizontais dados={g.porRegime} vazio="Nenhum cliente com declaração em falta." />
      </Cartao>
      <Cartao className="lg:col-span-2" titulo="Evolução no ano" subtitulo="Clientes sem PGDAS-D em cada competência com prazo vencido. Mostra a situação de hoje, não o retrato da época">
        <Evolucao dados={g.evolucao} />
      </Cartao>
    </div>
  );
}
