/**
 * Relatórios do Financeiro do cliente externo (aba Relatórios, 07/10/2026).
 *
 * Só cálculo, sem React nem Supabase: recebe os lançamentos já carregados
 * (useTransactions, sem transferências e sem banco invisível) e devolve as linhas
 * prontas para a tela e para exportar. Datas são strings 'yyyy-MM-dd' e a
 * comparação é por texto — mesmo padrão do resto do Financeiro.
 *
 * Regras comuns:
 * - Pago = isEffectivelyPaid (pago + data de pagamento + valor pago); vale o valor pago.
 * - Em aberto vale o valor do lançamento; "vencido" é em aberto com vencimento antes de hoje.
 * - Categoria agrupa pelo macro: subevento soma no macro e aparece aberto embaixo dele.
 */
import { isEffectivelyPaid } from '@/lib/financial-utils';
import { getTransactionCounterpartyName } from '@/lib/contact-display';
import type { Transaction } from '@/hooks/useTransactions';

export interface CategoriaBase {
  id: string;
  name: string;
  type: 'receita' | 'despesa';
  parent_id: string | null;
}

export const SEM_CATEGORIA = 'Sem categoria';
export const SEM_CONTRAPARTE = 'Sem cliente/fornecedor';

export const estaPago = (t: Transaction) => isEffectivelyPaid(t);
export const valorPago = (t: Transaction) => Number(t.paid_amount ?? t.amount ?? 0);
export const valorAberto = (t: Transaction) => Number(t.amount ?? 0);
/** Data que posiciona um lançamento no tempo quando o critério é vencimento. */
export const dataVencimento = (t: Transaction) => t.due_date || t.expected_date || t.issue_date || null;

const noPeriodo = (d: string | null | undefined, inicio: string, fim: string) =>
  !!d && (!inicio || d >= inicio) && (!fim || d <= fim);

export const nomeContraparte = (t: Transaction) => getTransactionCounterpartyName(t) || SEM_CONTRAPARTE;

/** Chave da contraparte (contato na CA, party no cliente externo). */
const idContraparte = (t: Transaction) => t.contact_id ?? t.party_id ?? '__sem__';

/** Macro e sub de um lançamento. Sem categoria vira um macro "Sem categoria". */
export function categoriaDe(t: Transaction, porId: Map<string, CategoriaBase>) {
  const cat = t.category_id ? porId.get(t.category_id) : undefined;
  if (!cat) return { macroId: '__sem__', macroNome: t.category?.name || SEM_CATEGORIA, subId: null as string | null, subNome: null as string | null };
  const pai = cat.parent_id ? porId.get(cat.parent_id) : undefined;
  if (pai) return { macroId: pai.id, macroNome: pai.name, subId: cat.id, subNome: cat.name };
  return { macroId: cat.id, macroNome: cat.name, subId: null, subNome: null };
}

/** "Macro › Sub" para listas e exportação. */
export function rotuloCategoria(t: Transaction, porId: Map<string, CategoriaBase>) {
  const c = categoriaDe(t, porId);
  return c.subNome ? `${c.macroNome} › ${c.subNome}` : c.macroNome;
}

export const mapaCategorias = (cats: CategoriaBase[]) => new Map(cats.map((c) => [c.id, c]));

// ─── 1 e 2. Pagamentos / Recebimentos ────────────────────────────────

export interface LinhaMovimento {
  id: string;
  data: string;
  contraparte: string;
  categoria: string;
  conta: string;
  historico: string;
  valor: number;
}

export function relMovimentos(
  txs: Transaction[], tipo: 'receita' | 'despesa', inicio: string, fim: string, porId: Map<string, CategoriaBase>,
): { linhas: LinhaMovimento[]; total: number } {
  const linhas = txs
    .filter((t) => t.type === tipo && estaPago(t) && noPeriodo(t.date, inicio, fim))
    .map((t) => ({
      id: t.id,
      data: t.date as string,
      contraparte: nomeContraparte(t),
      categoria: rotuloCategoria(t, porId),
      conta: t.bank?.name || '—',
      historico: t.notes || '',
      valor: valorPago(t),
    }))
    .sort((a, b) => a.data.localeCompare(b.data) || a.contraparte.localeCompare(b.contraparte));
  return { linhas, total: linhas.reduce((s, l) => s + l.valor, 0) };
}

