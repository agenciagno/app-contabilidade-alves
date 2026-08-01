import { Check, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/** Sempre gravar assim: sem espaço nas pontas e em minúsculo. */
export function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

interface EmailFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}

/**
 * Campo de e-mail com validação visível enquanto digita. Existe porque erro de
 * digitação (o clássico "gmailcom" sem ponto) só aparecia no toast depois de
 * enviar — o operador não via o que estava errado no campo.
 */
export function EmailField({ id, label, value, onChange, required, placeholder }: EmailFieldProps) {
  const touched = value.trim().length > 0;
  const ok = isValidEmail(value);
  const semPonto = touched && value.includes('@') && !value.split('@')[1]?.includes('.');

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label} {required && '*'}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="email"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={255}
          className={cn(
            'pr-9',
            touched && !ok && 'border-destructive focus-visible:ring-destructive',
          )}
        />
        {touched && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            {ok ? (
              <Check className="h-4 w-4 text-ok" />
            ) : (
              <AlertCircle className="h-4 w-4 text-destructive" />
            )}
          </span>
        )}
      </div>
      {touched && !ok && (
        <p className="text-xs text-destructive">
          {semPonto
            ? 'Falta o ponto no domínio — confira se ficou "gmail.com" e não "gmailcom".'
            : 'E-mail incompleto.'}
        </p>
      )}
    </div>
  );
}
