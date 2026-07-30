/**
 * Checks if a transaction is effectively paid (strict rule).
 * A transaction is only considered paid if:
 * 1. is_paid flag is true
 * 2. Payment date (date) is filled
 * 3. paid_amount is filled (>= 0)
 */
export function isEffectivelyPaid(t: { is_paid: boolean; date: string | null; paid_amount: number | null }): boolean {
  return t.is_paid && !!t.date && t.paid_amount != null;
}

/**
 * Returns the effective amount for a transaction based on its payment status.
 * Uses the strict isEffectivelyPaid rule.
 * - If effectively paid → use paid_amount
 * - Otherwise → use original amount
 */
export function getEffectiveAmount(t: { is_paid: boolean; amount: number; paid_amount: number | null; date?: string | null }): number {
  const paid = isEffectivelyPaid({ is_paid: t.is_paid, date: t.date ?? null, paid_amount: t.paid_amount });
  return paid && t.paid_amount != null ? Number(t.paid_amount) : Number(t.amount);
}

// ── Encargos por atraso ───────────────────────────────────────────────────────
// Fonte única das regras de multa e juros. Os mesmos números são enviados ao Sicoob
// na emissão do boleto (supabase/functions/sicoob-boletos/index.ts) e usados na tela
// Pagar/Receber. Confirmado por Gabriel: vale a regra do boleto (0,07%/dia desde o
// dia seguinte ao vencimento), não a que a tela usava antes (0,15%/dia a partir do 5º dia).

/** Juros de mora ao dia (0,07%), a partir do dia seguinte ao vencimento. */
export const JUROS_MORA_DIA = 0.0007;

/** Multa por atraso (2%), aplicada uma única vez. */
export const MULTA_ATRASO_PCT = 0.02;

/** Dias de carência antes de começar a cobrar. 0 = cobra a partir do dia seguinte. */
export const CARENCIA_DIAS = 0;

export interface EncargosAtraso {
  diasAtraso: number;
  multa: number;
  juros: number;
  /** valor original + multa + juros */
  total: number;
  /** true quando há algum encargo a cobrar */
  temEncargos: boolean;
}

/**
 * Calcula multa e juros de mora de um título vencido.
 * `diasAtraso` conta a partir do dia seguinte ao vencimento (mesma contagem do Sicoob).
 */
export function calcularEncargosAtraso(
  amount: number,
  dueDate: string | null | undefined,
  hoje: Date = new Date()
): EncargosAtraso {
  const base = Number(amount) || 0;
  const semEncargos: EncargosAtraso = { diasAtraso: 0, multa: 0, juros: 0, total: base, temEncargos: false };
  if (!dueDate) return semEncargos;

  const venc = new Date(`${dueDate}T12:00:00`);
  if (Number.isNaN(venc.getTime())) return semEncargos;

  const ref = new Date(hoje);
  ref.setHours(12, 0, 0, 0);
  const diasAtraso = Math.floor((ref.getTime() - venc.getTime()) / 86_400_000);
  if (diasAtraso <= CARENCIA_DIAS) return semEncargos;

  const multa = base * MULTA_ATRASO_PCT;
  const juros = base * JUROS_MORA_DIA * diasAtraso;
  return { diasAtraso, multa, juros, total: base + multa + juros, temEncargos: true };
}