// ─── 3. Inadimplentes ────────────────────────────────────────────────

export interface TituloVencido {
  id: string;
  vencimento: string;
  categoria: string;
  historico: string;
  valor: number;
  diasAtraso: number;
}
export interface LinhaInadimplente {
  chave: string;
  cliente: string;
  total: number;
  maisAntigo: string;
  maiorAtraso: number;
  titulos: TituloVencido[];
}

const diasEntre = (de: string, ate: string) =>
  Math.round((new Date(`${ate}T12:00:00`).getTime() - new Date(`${de}T12:00:00`).getTime()) / 86_400_000);

export function relInadimplentes(txs: Transaction[], hoje: string, porId: Map<string, CategoriaBase>) {
  const grupos = new Map<string, LinhaInadimplente>();
  for (const t of txs) {
    if (t.type !== 'receita' || estaPago(t) || !t.due_date || t.due_date >= hoje) continue;
    const chave = idContraparte(t);
    const g = grupos.get(chave) ?? { chave, cliente: nomeContraparte(t), total: 0, maisAntigo: t.due_date, maiorAtraso: 0, titulos: [] };
    const dias = diasEntre(t.due_date, hoje);
    g.titulos.push({ id: t.id, vencimento: t.due_date, categoria: rotuloCategoria(t, porId), historico: t.notes || '', valor: valorAberto(t), diasAtraso: dias });
    g.total += valorAberto(t);
    if (t.due_date < g.maisAntigo) g.maisAntigo = t.due_date;
    g.maiorAtraso = Math.max(g.maiorAtraso, dias);
    grupos.set(chave, g);
  }
  const linhas = [...grupos.values()]
    .map((g) => ({ ...g, titulos: g.titulos.sort((a, b) => a.vencimento.localeCompare(b.vencimento)) }))
    .sort((a, b) => b.maiorAtraso - a.maiorAtraso || b.total - a.total);
  return {
    linhas,
    total: linhas.reduce((s, l) => s + l.total, 0),
    titulos: linhas.reduce((s, l) => s + l.titulos.length, 0),
  };
}

// ─── 4 e 5. Posição (a vencer / vencido / pago) por categoria e por contraparte ───

export interface Posicao { aVencer: number; vencido: number; pago: number; total: number }
const posicaoZero = (): Posicao => ({ aVencer: 0, vencido: 0, pago: 0, total: 0 });

function somarPosicao(p: Posicao, t: Transaction, hoje: string) {
  if (estaPago(t)) p.pago += valorPago(t);
  else if (t.due_date && t.due_date < hoje) p.vencido += valorAberto(t);
  else p.aVencer += valorAberto(t);
  p.total = p.aVencer + p.vencido + p.pago;
}

export interface LinhaCategoria extends Posicao {
  id: string;
  nome: string;
  subs: (Posicao & { id: string; nome: string })[];
}

/** Lançamentos com vencimento no período, agrupados por macro (subeventos dentro). */
export function relPorCategoria(
  txs: Transaction[], tipo: 'receita' | 'despesa', inicio: string, fim: string, hoje: string, porId: Map<string, CategoriaBase>,
) {
  const macros = new Map<string, LinhaCategoria>();
  const subs = new Map<string, Posicao & { id: string; nome: string }>();
  const total = posicaoZero();
  for (const t of txs) {
    if (t.type !== tipo || !noPeriodo(dataVencimento(t), inicio, fim)) continue;
    const c = categoriaDe(t, porId);
    const m = macros.get(c.macroId) ?? { id: c.macroId, nome: c.macroNome, subs: [], ...posicaoZero() };
    somarPosicao(m, t, hoje);
    macros.set(c.macroId, m);
    if (c.subId) {
      const chave = `${c.macroId}/${c.subId}`;
      let s = subs.get(chave);
      if (!s) { s = { id: c.subId, nome: c.subNome as string, ...posicaoZero() }; subs.set(chave, s); m.subs.push(s); }
      somarPosicao(s, t, hoje);
    }
    somarPosicao(total, t, hoje);
  }
  const linhas = [...macros.values()]
    .map((m) => ({ ...m, subs: [...m.subs].sort((a, b) => b.total - a.total) }))
    .sort((a, b) => b.total - a.total);
  return { linhas, total };
}

