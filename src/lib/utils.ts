import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * A rampa tipográfica do Design System usa nomes próprios (text-body, text-ui-strong,
 * text-kicker…). O tailwind-merge não os conhece, classifica como cor de texto e os
 * descarta sempre que houver um text-<cor> na mesma lista — apagando o tamanho e o peso
 * em silêncio. Registrar os nomes no grupo font-size resolve, e de quebra faz o merge
 * funcionar de verdade entre dois tamanhos.
 */
const TYPE_SCALE = [
  "display", "metric-xl", "h2-hero", "h3-section", "h4-card",
  "body", "body-sm", "nav", "ui", "ui-strong", "link",
  "mono-sm", "meta", "kicker", "badge",
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...TYPE_SCALE] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Formata número para moeda brasileira (1234.56 → "1.234,56")
export function formatCurrencyInput(value: string): string {
  const numbers = value.replace(/\D/g, '');
  const cents = parseInt(numbers || '0', 10);
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Converte string formatada para número ("1.234,56" → 1234.56)
export function parseCurrencyInput(value: string): number {
  const cleaned = value.replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

// Máscara para CPF: 000.000.000-00
export function maskCPF(value: string): string {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .slice(0, 14);
}

// Máscara para CNPJ: AA.AAA.AAA/AAAA-00 (12 primeiras posições alfanuméricas, DV sempre numérico —
// CNPJ alfanumérico da Receita Federal, IN RFB 2.229/2024, novas inscrições a partir de 31/07/2026)
export function maskCNPJ(value: string): string {
  const clean = value.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 14);
  return clean
    .replace(/^([0-9A-Z]{2})([0-9A-Z])/, '$1.$2')
    .replace(/^([0-9A-Z]{2})\.([0-9A-Z]{3})([0-9A-Z])/, '$1.$2.$3')
    .replace(/\.([0-9A-Z]{3})([0-9A-Z])/, '.$1/$2')
    .replace(/([0-9A-Z]{4})([0-9A-Z])/, '$1-$2');
}

// Máscara automática CPF ou CNPJ baseada no conteúdo. CPF nunca tem letra (só o CNPJ ficou
// alfanumérico) — se aparecer qualquer letra, força tratamento como CNPJ mesmo com poucos caracteres.
export function maskCPFCNPJ(value: string): string {
  const clean = value.replace(/[^0-9A-Za-z]/g, '');
  const hasLetter = /[A-Za-z]/.test(clean);
  if (!hasLetter && clean.length <= 11) {
    return maskCPF(value);
  }
  return maskCNPJ(value);
}

// Tipo de documento a partir do tamanho (ignora pontuação): CPF = 11, CNPJ = 14 (alfanumérico ou não)
export function getDocumentType(document: string | null | undefined): 'CPF' | 'CNPJ' | null {
  const clean = (document || '').replace(/[^0-9A-Za-z]/g, '');
  if (clean.length === 11) return 'CPF';
  if (clean.length === 14) return 'CNPJ';
  return null;
}

// Valida data no formato YYYY-MM-DD com dia 01-31, mês 01-12, ano 4 dígitos
export function isValidDateString(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, yearStr, monthStr, dayStr] = match;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  // Validate actual date
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

// Máscara adaptiva para telefone: fixo (XX) XXXX-XXXX (10 dígitos) ou celular (XX) XXXXX-XXXX (11 dígitos)
export function maskPhone(value: string): string {
  const d = (value || '').replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// Retorna apenas os dígitos do telefone (para persistência)
export function unmaskPhone(value: string): string {
  return (value || '').replace(/\D/g, '');
}

// Máscara de CPF: XXX.XXX.XXX-XX
export function maskCpf(value: string): string {
  const d = (value || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

