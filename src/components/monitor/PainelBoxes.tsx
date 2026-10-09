/**
 * Boxes do Dashboard Fiscal (09/10/2026, desenho do print de referência do MonitorHub): Limite do Simples, Ausências de Declarações,
 * Relatórios Fiscais, Declarações e Mensagens e-CAC. Só mostram números já calculados em `src/lib/painelFiscal.ts`.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import {
  AlertTriangle, ArrowRight, CalendarX, CheckCircle2, ChevronRight, Gavel, FileWarning, MinusCircle, Receipt, Scale, UserX,
} from 'lucide-react';
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';

import { DsBadge } from '@/components/ds';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COR_ESTADO, ESTADOS, ROTULO_ESTADO, type ContagemEstados, type EstadoMonitor } from '@/lib/monitorEstados';
import {
  maioresLimites, type BarraDeclaracao, type CartaoAusencia, type ResumoMensagens, type TipoLimite,
} from '@/lib/painelFiscal';
import type { LinhaSimples } from '@/lib/simplesNacionalLinhas';
import { LIMITE_SIMPLES } from '@/hooks/useSerproFaturamento';
import { CATEGORIAS, type UltimaMensagemCaixa } from '@/hooks/useSerproCaixaPostal';
import { cn } from '@/lib/utils';

const SIMPLES = '/dashboard-federal/simples-nacional';
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const milhoes = (v: number) => (v === 0 ? 'R$ 0' : `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`);

export function Caixa({ titulo, subtitulo, acao, children, className }: { titulo: string; subtitulo?: string; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-4 rounded-lg border border-line bg-paper p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-h4-card text-ink">{titulo}</h2>
          {subtitulo && <p className="text-meta text-muted-ink">{subtitulo}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

const VerTudo = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="flex shrink-0 items-center gap-1 text-ui-strong text-action hover:underline">{children}<ArrowRight className="h-3.5 w-3.5" /></Link>
);

/** Ícone de estado de uma barra ou linha: o mesmo vocabulário de cores do resto do Monitoramento. */
export function IconeEstado({ estado, className }: { estado: EstadoMonitor; className?: string }) {
  const box = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-md [&_svg]:h-5 [&_svg]:w-5';
  switch (estado) {
    case 'em_dia': return <span className={cn(box, 'bg-em-dia-soft text-em-dia', className)}><CheckCircle2 /></span>;
    case 'pendencia': return <span className={cn(box, 'bg-warn-soft text-warn', className)}><AlertTriangle /></span>;
    case 'atencao': return <span className={cn(box, 'bg-danger-soft text-danger', className)}><AlertTriangle /></span>;
    case 'processando': return <span className={cn(box, 'bg-processando-soft text-processando', className)}><MinusCircle /></span>;
    default: return <span className={cn(box, 'bg-bg-2 text-muted-ink', className)}><MinusCircle /></span>;
  }
}

