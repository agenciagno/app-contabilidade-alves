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

export function generateInstallments(
  basePayload: TransactionInsert,
  count: number
): TransactionInsert[] {
  const installments: TransactionInsert[] = [];
  for (let i = 0; i < count; i++) {
    installments.push({
      ...basePayload,
      due_date: shiftDate(basePayload.due_date, i) as string | null,
      expected_date: shiftDate(basePayload.expected_date, i) as string | null,
      date: i === 0 ? basePayload.date : (basePayload.date ? shiftDate(basePayload.date, i) as string : undefined),
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
