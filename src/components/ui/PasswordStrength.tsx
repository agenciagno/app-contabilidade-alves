import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function isPasswordStrong(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

interface Requirement {
  label: string;
  met: boolean;
}

interface PasswordStrengthProps {
  password: string;
  className?: string;
}

export function PasswordStrength({ password, className }: PasswordStrengthProps) {
  const requirements: Requirement[] = [
    { label: 'Mínimo 8 caracteres', met: password.length >= 8 },
    { label: 'Uma letra maiúscula (A-Z)', met: /[A-Z]/.test(password) },
    { label: 'Uma letra minúscula (a-z)', met: /[a-z]/.test(password) },
    { label: 'Um número (0-9)', met: /[0-9]/.test(password) },
  ];

  if (!password) return null;

  return (
    <div className={cn('space-y-1 mt-2', className)}>
      {requirements.map((req) => (
        <div key={req.label} className="flex items-center gap-2">
          {req.met ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
          ) : (
            <Circle className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          )}
          <span className={cn('text-xs', req.met ? 'text-emerald-600' : 'text-muted-foreground')}>
            {req.label}
          </span>
        </div>
      ))}
    </div>
  );
}