// ---------------------------------------------------------------- Limite do Simples
export function LimiteSimplesBox({ simples }: { simples: LinhaSimples[] }) {
  const [tipo, setTipo] = useState<TipoLimite>('rbt12');
  const { itens, lidos, total } = maioresLimites(simples, tipo);
  const maior = Math.max(LIMITE_SIMPLES * 1.05, ...itens.map((i) => i.valor * 1.05));
  const curto = (s: string) => (s.length > 32 ? `${s.slice(0, 31)}…` : s);

  return (
    <Caixa
      titulo="Limite do Simples"
      subtitulo={`Os ${itens.length || 10} maiores clientes do Simples pela receita dos ${tipo === 'rbt12' ? 'últimos 12 meses (RBT12)' : 'meses do ano (RBA)'}, contra o sublimite e o limite.`}
      acao={(
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-meta text-muted-ink">Tipo</span>
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoLimite)}>
            <SelectTrigger className="h-9 w-[110px]" aria-label="Tipo de receita"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rbt12">RBT12</SelectItem>
              <SelectItem value="rba">RBA</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    >
      {itens.length === 0 ? (
        <p className="flex h-[200px] items-center justify-center px-6 text-center text-ui text-muted-ink-2">
          Nenhum cliente com o faturamento lido ainda. A leitura mensal roda no dia 30; antes disso, use "Ler faturamento" na tela Simples Nacional.
        </p>
      ) : (
        <div style={{ height: Math.max(220, itens.length * 34 + 50) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={itens} layout="vertical" margin={{ top: 18, right: 24, bottom: 0, left: 0 }}>
              <XAxis type="number" domain={[0, maior]} tickFormatter={milhoes} tick={{ fill: 'var(--muted-ink)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="nome" width={235} tickFormatter={curto} tick={{ fill: 'var(--ink)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <RTooltip
                cursor={{ fill: 'var(--bg-2)' }}
                formatter={(v: number, _n, p) => [`${moeda(v)}${p.payload.percentual !== null ? ` · ${p.payload.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% do limite` : ''}`, p.payload.motivo || 'Receita']}
              />
              {tipo === 'rbt12' && <ReferenceLine x={3_600_000} stroke="var(--warn)" strokeDasharray="4 4" label={{ value: 'Sublimite', position: 'top', fill: 'var(--warn)', fontSize: 11 }} />}
              {tipo === 'rbt12' && <ReferenceLine x={LIMITE_SIMPLES} stroke="var(--danger)" strokeDasharray="4 4" label={{ value: 'Limite', position: 'top', fill: 'var(--danger)', fontSize: 11 }} />}
              <Bar dataKey="valor" radius={[0, 4, 4, 0]} barSize={16}>
                {itens.map((i) => <Cell key={i.contact_id} fill={COR_ESTADO[i.estado]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-meta text-muted-ink">
        <span>{lidos} de {total} clientes do Simples com o faturamento lido. Só entra quem tem leitura confiável.</span>
        <VerTudo to={SIMPLES}>Ver no Simples Nacional</VerTudo>
      </div>
    </Caixa>
  );
}

// ---------------------------------------------------------------- Ausências de Declarações
function CartaoAusenciaUi({ titulo, subtitulo, c, faltamRotulo, tom, to }: {
  titulo: string; subtitulo: string; c: CartaoAusencia; faltamRotulo: string; tom: 'atencao' | 'pendencia'; to: string;
}) {
  return (
    <Link to={to} className="group flex flex-col gap-3 rounded-lg bg-bg-2 p-4 transition-colors hover:bg-bg-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-ui-strong text-ink">{titulo}</p>
          <p className="text-meta text-muted-ink">{subtitulo}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-ink-2 transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-2" title={faltamRotulo}>
          <IconeEstado estado={tom} />
          <div>
            <p className="text-metric-xl leading-none text-ink">{c.faltam}</p>
            <p className="text-meta text-muted-ink">{faltamRotulo}</p>
          </div>
        </div>
        <div className="flex items-center gap-2" title="Em dia">
          <div className="text-right">
            <p className="text-metric-xl leading-none text-ink">{c.emDia}</p>
            <p className="text-meta text-muted-ink">em dia</p>
          </div>
          <IconeEstado estado="em_dia" />
        </div>
      </div>
      {c.aVerificar > 0 && <p className="text-meta text-muted-ink-2">{c.aVerificar} {c.aVerificar === 1 ? 'cliente' : 'clientes'} a verificar (sem consulta ou consultar de novo)</p>}
    </Link>
  );
}

export function AusenciasBox({ simples, dctfwebMit }: { simples: CartaoAusencia; dctfwebMit: CartaoAusencia }) {
  return (
    <Caixa titulo="Ausências de Declarações" subtitulo="Clientes com declaração em falta, e os que estão em dia.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <CartaoAusenciaUi titulo="Simples" subtitulo="PGDAS-D e DEFIS" c={simples} faltamRotulo="em falta" tom="atencao" to="/gestao-360/ausencias" />
        <CartaoAusenciaUi titulo="DCTFWeb e MIT" subtitulo="Presumido e Real" c={dctfwebMit} faltamRotulo="a confirmar" tom="pendencia" to="/gestao-360/ausencias" />
      </div>
    </Caixa>
  );
}

// ---------------------------------------------------------------- Relatórios Fiscais (situação fiscal)
/** Trechos do conic-gradient: um arco por estado, na ordem dos estados, em graus. */
function arcos(fatias: { chave: EstadoMonitor; valor: number }[], total: number): string {
  let acumulado = 0;
  return fatias.filter((f) => f.valor > 0).map((f) => {
    const ini = (acumulado / total) * 360;
    acumulado += f.valor;
    return `${COR_ESTADO[f.chave]} ${ini}deg ${(acumulado / total) * 360}deg`;
  }).join(', ');
}

export function RelatoriosFiscaisBox({ contagem }: { contagem: ContagemEstados }) {
  const fatias = ESTADOS.filter((e) => e !== 'processando').map((e) => ({ chave: e, valor: contagem[e] }));
  const algum = fatias.some((f) => f.valor > 0);
  const rotulo: Record<EstadoMonitor, string> = {
    em_dia: 'Sem pendências', pendencia: 'Conferir o PDF', atencao: 'Com pendências', nao_verificado: 'Sem relatório', processando: 'Processando',
  };
  return (
    <Caixa titulo="Relatórios Fiscais" subtitulo="Relatório de situação fiscal de cada cliente, lido do e-CAC." acao={<VerTudo to="/dashboard-federal/situacao-fiscal">Abrir</VerTudo>}>
      <div className="flex items-center gap-5">
        <div className="relative h-[130px] w-[130px] shrink-0">
          {/* Rosca desenhada com conic-gradient: sem dado, fica um anel cinza; os arcos usam as cores dos estados. */}
          <div className="absolute inset-0 rounded-pill" style={{ background: algum ? `conic-gradient(${arcos(fatias, contagem.total)})` : 'var(--bg-3)' }} />
          <div className="absolute inset-[22px] flex flex-col items-center justify-center rounded-pill bg-paper">
            <span className="text-metric-xl leading-none text-ink">{contagem.total}</span>
            <span className="text-meta text-muted-ink">clientes</span>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-2">
          {fatias.map((f) => (
            <li key={f.chave} className="flex items-center gap-2 text-ui">
              <span className="h-2.5 w-2.5 shrink-0 rounded-pill" style={{ background: COR_ESTADO[f.chave] }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-muted-ink" title={ROTULO_ESTADO[f.chave]}>{rotulo[f.chave]}</span>
              <span className="text-ui-strong text-ink">{f.valor}</span>
            </li>
          ))}
        </ul>
      </div>
    </Caixa>
  );
}

// ---------------------------------------------------------------- Declarações
const DESTINO_DECLARACAO: Record<BarraDeclaracao['chave'], string> = {
  pgdas: `${SIMPLES}?fonte=declaracao`,
  defis: `${SIMPLES}?aba=defis`,
  dctfweb: '/dashboard-federal/dctfweb-mit',
  mit: '/dashboard-federal/dctfweb-mit',
};

export function DeclaracoesBox({ barras, competencia, className }: { barras: BarraDeclaracao[]; competencia: string; className?: string }) {
  return (
    <Caixa className={className} titulo="Declarações" subtitulo={`Declarações feitas entre os clientes já consultados (competência ${competencia}).`}>
      <div className="space-y-4">
        {barras.map((b) => {
          const pct = b.total > 0 ? (b.feitas / b.total) * 100 : 0;
          return (
            <Link key={b.chave} to={DESTINO_DECLARACAO[b.chave]} className="group block" title={b.nota}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-ui-strong text-ink group-hover:text-action">{b.titulo}</span>
                <span className="text-meta text-muted-ink">{b.feitas} / {b.total} declarados</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-3 flex-1 overflow-hidden rounded-pill bg-bg-3" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${b.titulo}: ${b.feitas} de ${b.total} declarados`}>
                  <div className="h-full rounded-pill" style={{ width: `${pct}%`, background: 'var(--em-dia)' }} />
                </div>
                <IconeEstado estado={b.pior} className="h-8 w-8" />
              </div>
              {b.naoConsultados > 0 && <p className="mt-1 text-meta text-muted-ink-2">{b.naoConsultados} {b.naoConsultados === 1 ? 'cliente' : 'clientes'} ainda não consultados</p>}
            </Link>
          );
        })}
      </div>
    </Caixa>
  );
}

// ---------------------------------------------------------------- Mensagens e-CAC
const ICONE_CATEGORIA: Record<string, typeof Gavel> = { intimacao: Gavel, malha: FileWarning, maed: CalendarX, cobranca: Receipt, processo: Scale };

const apenasDigitos = (v: string) => v.replace(/\D/g, '');

export function MensagensEcacBox({ r, ultimas, carregandoUltimas, className }: {
  r: ResumoMensagens; ultimas: UltimaMensagemCaixa[]; carregandoUltimas?: boolean; className?: string;
}) {
  const linhas: { chave: EstadoMonitor; rotulo: string; dica: string; valor: number; icone: ReactNode }[] = [
    { chave: 'atencao', rotulo: 'Exclusão', dica: 'Termo de exclusão do Simples em aberto', valor: r.exclusao, icone: <UserX className="h-5 w-5 text-danger" /> },
    { chave: 'pendencia', rotulo: 'Importante', dica: 'Mensagem crítica em aberto ou mensagem não lida', valor: r.importante, icone: <AlertTriangle className="h-5 w-5 text-warn" /> },
    { chave: 'em_dia', rotulo: 'Em dia', dica: 'Todas lidas e nada em aberto', valor: r.emDia, icone: <CheckCircle2 className="h-5 w-5 text-em-dia" /> },
    { chave: 'nao_verificado', rotulo: 'A verificar', dica: 'Sem procuração ou ainda não verificada', valor: r.aVerificar, icone: <MinusCircle className="h-5 w-5 text-muted-ink-2" /> },
  ];
  return (
    <Caixa
      titulo="Caixa Postal e-CAC"
      subtitulo="Caixa Postal da Receita: quantos clientes estão em cada situação. Um cliente conta uma vez, no mais grave."
      acao={<VerTudo to="/mensagens">Abrir mensagens</VerTudo>}
      className={className}
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ul className="space-y-3">
          {linhas.map((l) => (
            <li key={l.rotulo}>
              <Link to="/mensagens" title={l.dica} className="group grid grid-cols-[110px_24px_1fr_36px] items-center gap-2 rounded-sm hover:bg-bg-2">
                <span className="text-ui text-muted-ink group-hover:text-ink">{l.rotulo}</span>
                {l.icone}
                <span className="h-2.5 overflow-hidden rounded-pill bg-bg-3">
                  <span className="block h-full rounded-pill" style={{ width: `${r.total ? (l.valor / r.total) * 100 : 0}%`, background: COR_ESTADO[l.chave] }} />
                </span>
                <span className="text-right text-ui-strong text-ink">{l.valor}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="border-line md:border-l md:pl-6">
          <p className="mb-2 text-ui-strong text-ink">Em aberto, por tipo</p>
          <ul className="space-y-2">
            {r.porCategoria.map((c) => {
              const Icone = ICONE_CATEGORIA[c.chave] ?? Gavel;
              return (
                <li key={c.chave}>
                  <Link to="/mensagens?aba=intimacoes" className="flex items-center gap-3 rounded-sm hover:bg-bg-2">
                    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', c.clientes > 0 ? 'bg-warn-soft text-warn' : 'bg-bg-2 text-muted-ink-2')}><Icone className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1 truncate text-ui text-muted-ink">{c.rotulo}</span>
                    <span className="text-ui-strong text-ink">{c.clientes}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="space-y-2 border-t border-line pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-ui-strong text-ink">Últimas mensagens recebidas</p>
          <span className="text-meta text-muted-ink-2">só as já baixadas; dos demais clientes o sistema sabe apenas que há mensagem nova</span>
        </div>
        {carregandoUltimas ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : ultimas.length === 0 ? (
          <p className="py-6 text-center text-ui text-muted-ink-2">Nenhuma mensagem baixada ainda. Use Consultar na tela Caixa Postal e-CAC.</p>
        ) : (
          <ul className="divide-y divide-line-2">
            {ultimas.map((m) => {
              const cat = CATEGORIAS[m.categoria];
              const destino = `${cat.critica ? '/mensagens?aba=intimacoes&' : '/mensagens?'}q=${apenasDigitos(m.documento)}`;
              return (
                <li key={m.id}>
                  <Link to={destino} className="flex items-start gap-3 rounded-sm py-2.5 hover:bg-bg-2">
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-pill', m.lida ? 'bg-transparent' : 'bg-action')} aria-label={m.lida ? undefined : 'Não lida'} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-ui', m.lida ? 'text-muted-ink' : 'text-ink')} title={m.assunto}>{m.assunto}</span>
                      <span className="block truncate text-meta text-muted-ink-2">{m.nome}{m.data_envio ? ` · ${format(new Date(m.data_envio), 'dd/MM/yyyy')}` : ''}</span>
                    </span>
                    <DsBadge tone={cat.tone} dot={false} className="shrink-0">{cat.label}</DsBadge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Caixa>
  );
}
