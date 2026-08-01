/**
 * Campos com máscara da Calculadora RT.
 *
 * O valor sempre vive no estado já formatado (o que o usuário vê é o que está guardado),
 * e a conversão para número acontece só na hora de calcular. Isso evita o vaivém de
 * formatar/desformatar a cada tecla, que é o que costuma fazer o cursor pular.
 */

import { forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { formatCurrencyInput, maskCNPJ, parseCurrencyInput } from '@/lib/utils';

interface CampoProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
}

/** Moeda em reais: digita 60000 e vira 600,00 → 6.000,00 conforme avança. */
export const CampoMoeda = forwardRef<HTMLInputElement, CampoProps>(
  ({ value, onChange, placeholder, id, className }, ref) => (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        R$
      </span>
      <Input
        ref={ref}
        id={id}
        className={`pl-9 tabular-nums ${className ?? ''}`}
        inputMode="numeric"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value ? formatCurrencyInput(e.target.value) : '')}
      />
    </div>
  )
);
CampoMoeda.displayName = 'CampoMoeda';

/**
 * Percentual com até 2 casas. Trava em `max` (100 por padrão) para não aceitar
 * um ISS de 500% sem ninguém perceber.
 */
export const CampoPercentual = forwardRef<HTMLInputElement, CampoProps & { max?: number }>(
  ({ value, onChange, placeholder, id, className, max = 100 }, ref) => {
    const tratar = (bruto: string) => {
      let limpo = bruto.replace(/[^\d,]/g, '').replace(/,+/g, ',');
      const [inteiro, decimal] = limpo.split(',');
      if (decimal !== undefined) limpo = `${inteiro},${decimal.slice(0, 2)}`;
      const numero = Number(limpo.replace(',', '.'));
      if (Number.isFinite(numero) && numero > max) return String(max);
      return limpo;
    };
    return (
      <div className="relative">
        <Input
          ref={ref}
          id={id}
          className={`pr-8 tabular-nums ${className ?? ''}`}
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(tratar(e.target.value))}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          %
        </span>
      </div>
    );
  }
);
CampoPercentual.displayName = 'CampoPercentual';

/** CNPJ, aceitando o formato alfanumérico novo (IN RFB 2.229/2024). */
export const CampoCnpj = forwardRef<HTMLInputElement, CampoProps>(
  ({ value, onChange, placeholder, id, className }, ref) => (
    <Input
      ref={ref}
      id={id}
      className={`tabular-nums ${className ?? ''}`}
      value={value}
      placeholder={placeholder ?? '00.000.000/0000-00'}
      onChange={(e) => onChange(maskCNPJ(e.target.value))}
    />
  )
);
CampoCnpj.displayName = 'CampoCnpj';

/** "1.234,56" → 1234.56. Vazio vira undefined, não zero. */
export function numeroDeMoeda(v: string): number | undefined {
  if (!v?.trim()) return undefined;
  const n = parseCurrencyInput(v);
  return Number.isFinite(n) ? n : undefined;
}

export function numeroDePercentual(v: string): number | undefined {
  if (!v?.trim()) return undefined;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}
