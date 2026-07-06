import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCategories, Category } from '@/hooks/useCategories';


// Fixed DRE structure matching the PDF layout
export const DRE_STRUCTURE: DREStructureItem[] = [
  { type: 'section', name: 'Receitas Operacionais' },
  { type: 'calculated', key: 'receita_bruta', label: 'Receita Bruta' },
  { type: 'section', name: 'Deduções receita Bruta' },
  { type: 'calculated', key: 'receita_liquida', label: 'Receita Líquida' },
  { type: 'section', name: 'Custo com Pessoal' },
  { type: 'calculated', key: 'lucro_bruto', label: 'Lucro Bruto' },
  { type: 'section', name: 'Despesas Fixas' },
  { type: 'section', name: 'Despesas Variáveis' },
  { type: 'section', name: 'Despesas Imobilizados' },
  { type: 'section', name: 'Despesas Financeiras' },
  { type: 'section', name: '( + ) Receita Financeira' },
  { type: 'section', name: 'Despesas Tributárias' },
  { type: 'section', name: 'Depesas c/ Parcelamentos' },
  { type: 'section', name: 'Despesas c/ Terc. de Serviços' },
  { type: 'calculated', key: 'lucro_operacional', label: 'Lucro/Prejuízo Operacional' },
  { type: 'section', name: 'Despesas c/ Sócios' },
  { type: 'calculated', key: 'lucro_operacional_2', label: 'Lucro/Prejuízo Operacional (2)' },
  { type: 'section', name: 'Empréstimos Recebidos PF/PJ' },
  { type: 'section', name: 'Despesas Empréstimos' },
  { type: 'calculated', key: 'despesas_receitas_nao_op', label: 'Despesas/Receitas não Operacionais' },
  { type: 'section', name: 'Movimento Financeiro' },
  { type: 'calculated', key: 'lucro_liquido', label: 'Lucro/Prejuízo Líquido' },
  { type: 'calculated', key: 'fluxo_caixa', label: 'Fluxo de Caixa' },
];

export type DREStructureItem =
  | { type: 'section'; name: string }
  | { type: 'calculated'; key: string; label: string };

export interface DRESubRow {
  id: string;
  name: string;
  previsto: number;
  realizado: number;
  rxp: number;
  percPrevisto: number;
  percRealizado: number;
}

export interface DRESectionRow {
  type: 'section';
  macroName: string;
  macroId: string | null;
  previsto: number;
  realizado: number;
  rxp: number;
  percPrevisto: number;
  percRealizado: number;
  children: DRESubRow[];
}

export interface DRECalculatedRow {
  type: 'calculated';
  key: string;
  label: string;
  previsto: number;
  realizado: number;
  rxp: number;
  percPrevisto: number;
  percRealizado: number;
}

export type DRERowResult = DRESectionRow | DRECalculatedRow;

export interface DRESummary {
  receitaLiquida: { previsto: number; realizado: number };
  custoPessoal: { previsto: number; realizado: number };
  despesasOperacionais: { previsto: number; realizado: number };
  despesasReceitasNaoOp: { previsto: number; realizado: number };
  lucroPrejuizoLiquido: { previsto: number; realizado: number };
  fluxoCaixa: number;
}

