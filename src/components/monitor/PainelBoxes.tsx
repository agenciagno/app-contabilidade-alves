/**
 * Boxes do Dashboard Fiscal (09/10/2026, desenho do print de referência do MonitorHub): Limite do Simples, Declarações,
 * Caixa Postal e Parcelamentos. Em 11/10/2026 saíram Ausências e Relatórios Fiscais (a Declarações ficou com uma caixa só).
 * Só mostram números já calculados (`src/lib/painelFiscal.ts` e o painel de processos da própria página).
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import {
  AlertTriangle, ArrowRight, CalendarX, CheckCircle2, Gavel, FileWarning, MinusCircle, Receipt, Scale, UserX,
} from 'lucide-react';
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';

import { DsBadge } from '@/components/ds';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COR_ESTADO, ESTADOS, ROTULO_ESTADO, type ContagemEstados, type EstadoMonitor } from '@/lib/monitorEstados';
import {
  maioresLimites, type ResumoMensagens, type ResumoParcelamentos, type TipoLimite,
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
      subtitulo={`Maiores clientes do Simples por ${tipo === 'rbt12' ? 'RBT12 (12 meses)' : 'RBA (ano)'}, contra o sublimite e o limite.`}
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
          Nenhum faturamento lido ainda. A leitura roda no dia 30 ou em "Ler faturamento", na ficha do Simples.
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
        <span>{lidos} de {total} clientes com faturamento lido.</span>
        <VerTudo to={SIMPLES}>Simples Nacional | MEI</VerTudo>
      </div>
    </Caixa>
  );
}

// ---------------------------------------------------------------- Declarações (11/10/2026)
/** Uma obrigação do painel: a contagem é a mesma da barra de "Por Processo" e da lista que abre ao clicar. */
export interface LinhaDeclaracao {
  chave: string;
  titulo: string;
  /** Nota curta ao lado do título (ex.: "Prazo 20/10"). */
  nota?: string;
  to: string;
  contagem: ContagemEstados;
  /** DCTFWeb | MIT: sem declaração não prova atraso (só existe com movimento), então a pendência é "a confirmar". */
  aConfirmar?: boolean;
}

const ROTULO_DECLARACAO: Record<EstadoMonitor, string> = {
  em_dia: 'em dia', pendencia: 'no prazo', atencao: 'em falta', nao_verificado: 'sem consulta', processando: 'consultando',
};

/** Declarações do Simples e do Presumido/Real numa caixa só: cada número abre a tela já filtrada na situação. */
export function DeclaracoesBox({ linhas, subtitulo, className }: { linhas: LinhaDeclaracao[]; subtitulo?: string; className?: string }) {
  const estados = ESTADOS.filter((e) => e !== 'processando');
  return (
    <Caixa className={className} titulo="Declarações" subtitulo={subtitulo}>
      <div className="space-y-5">
        {linhas.map((d) => {
          const total = d.contagem.total;
          return (
            <div key={d.chave} className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <Link to={d.to} className="text-ui-strong text-ink hover:text-action">{d.titulo}</Link>
                {d.nota && <span className="text-meta text-muted-ink-2">{d.nota}</span>}
              </div>
              {total === 0 ? (
                <p className="text-meta text-muted-ink-2">Nenhum cliente.</p>
              ) : (
                <>
                  <div className="flex h-2.5 overflow-hidden rounded-pill bg-bg-3" aria-hidden>
                    {estados.map((e) => d.contagem[e] > 0 && (
                      <span key={e} className="h-full border-r border-paper last:border-r-0" style={{ width: `${(d.contagem[e] / total) * 100}%`, background: COR_ESTADO[e] }} />
                    ))}
                  </div>
                  <ul className="flex flex-wrap gap-x-4 gap-y-1">
                    {estados.map((e) => d.contagem[e] > 0 && (
                      <li key={e}>
                        <Link to={`${d.to}${d.to.includes('?') ? '&' : '?'}estado=${e}`} className="flex items-center gap-1.5 text-ui text-muted-ink hover:text-ink">
                          <span className="h-2 w-2 shrink-0 rounded-pill" style={{ background: COR_ESTADO[e] }} aria-hidden />
                          <span className="text-ui-strong text-ink">{d.contagem[e]}</span>
                          {e === 'pendencia' && d.aConfirmar ? 'a confirmar' : ROTULO_DECLARACAO[e]}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
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
      subtitulo="Clientes por situação. Cada um conta uma vez, no mais grave."
      acao={<VerTudo to="/mensagens">Abrir</VerTudo>}
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
          <span className="text-meta text-muted-ink-2">só as já baixadas</span>
        </div>
        {carregandoUltimas ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : ultimas.length === 0 ? (
          <p className="py-6 text-center text-ui text-muted-ink-2">Nenhuma mensagem baixada ainda.</p>
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

// ---------------------------------------------------------------- Parcelamentos (09/10/2026)
const PARCELAMENTOS = '/dashboard-federal/parcelamentos';
const ROTULO_PARC: Record<EstadoMonitor, string> = {
  atencao: 'Parcela em atraso', pendencia: 'Parcela do mês em aberto', em_dia: 'Em dia ou sem parcelamento', processando: 'Consultando', nao_verificado: 'Não consultados',
};

export function ParcelamentosBox({ r, carregando, className }: { r: ResumoParcelamentos; carregando?: boolean; className?: string }) {
  const estados = ESTADOS.filter((e) => e !== 'processando');
  return (
    <Caixa
      titulo="Parcelamentos"
      subtitulo="Clientes com parcela em atraso ou do mês em aberto."
      acao={<VerTudo to={PARCELAMENTOS}>Abrir</VerTudo>}
      className={className}
    >
      {carregando ? <Skeleton className="h-[140px] w-full" /> : (
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ul className="space-y-3">
            {estados.map((e) => (
              <li key={e}>
                <Link to={`${PARCELAMENTOS}?estado=${e}`} title={ROTULO_ESTADO[e]} className="group grid grid-cols-[150px_1fr_36px] items-center gap-2 rounded-sm hover:bg-bg-2">
                  <span className="text-ui text-muted-ink group-hover:text-ink">{ROTULO_PARC[e]}</span>
                  <span className="h-2.5 overflow-hidden rounded-pill bg-bg-3">
                    <span className="block h-full rounded-pill" style={{ width: `${r.contagem.total ? (r.contagem[e] / r.contagem.total) * 100 : 0}%`, background: COR_ESTADO[e] }} />
                  </span>
                  <span className="text-right text-ui-strong text-ink">{r.contagem[e]}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-line p-3">
              <p className="text-kicker uppercase text-muted-ink">Com parcelamento</p>
              <p className="text-metric-xl text-ink">{r.comAtivo}</p>
            </div>
            <div className="rounded-md border border-line p-3">
              <p className="text-kicker uppercase text-muted-ink">Em atraso</p>
              <p className={cn('text-ui-strong', r.valorAtrasado > 0 ? 'text-danger' : 'text-ink')}>{moeda(r.valorAtrasado)}</p>
            </div>
            <div className="col-span-2 rounded-md border border-line p-3">
              <p className="text-kicker uppercase text-muted-ink">Parcelas do mês</p>
              <p className="text-ui-strong text-ink">{moeda(r.valorDoMes)}</p>
              {r.naoConsultados > 0 && <p className="text-meta text-muted-ink-2">{r.naoConsultados} clientes ainda não consultados</p>}
            </div>
          </div>
        </div>
      )}
    </Caixa>
  );
}
