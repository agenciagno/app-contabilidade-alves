// Motor de datas do calendário fiscal, compartilhado por `calculate-fiscal-calendar` (botão "Calcular Calendário")
// e `agenda-receita` (rotina da planilha oficial da Receita). Antes vivia só dentro de calculate-fiscal-calendar.
// Regras (`fiscal_obligations_catalog.due_rule`): day_N, bday_N, last_day_of_month (= last_business_day), ver calculateRawDueDate.
// Mês do calendário = mês do VENCIMENTO; a competência é o mês anterior.

export interface ObrigacaoCatalogo {
  id: string;
  name: string;
  code: string | null;
  frequency: string | null;
  due_rule: string | null;
  holiday_adjustment: string | null;
  internal_delivery_offset: number | null;
}

export interface RegistroCalendario {
  obligation_id: string;
  year: number;
  month: number;
  competence_year: number;
  competence_month: number;
  raw_due_date: string;
  adjusted_due_date: string;
  internal_delivery_date: string;
}

export function isNonBusinessDay(date: Date, holidays: Set<string>): boolean {
  const dow = date.getDay();
  const ds = date.toISOString().split("T")[0];
  return dow === 0 || dow === 6 || holidays.has(ds);
}

export function adjustDate(date: Date, adjustment: "advance" | "postpone", holidays: Set<string>): Date {
  const result = new Date(date);
  if (!isNonBusinessDay(result, holidays)) return result;
  const direction = adjustment === "advance" ? -1 : 1;
  while (isNonBusinessDay(result, holidays)) {
    result.setDate(result.getDate() + direction);
  }
  return result;
}

export function subtractBusinessDays(date: Date, days: number, holidays: Set<string>): Date {
  const result = new Date(date);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() - 1);
    if (!isNonBusinessDay(result, holidays)) remaining--;
  }
  return result;
}

export function getNthBusinessDay(startDate: Date, n: number, holidays: Set<string>): Date {
  const current = new Date(startDate);
  let count = 0;
  while (count < n) {
    if (!isNonBusinessDay(current, holidays)) count++;
    if (count < n) current.setDate(current.getDate() + 1);
  }
  return current;
}

export function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function calculateRawDueDate(
  rule: string,
  year: number,
  month: number,
): { rawDate: Date | null; base: Date | null; isBusinessDayRule: boolean; businessDayN: number } {
  switch (rule) {
    // Último dia do mês do vencimento; o ajuste de feriado/fim de semana (padrão "advance") o transforma no último dia útil.
    case "last_day_of_month":
    case "last_business_day":
      return { rawDate: new Date(year, month, 0), base: null, isBusinessDayRule: false, businessDayN: 0 };
    case "last_day_next_month_after_quarter": {
      const qEnds = [3, 6, 9, 12];
      if (!qEnds.includes(month)) return { rawDate: null, base: null, isBusinessDayRule: false, businessDayN: 0 };
      const nm = month === 12 ? 1 : month + 1;
      const ny = month === 12 ? year + 1 : year;
      return { rawDate: new Date(ny, nm, 0), base: null, isBusinessDayRule: false, businessDayN: 0 };
    }
    case "15th_business_day_next_month":
      return { rawDate: null, base: new Date(year, month, 1), isBusinessDayRule: true, businessDayN: 15 };
    case "15th_business_day_2nd_next_month":
      return { rawDate: null, base: new Date(year, month + 1, 1), isBusinessDayRule: true, businessDayN: 15 };
    case "day_15_2nd_next_month": {
      let m2 = month + 2;
      let y2 = year;
      if (m2 > 12) { m2 -= 12; y2++; }
      return { rawDate: new Date(y2, m2 - 1, 15), base: null, isBusinessDayRule: false, businessDayN: 0 };
    }
    case "last_business_day_march":
      return { rawDate: new Date(year, 2, 31), base: null, isBusinessDayRule: false, businessDayN: 0 };
    case "may_31":
      return { rawDate: new Date(year, 4, 31), base: null, isBusinessDayRule: false, businessDayN: 0 };
    case "last_business_day_july_next_year":
      return { rawDate: new Date(year + 1, 6, 31), base: null, isBusinessDayRule: false, businessDayN: 0 };
    default: {
      // day_N (ex.: day_20, day_25): dia fixo do mês do vencimento
      const dayMatch = rule.match(/^day_(\d+)$/);
      if (dayMatch) {
        const day = Math.min(parseInt(dayMatch[1]), new Date(year, month, 0).getDate());
        return { rawDate: new Date(year, month - 1, day), base: null, isBusinessDayRule: false, businessDayN: 0 };
      }
      // bday_N: N-ésimo dia útil do mês do vencimento
      const bdayMatch = rule.match(/^bday_(\d+)$/);
      if (bdayMatch) {
        const n = parseInt(bdayMatch[1], 10);
        return { rawDate: null, base: new Date(year, month - 1, 1), isBusinessDayRule: true, businessDayN: n };
      }
      return { rawDate: null, base: null, isBusinessDayRule: false, businessDayN: 0 };
    }
  }
}

