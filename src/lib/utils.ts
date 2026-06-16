import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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

// Máscara para CNPJ: 00.000.000/0000-00
export function maskCNPJ(value: string): string {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .slice(0, 18);
}

// Máscara automática CPF ou CNPJ baseada no tamanho
export function maskCPFCNPJ(value: string): string {
  const numbers = value.replace(/\D/g, '');
  if (numbers.length <= 11) {
    return maskCPF(value);
  }
  return maskCNPJ(value);
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

// Máscara para telefone: (00) 00000-0000
export function maskPhone(value: string): string {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .slice(0, 15);
}