// Paginated fetch to bypass PostgREST's 1000-row default limit.
// Uses iterative .range() with stable ordering by id.
async function fetchAllPaged<T>(
  buildQuery: () => any
): Promise<T[]> {
  const pageSize = 1000;
  let from = 0;
  const all: T[] = [];
  // Hard safety cap to avoid runaway loops
  for (let i = 0; i < 1000; i++) {
    const { data, error } = await buildQuery()
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data as T[]) || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export function useDREData(startDate: string, endDate: string) {
  const { categories } = useCategories();

  // Query for ALL paid transactions in period (for Fluxo de Caixa - no show_in_dre filter)
  const { data: allPaidTxns = [] } = useQuery({
    queryKey: ['dre-fluxo-caixa', startDate, endDate],
    queryFn: async () => {
      return await fetchAllPaged<{ paid_amount: number | null; amount: number; type: string }>(() =>
        supabase
          .from('transactions')
          .select('id, paid_amount, amount, type')
          .is('deleted_at', null)
          .eq('is_paid', true)
          .not('date', 'is', null)
          .gte('date', startDate)
          .lte('date', endDate)
      );
    },
    enabled: !!startDate && !!endDate,
  });

  const { data: previstoTxnsRaw = [] } = useQuery({
    queryKey: ['dre-previsto', startDate, endDate],
    queryFn: async () => {
      return await fetchAllPaged<{ category_id: string | null; amount: number; type: string; is_paid: boolean; date: string | null }>(() =>
        supabase
          .from('transactions')
          .select('id, category_id, amount, type, is_paid, date')
          .is('deleted_at', null)
          .not('expected_date', 'is', null)
          .gte('expected_date', startDate)
          .lte('expected_date', endDate)
      );
    },
    enabled: !!startDate && !!endDate,
  });

  // Nova regra do Previsto: se a transação está liquidada, a data de pagamento
  // também precisa estar dentro do período. Em aberto continua entrando normal.
  const previstoTxns = previstoTxnsRaw.filter(t =>
    !t.is_paid || (t.date && t.date >= startDate && t.date <= endDate)
  );

  const { data: realizadoTxns = [] } = useQuery({
    queryKey: ['dre-realizado', startDate, endDate],
    queryFn: async () => {
      return await fetchAllPaged<{ category_id: string | null; paid_amount: number | null; amount: number; type: string }>(() =>
        supabase
          .from('transactions')
          .select('id, category_id, paid_amount, amount, type')
          .is('deleted_at', null)
          .eq('is_paid', true)
          .not('date', 'is', null)
          .gte('date', startDate)
          .lte('date', endDate)
      );
    },
    enabled: !!startDate && !!endDate,
  });


  // Helper: find macro category by name (case-insensitive)
  // Only categories visible in DRE
  const dreCategories = categories.filter(c => c.show_in_dre !== false);

  const findMacro = (name: string): Category | undefined => {
    return dreCategories.find(
      c => !c.parent_id && c.name.toLowerCase().trim() === name.toLowerCase().trim()
    );
  };

  // Helper: get sub-events for a macro, sorted alphabetically
  const getSubEvents = (macroId: string): Category[] => {
    return dreCategories
      .filter(c => c.parent_id === macroId)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  };

  // Helper: sum previsto for a category_id
  const sumPrevisto = (catId: string): number => {
    return previstoTxns
      .filter(t => t.category_id === catId)
      .reduce((s, t) => s + Number(t.amount), 0);
  };

  // Helper: sum realizado for a category_id
  const sumRealizado = (catId: string): number => {
    return realizadoTxns
      .filter(t => t.category_id === catId)
      .reduce((s, t) => s + Number(t.paid_amount ?? t.amount), 0);
  };

  // Build section data for a macro name
  const buildSection = (macroName: string): { previsto: number; realizado: number; macroId: string | null; children: DRESubRow[] } => {
    const macro = findMacro(macroName);
    if (!macro) {
      return { previsto: 0, realizado: 0, macroId: null, children: [] };
    }

    const subs = getSubEvents(macro.id);
    
    if (subs.length === 0) {
      // Macro without children — acts as leaf
      const previsto = sumPrevisto(macro.id);
      const realizado = sumRealizado(macro.id);
      return { previsto, realizado, macroId: macro.id, children: [] };
    }

    const children: DRESubRow[] = subs.map(sub => {
      const previsto = sumPrevisto(sub.id);
      const realizado = sumRealizado(sub.id);
      return {
        id: sub.id,
        name: sub.name,
        previsto,
        realizado,
        rxp: realizado - previsto,
        percPrevisto: 0,
        percRealizado: 0,
      };
    });

    // Include transactions posted directly to the parent macro (not to any sub)
    const parentPrevisto = sumPrevisto(macro.id);
    const parentRealizado = sumRealizado(macro.id);
    if (parentPrevisto !== 0 || parentRealizado !== 0) {
      children.push({
        id: macro.id,
        name: `${macro.name} (direto)`,
        previsto: parentPrevisto,
        realizado: parentRealizado,
        rxp: parentRealizado - parentPrevisto,
        percPrevisto: 0,
        percRealizado: 0,
      });
    }

    const totalPrevisto = children.reduce((s, c) => s + c.previsto, 0);
    const totalRealizado = children.reduce((s, c) => s + c.realizado, 0);

    return { previsto: totalPrevisto, realizado: totalRealizado, macroId: macro.id, children };
  };

  // Build full DRE
  const buildDRE = (): { rows: DRERowResult[]; summary: DRESummary } => {
    // Accumulator for section totals (used by calculated rows)
    const sectionTotals: Record<string, { previsto: number; realizado: number }> = {};
    const calculatedTotals: Record<string, { previsto: number; realizado: number }> = {};

    // First pass: compute all section totals
    for (const item of DRE_STRUCTURE) {
      if (item.type === 'section') {
        const key = item.name.toLowerCase().trim();
        const data = buildSection(item.name);
        sectionTotals[key] = { previsto: data.previsto, realizado: data.realizado };
      }
    }

    // Helper to get section total
    const sec = (name: string) => sectionTotals[name.toLowerCase().trim()] || { previsto: 0, realizado: 0 };

    // Compute calculated rows
    const recOp = sec('Receitas Operacionais');
    calculatedTotals['receita_bruta'] = { previsto: recOp.previsto, realizado: recOp.realizado };

    const deducoes = sec('Deduções receita Bruta');
    calculatedTotals['receita_liquida'] = {
      previsto: calculatedTotals['receita_bruta'].previsto - Math.abs(deducoes.previsto),
      realizado: calculatedTotals['receita_bruta'].realizado - Math.abs(deducoes.realizado),
    };

    const custoPessoal = sec('Custo com Pessoal');
    calculatedTotals['lucro_bruto'] = {
      previsto: calculatedTotals['receita_liquida'].previsto - Math.abs(custoPessoal.previsto),
      realizado: calculatedTotals['receita_liquida'].realizado - Math.abs(custoPessoal.realizado),
    };

    // Sum all operational expenses (Despesas Fixas through Terc. de Serviços)
    const opExpenseNames = [
      'Despesas Fixas', 'Despesas Variáveis', 'Despesas Imobilizados',
      'Despesas Financeiras', 'Despesas Tributárias',
      'Depesas c/ Parcelamentos', 'Despesas c/ Terc. de Serviços',
    ];
    const totalOpExpenses = opExpenseNames.reduce(
      (acc, name) => {
        const s = sec(name);
        return { previsto: acc.previsto + Math.abs(s.previsto), realizado: acc.realizado + Math.abs(s.realizado) };
      },
      { previsto: 0, realizado: 0 }
    );

    const recFin = sec('( + ) Receita Financeira');

    calculatedTotals['lucro_operacional'] = {
      previsto: calculatedTotals['lucro_bruto'].previsto - totalOpExpenses.previsto + recFin.previsto,
      realizado: calculatedTotals['lucro_bruto'].realizado - totalOpExpenses.realizado + recFin.realizado,
    };

    const despSocios = sec('Despesas c/ Sócios');
    calculatedTotals['lucro_operacional_2'] = {
      previsto: calculatedTotals['lucro_operacional'].previsto - Math.abs(despSocios.previsto),
      realizado: calculatedTotals['lucro_operacional'].realizado - Math.abs(despSocios.realizado),
    };

    // Despesas/Receitas não Operacionais = Empréstimos Recebidos - Despesas Empréstimos
    const empRecebidos = sec('Empréstimos Recebidos PF/PJ');
    const despEmprestimos = sec('Despesas Empréstimos');
    calculatedTotals['despesas_receitas_nao_op'] = {
      previsto: empRecebidos.previsto - Math.abs(despEmprestimos.previsto),
      realizado: empRecebidos.realizado - Math.abs(despEmprestimos.realizado),
    };

    // Movimento Financeiro = Movimento Entrada - ABS(Movimento Saída) (net, not sum)
    const movFinSection = buildSection('Movimento Financeiro');
    const movEntrada = movFinSection.children.find(c => c.name.toLowerCase().includes('entrada'));
    const movSaida = movFinSection.children.find(c => c.name.toLowerCase().includes('saída') || c.name.toLowerCase().includes('saida'));
    const movimentoFinanceiro = {
      previsto: (movEntrada?.previsto ?? 0) - Math.abs(movSaida?.previsto ?? 0),
      realizado: (movEntrada?.realizado ?? 0) - Math.abs(movSaida?.realizado ?? 0),
    };
    calculatedTotals['movimento_financeiro'] = movimentoFinanceiro;
    // Override section total so second pass renders the net
    sectionTotals['movimento financeiro'] = movimentoFinanceiro;

    calculatedTotals['lucro_liquido'] = {
      previsto: calculatedTotals['lucro_operacional_2'].previsto + calculatedTotals['despesas_receitas_nao_op'].previsto + movimentoFinanceiro.previsto,
      realizado: calculatedTotals['lucro_operacional_2'].realizado + calculatedTotals['despesas_receitas_nao_op'].realizado + movimentoFinanceiro.realizado,
    };

    // Fluxo de Caixa = ALL inflows - ALL outflows in period (including non-DRE categories)
    const entradas = allPaidTxns
      .filter(t => t.type === 'receita')
      .reduce((s, t) => s + Math.abs(Number(t.paid_amount ?? t.amount)), 0);
    const saidas = allPaidTxns
      .filter(t => t.type === 'despesa')
      .reduce((s, t) => s + Math.abs(Number(t.paid_amount ?? t.amount)), 0);
    const fluxoCaixaTotal = entradas - saidas;
    calculatedTotals['fluxo_caixa'] = { previsto: fluxoCaixaTotal, realizado: fluxoCaixaTotal };

    // Receita Líquida for % calculations
    const rlPrevisto = calculatedTotals['receita_liquida'].previsto;
    const rlRealizado = calculatedTotals['receita_liquida'].realizado;

    const perc = (value: number, base: number) => base !== 0 ? (value / base) * 100 : 0;

    // Second pass: build rows with % columns
    const rows: DRERowResult[] = [];

    for (const item of DRE_STRUCTURE) {
      if (item.type === 'section') {
        const data = buildSection(item.name);
        // Use possibly-overridden section total (e.g. Movimento Financeiro is a net)
        const overridden = sec(item.name);
        const sectionPrevisto = overridden.previsto;
        const sectionRealizado = overridden.realizado;
        const rxp = sectionRealizado - sectionPrevisto;

        // Add % to children
        const childrenWithPerc = data.children.map(c => ({
          ...c,
          percPrevisto: perc(c.previsto, rlPrevisto),
          percRealizado: perc(c.realizado, rlRealizado),
        }));

        rows.push({
          type: 'section',
          macroName: item.name,
          macroId: data.macroId,
          previsto: sectionPrevisto,
          realizado: sectionRealizado,
          rxp,
          percPrevisto: perc(sectionPrevisto, rlPrevisto),
          percRealizado: perc(sectionRealizado, rlRealizado),
          children: childrenWithPerc,
        });
      } else {
        const ct = calculatedTotals[item.key] || { previsto: 0, realizado: 0 };
        const rxp = ct.realizado - ct.previsto;
        rows.push({
          type: 'calculated',
          key: item.key,
          label: item.label,
          previsto: ct.previsto,
          realizado: ct.realizado,
          rxp,
          percPrevisto: perc(ct.previsto, rlPrevisto),
          percRealizado: perc(ct.realizado, rlRealizado),
        });
      }
    }

    // Summary
    const summary: DRESummary = {
      receitaLiquida: calculatedTotals['receita_liquida'] || { previsto: 0, realizado: 0 },
      custoPessoal: { previsto: Math.abs(custoPessoal.previsto), realizado: Math.abs(custoPessoal.realizado) },
      despesasOperacionais: totalOpExpenses,
      despesasReceitasNaoOp: calculatedTotals['despesas_receitas_nao_op'] || { previsto: 0, realizado: 0 },
      lucroPrejuizoLiquido: calculatedTotals['lucro_liquido'] || { previsto: 0, realizado: 0 },
      fluxoCaixa: fluxoCaixaTotal,
    };

    return { rows, summary };
  };

  const result = buildDRE();

  return {
    dreRows: result.rows,
    summary: result.summary,
    isLoading: false,
  };
}
