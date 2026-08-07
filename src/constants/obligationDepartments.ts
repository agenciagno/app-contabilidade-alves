export const OBLIGATION_DEPARTMENTS = [
  { value: 'fiscal', label: 'Departamento Fiscal', short: 'Fiscal' },
  { value: 'pessoal', label: 'Departamento Pessoal', short: 'Pessoal' },
  { value: 'financeiro', label: 'Departamento Financeiro', short: 'Financeiro' },
  { value: 'contabil', label: 'Departamento Contábil', short: 'Contábil' },
  { value: 'comercial', label: 'Departamento de Legalização/Comercial', short: 'Comercial' },
  { value: 'geral', label: 'Geral', short: 'Geral' },
] as const;

export type ObligationDepartment = (typeof OBLIGATION_DEPARTMENTS)[number]['value'];

export function obligationDepartmentLabel(value: string | null | undefined, variant: 'label' | 'short' = 'short') {
  if (!value) return null;
  return OBLIGATION_DEPARTMENTS.find((d) => d.value === value)?.[variant] ?? value;
}
