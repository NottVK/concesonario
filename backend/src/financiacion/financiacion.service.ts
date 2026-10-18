import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { centsToMoney, moneyToCents } from '../common/money.js';
import type { FinancingSimulationDto, SimulateFinancingDto } from './dto/simulate-financing.dto.js';
import { calculateLoan } from './loan-calculator.js';

const FALLBACK_ANNUAL_RATE = 0.18;

@Injectable()
export class FinanciacionService {
  constructor(private readonly config: ConfigService) {}

  simulate(dto: SimulateFinancingDto): FinancingSimulationDto {
    const amountCents = moneyToCents(dto.amount);
    const downCents = moneyToCents(dto.downPayment);
    if (amountCents <= 0n) throw new BadRequestException('El valor debe ser mayor que cero');
    if (downCents >= amountCents) {
      throw new BadRequestException('La cuota inicial debe ser menor que el valor del vehículo');
    }

    const annualRate = dto.annualRate ?? this.defaultRate();
    const principalCents = amountCents - downCents;
    const loan = calculateLoan({ principalCents, months: dto.months, annualRate });

    return {
      amount: centsToMoney(amountCents),
      downPayment: centsToMoney(downCents),
      financed: centsToMoney(principalCents),
      months: dto.months,
      annualRate,
      monthlyRate: loan.monthlyRate,
      monthlyPayment: centsToMoney(loan.monthlyPaymentCents),
      totalPayment: centsToMoney(loan.totalPaidCents),
      totalInterest: centsToMoney(loan.totalInterestCents),
    };
  }

  private defaultRate(): number {
    const raw = this.config.get<string>('FINANCING_DEFAULT_RATE_EA');
    const rate = raw === undefined ? FALLBACK_ANNUAL_RATE : Number(raw);
    return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : FALLBACK_ANNUAL_RATE;
  }
}
