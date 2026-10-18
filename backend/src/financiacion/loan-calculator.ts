export interface LoanInput {
  /** Monto a financiar, en centavos. */
  principalCents: bigint;
  months: number;
  /** Tasa efectiva anual como fracción (0.18 = 18 %). */
  annualRate: number;
}

export interface LoanResult {
  monthlyPaymentCents: bigint;
  totalPaidCents: bigint;
  totalInterestCents: bigint;
  /** Tasa efectiva mensual equivalente, como fracción. */
  monthlyRate: number;
}

/** Tasa mensual equivalente a una efectiva anual: (1 + EA)^(1/12) - 1. */
export function monthlyRateFromAnnual(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

/**
 * Sistema francés (cuota fija). La cuota se redondea hacia arriba al centavo para no
 * cobrar de menos, así los intereses nunca salen negativos. Con tasa 0 se reparte en partes iguales.
 */
export function calculateLoan({ principalCents, months, annualRate }: LoanInput): LoanResult {
  const monthlyRate = monthlyRateFromAnnual(annualRate);
  const months_ = BigInt(months);

  let monthlyPaymentCents: bigint;
  if (annualRate === 0) {
    monthlyPaymentCents = (principalCents + months_ - 1n) / months_;
  } else {
    // El monto máximo (10^12 centavos) cabe de sobra en la precisión de un double.
    const factor = monthlyRate / (1 - Math.pow(1 + monthlyRate, -months));
    monthlyPaymentCents = BigInt(Math.ceil(Number(principalCents) * factor - 1e-6));
  }

  const totalPaidCents = monthlyPaymentCents * months_;
  return {
    monthlyPaymentCents,
    totalPaidCents,
    totalInterestCents: totalPaidCents - principalCents,
    monthlyRate,
  };
}
