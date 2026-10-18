import { describe, expect, it } from 'vitest';
import { centsToMoney } from '../common/money.js';
import { calculateLoan, monthlyRateFromAnnual } from './loan-calculator.js';

/** EA equivalente a una tasa mensual dada, para casos de libro de texto. */
const annualFromMonthly = (monthly: number): number => Math.pow(1 + monthly, 12) - 1;

describe('calculateLoan', () => {
  it('coincide con el caso de libro: 1.000.000 a 12 meses al 1 % mensual', () => {
    const loan = calculateLoan({
      principalCents: 100_000_000n,
      months: 12,
      annualRate: annualFromMonthly(0.01),
    });
    expect(centsToMoney(loan.monthlyPaymentCents)).toBe('88848.79');
    expect(centsToMoney(loan.totalPaidCents)).toBe('1066185.48');
    expect(centsToMoney(loan.totalInterestCents)).toBe('66185.48');
  });

  it('con tasa 0 reparte en partes iguales sin intereses significativos', () => {
    const loan = calculateLoan({ principalCents: 120_000_000n, months: 12, annualRate: 0 });
    expect(centsToMoney(loan.monthlyPaymentCents)).toBe('100000.00');
    expect(loan.totalInterestCents).toBe(0n);
  });

  it('con tasa 0 y división inexacta redondea la cuota hacia arriba (interés < 1 centavo por cuota)', () => {
    const loan = calculateLoan({ principalCents: 100_000_001n, months: 12, annualRate: 0 });
    expect(loan.totalInterestCents).toBeGreaterThanOrEqual(0n);
    expect(loan.totalInterestCents).toBeLessThan(12n);
  });

  it('amortiza por completo: el saldo final queda en cero (o a favor del cliente por redondeo)', () => {
    const principalCents = 8_000_000_000n; // 80 millones COP
    const annualRate = 0.2133;
    const months = 60;
    const { monthlyPaymentCents, monthlyRate } = calculateLoan({ principalCents, months, annualRate });

    let balance = Number(principalCents);
    for (let i = 0; i < months; i++) {
      balance = balance * (1 + monthlyRate) - Number(monthlyPaymentCents);
    }
    // El redondeo hacia arriba nunca deja saldo pendiente; el sobrante es de centavos.
    expect(balance).toBeLessThanOrEqual(1);
    expect(balance).toBeGreaterThan(-Number(monthlyPaymentCents));
  });

  it('los intereses crecen con el plazo y con la tasa', () => {
    const base = { principalCents: 5_000_000_000n, months: 36, annualRate: 0.15 };
    const longer = calculateLoan({ ...base, months: 72 });
    const pricier = calculateLoan({ ...base, annualRate: 0.25 });
    const normal = calculateLoan(base);
    expect(longer.totalInterestCents).toBeGreaterThan(normal.totalInterestCents);
    expect(pricier.totalInterestCents).toBeGreaterThan(normal.totalInterestCents);
  });

  it('soporta el monto máximo de numeric(12,2) sin perder el orden de magnitud', () => {
    const loan = calculateLoan({ principalCents: 99_999_999_999_999n, months: 84, annualRate: 1 });
    expect(loan.monthlyPaymentCents).toBeGreaterThan(0n);
    expect(loan.totalPaidCents).toBeGreaterThan(99_999_999_999_999n);
  });
});

describe('monthlyRateFromAnnual', () => {
  it('compuesta doce veces devuelve la tasa anual', () => {
    expect(Math.pow(1 + monthlyRateFromAnnual(0.18), 12) - 1).toBeCloseTo(0.18, 10);
  });

  it('tasa cero da tasa mensual cero', () => {
    expect(monthlyRateFromAnnual(0)).toBe(0);
  });
});