export interface LinhaContraparte extends Posicao { chave: string; nome: string }

/** Lançamentos com vencimento no período, por cliente (receitas) ou fornecedor (despesas). */
export function relPorContraparte(txs: Transaction[], tipo: 'receita' | 'despesa', inicio: string, fim: string, hoje: string) {
  const grupos = new Map<string, LinhaContraparte>();
  const total = posicaoZero();
  for (const t of txs) {
    if (t.type !== tipo || !noPeriodo(dataVencimento(t), inicio, fim)) continue;
    const chave = idContraparte(t);
    const g = grupos.get(chave) ?? { chave, nome: nomeContraparte(t), ...posicaoZero() };
    somarPosicao(g, t, hoje);
    grupos.set(chave, g);
    somarPosicao(total, t, hoje);
  }
  return { linhas: [...grupos.values()].sort((a, b) => b.total - a.total), total };
}

// ─── 6. DRE simplificada ─────────────────────────────────────────────

export type BaseDre = 'realizado' | 'previsto';

export interface LinhaDre {
  id: string;
  nome: string;
  nivel: 'macro' | 'sub';
  meses: number[];
  total: number;
}
export interface BlocoDre { meses: number[]; total: number; linhas: LinhaDre[] }

/** Meses 'yyyy-MM' entre duas datas, inclusive. */
export function mesesDoPeriodo(inicio: string, fim: string): string[] {
  const out: string[] = [];
  let [y, m] = inicio.slice(0, 7).split('-').map(Number);
  const [yf, mf] = fim.slice(0, 7).split('-').map(Number);
  while (y < yf || (y === yf && m <= mf)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/**
 * Realizado: só o que foi pago/recebido, pela data de pagamento e pelo valor pago.
 * Previsto: tudo que vence no período (pago ou não), pelo vencimento e pelo valor do lançamento.
 */
export function relDre(txs: Transaction[], inicio: string, fim: string, base: BaseDre, porId: Map<string, CategoriaBase>) {
  const meses = mesesDoPeriodo(inicio, fim);
  const idx = new Map(meses.map((k, i) => [k, i]));

  const montar = (tipo: 'receita' | 'despesa'): BlocoDre => {
    const bloco: BlocoDre = { meses: meses.map(() => 0), total: 0, linhas: [] };
    const macros = new Map<string, LinhaDre & { subs: Map<string, LinhaDre> }>();
    for (const t of txs) {
      if (t.type !== tipo) continue;
      const data = base === 'realizado' ? (estaPago(t) ? t.date : null) : dataVencimento(t);
      if (!noPeriodo(data, inicio, fim)) continue;
      const i = idx.get((data as string).slice(0, 7));
      if (i === undefined) continue;
      const valor = base === 'realizado' ? valorPago(t) : valorAberto(t);
      const c = categoriaDe(t, porId);
      const m = macros.get(c.macroId) ?? { id: c.macroId, nome: c.macroNome, nivel: 'macro' as const, meses: meses.map(() => 0), total: 0, subs: new Map() };
      m.meses[i] += valor; m.total += valor;
      if (c.subId) {
        const s = m.subs.get(c.subId) ?? { id: c.subId, nome: c.subNome as string, nivel: 'sub' as const, meses: meses.map(() => 0), total: 0 };
        s.meses[i] += valor; s.total += valor;
        m.subs.set(c.subId, s);
      }
      macros.set(c.macroId, m);
      bloco.meses[i] += valor; bloco.total += valor;
    }
    for (const m of [...macros.values()].sort((a, b) => b.total - a.total)) {
      const { subs, ...macro } = m;
      bloco.linhas.push(macro);
      bloco.linhas.push(...[...subs.values()].sort((a, b) => b.total - a.total));
    }
    return bloco;
  };

  const receitas = montar('receita');
  const despesas = montar('despesa');
  const resultado = {
    meses: meses.map((_, i) => receitas.meses[i] - despesas.meses[i]),
    total: receitas.total - despesas.total,
  };
  return { meses, receitas, despesas, resultado };
}