/** Entrega interna = vencimento menos N dias úteis (N = `internal_delivery_offset` da obrigação, padrão 2). */
export function entregaInterna(vencimento: Date, obl: ObrigacaoCatalogo, holidays: Set<string>): Date {
  const offset = typeof obl.internal_delivery_offset === "number" ? obl.internal_delivery_offset : 2;
  return subtractBusinessDays(vencimento, offset, holidays);
}

export function competenciaDe(year: number, month: number) {
  return { competence_month: month === 1 ? 12 : month - 1, competence_year: month === 1 ? year - 1 : year };
}

/** Calcula, pelas regras do catálogo, as linhas do calendário de (year, month). O que não tiver regra aplicável vai em `skipped`. */
export function calcularRegistros(
  obrigacoes: ObrigacaoCatalogo[],
  holidays: Set<string>,
  year: number,
  month: number,
  includeAnnual: boolean,
): { records: RegistroCalendario[]; skipped: string[] } {
  const records: RegistroCalendario[] = [];
  const skipped: string[] = [];
  for (const obl of obrigacoes) {
    const nome = obl.code ?? obl.name;
    if (obl.frequency === "annual" && !includeAnnual) { skipped.push(`${nome} (annual, skipped)`); continue; }
    if (obl.frequency === "quarterly" && ![3, 6, 9, 12].includes(month)) { skipped.push(`${nome} (quarterly, not quarter-end)`); continue; }

    const { rawDate, base, isBusinessDayRule, businessDayN } = calculateRawDueDate(obl.due_rule ?? "", year, month);
    if (!rawDate && !base) { skipped.push(`${nome} (no rule)`); continue; }

    let adjusted: Date;
    let raw: Date;
    if (isBusinessDayRule && base) {
      adjusted = getNthBusinessDay(base, businessDayN, holidays);
      raw = adjusted;
    } else if (rawDate) {
      raw = rawDate;
      // Todas as obrigações antecipam por padrão (holiday_adjustment 'postpone' é a exceção).
      adjusted = adjustDate(rawDate, obl.holiday_adjustment === "postpone" ? "postpone" : "advance", holidays);
    } else { skipped.push(`${nome} (calc failed)`); continue; }

    records.push({
      obligation_id: obl.id,
      year,
      month,
      ...competenciaDe(year, month),
      raw_due_date: toDateStr(raw),
      adjusted_due_date: toDateStr(adjusted),
      internal_delivery_date: toDateStr(entregaInterna(adjusted, obl, holidays)),
    });
  }
  return { records, skipped };
}

/** Feriados nacionais do intervalo que cobre o mês e os seguintes, como conjunto de datas ISO. */
export async function carregarFeriados(supabase: any, year: number, month: number): Promise<Set<string>> {
  const rangeStart = toDateStr(new Date(year, month - 1, 1));
  const rangeEnd = toDateStr(new Date(year + 1, month + 1, 31));
  const { data, error } = await supabase.from("national_holidays").select("date").gte("date", rangeStart).lte("date", rangeEnd);
  if (error) throw error;
  return new Set((data || []).map((h: { date: string }) => h.date));
}
