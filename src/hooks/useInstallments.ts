import { TransactionInsert } from '@/hooks/useTransactions';
import { format } from 'date-fns';

/**
 * Adds N months to a date, preserving the day. If the target month
 * doesn't have that day (e.g. Jan 31 + 1 month), uses last day of target month.
 */
function addMonthsPreserveDay(base: Date, months: number): Date {
  const targetYear = base.getFullYear() + Math.floor((base.getMonth() + months) / 12);
  const targetMonth = (base.getMonth() + months) % 12;
  const baseDay = base.getDate();
  const lastDayOfTarget = new Date(targetYear, targetMonth + 1, 0).getDate();
  const day = Math.min(baseDay, lastDayOfTarget);
  return new Date(targetYear, targetMonth, day);
}

function shiftDate(dateStr: string | null | undefined, months: number): string | null | undefined {
  if (!dateStr) return dateStr;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const shifted = addMonthsPreserveDay(d, months);
  return format(shifted, 'yyyy-MM-dd');
}

/**
 * Gera as ocorrências de um lançamento recorrente/parcelado.
 *
 * Regra (confirmada por Gabriel em 29/07/2026): lançar recorrente significa que a
 * PRIMEIRA parcela já aconteceu — ela mantém o estado que veio do formulário (liquidada,
 * se foi lançada como "À Vista") e as seguintes nascem EM ABERTO, com vencimento e data
 * prevista deslocados mês a mês.
 *
 * O valor é repetido integralmente em cada ocorrência (é recorrência, não divisão de um
 * total). Antes, o estado de pagamento também era copiado para todas: um lançamento
 * "À Vista" em 12x criava 12 transações já marcadas como pagas, com data de pagamento no
 * futuro — inflava o realizado em 12x e produzia linhas pagas com data futura, que ficavam
 * fora do saldo do banco e dentro dos KPIs.
 */
export function generateInstallments(
  basePayload: TransactionInsert,
  count: number
): TransactionInsert[] {
  const installments: TransactionInsert[] = [];
  // "À Vista" não pede Data Prevista no formulário, então ela chega vazia. Sem esse
  // fallback, as parcelas futuras ficariam invisíveis nas telas que se apoiam nela.
  const baseExpected = basePayload.expected_date || basePayload.due_date;
  for (let i = 0; i < count; i++) {
    const isFirst = i === 0;
    installments.push({
      ...basePayload,
      due_date: shiftDate(basePayload.due_date, i) as string | null,
      expected_date: shiftDate(baseExpected, i) as string | null,
      // Só a primeira herda a liquidação; as próximas ainda vão acontecer.
      is_paid: isFirst ? basePayload.is_paid : false,
      paid_amount: isFirst ? basePayload.paid_amount : null,
      date: isFirst ? basePayload.date : null,
    });
  }
  return installments;
}

export interface InstallmentSummary {
  count: number;
  firstDate: string;
  lastDate: string;
}

export function calculateSummary(
  dueDateStr: string,
  mode: 'parcelas' | 'data_final',
  value: number | string // installmentCount or endDate string
): InstallmentSummary | null {
  if (!dueDateStr) return null;
  const base = new Date(dueDateStr + 'T00:00:00');
  if (isNaN(base.getTime())) return null;

  if (mode === 'parcelas') {
    const count = typeof value === 'number' ? value : parseInt(value as string, 10);
    if (!count || count < 2) return null;
    const last = addMonthsPreserveDay(base, count - 1);
    return {
      count,
      firstDate: format(base, 'dd/MM/yyyy'),
      lastDate: format(last, 'dd/MM/yyyy'),
    };
  }

  // data_final mode
  const endStr = value as string;
  if (!endStr) return null;
  const end = new Date(endStr + 'T00:00:00');
  if (isNaN(end.getTime())) return null;

  // Calculate months between base and end (inclusive)
  const monthsDiff =
    (end.getFullYear() - base.getFullYear()) * 12 +
    (end.getMonth() - base.getMonth());

  if (monthsDiff < 1) return null;
  const count = monthsDiff + 1; // include base month
  const last = addMonthsPreserveDay(base, count - 1);
  return {
    count,
    firstDate: format(base, 'dd/MM/yyyy'),
    lastDate: format(last, 'dd/MM/yyyy'),
  };
}
