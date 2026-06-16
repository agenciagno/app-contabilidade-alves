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
