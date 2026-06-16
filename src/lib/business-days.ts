import { format } from 'date-fns';

/**
 * Calcula a data da Páscoa usando o algoritmo de Meeus/Jones/Butcher
 */
function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Retorna lista de feriados nacionais brasileiros para um dado ano
 */
function getBrazilianHolidays(year: number): Set<string> {
  const holidays = new Set<string>();
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

  // Feriados fixos
  holidays.add(`${year}-01-01`); // Ano Novo
  holidays.add(`${year}-04-21`); // Tiradentes
  holidays.add(`${year}-05-01`); // Dia do Trabalho
  holidays.add(`${year}-09-07`); // Independência
  holidays.add(`${year}-10-12`); // N.S. Aparecida
  holidays.add(`${year}-11-02`); // Finados
  holidays.add(`${year}-11-15`); // Proclamação da República
  holidays.add(`${year}-12-25`); // Natal

  // Feriados móveis baseados na Páscoa
  const easter = getEasterDate(year);

  // Carnaval: 47 dias antes da Páscoa (segunda e terça)
  const carnivalTue = new Date(easter);
  carnivalTue.setDate(easter.getDate() - 47);
  const carnivalMon = new Date(carnivalTue);
  carnivalMon.setDate(carnivalTue.getDate() - 1);
  holidays.add(fmt(carnivalMon));
  holidays.add(fmt(carnivalTue));

  // Sexta-feira Santa: 2 dias antes da Páscoa
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  holidays.add(fmt(goodFriday));

  // Corpus Christi: 60 dias após a Páscoa
  const corpusChristi = new Date(easter);
  corpusChristi.setDate(easter.getDate() + 60);
  holidays.add(fmt(corpusChristi));

  return holidays;
}

const holidayCache = new Map<number, Set<string>>();

function getHolidays(year: number): Set<string> {
  if (!holidayCache.has(year)) {
    holidayCache.set(year, getBrazilianHolidays(year));
  }
  return holidayCache.get(year)!;
}

export function isBrazilianHoliday(date: Date): boolean {
  const key = format(date, 'yyyy-MM-dd');
  return getHolidays(date.getFullYear()).has(key);
}

export function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  return !isBrazilianHoliday(date);
}

/**
 * Adiciona N dias úteis a uma data
 */
export function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    if (isBusinessDay(result)) added++;
  }
  return result;
}
