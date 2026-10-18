import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { centsToMoney, moneyToCents } from '../common/money.js';
import type { SimulateFinancingDto } from './dto/simulate-financing.dto.js';
import { calculateLoan } from './loan-calculator.js';

const FALLBACK_ANNUAL_RATE = 0.18;

export interface FinancingSimulation {
  valor: string;
  cuotaInicial: string;
  financiado: string;
  plazoMeses: number;
  tasaEA: number;
  tasaMensual: number;
  cuotaMensual: string;
  totalPagar: string;
  totalIntereses: string;
}

@Injectable()
export class FinanciacionService {
  constructor(private readonly config: ConfigService) {}

  simulate(dto: SimulateFinancingDto): FinancingSimulation {
    const valueCents = moneyToCents(dto.valor);
    const downCents = moneyToCents(dto.cuotaInicial);
    if (valueCents <= 0n) throw new BadRequestException('El valor debe ser mayor que cero');
    if (downCents >= valueCents) {
      throw new BadRequestException('La cuota inicial debe ser menor que el valor del vehículo');
    }

    const annualRate = dto.tasaEA ?? this.defaultRate();
    const principalCents = valueCents - downCents;
    const loan = calculateLoan({ principalCents, months: dto.plazoMeses, annualRate });

    return {
      valor: centsToMoney(valueCents),
      cuotaInicial: centsToMoney(downCents),
      financiado: centsToMoney(principalCents),
      plazoMeses: dto.plazoMeses,
      tasaEA: annualRate,
      tasaMensual: loan.monthlyRate,
      cuotaMensual: centsToMoney(loan.monthlyPaymentCents),
      totalPagar: centsToMoney(loan.totalPaidCents),
      totalIntereses: centsToMoney(loan.totalInterestCents),
    };
  }

  private defaultRate(): number {
    const raw = this.config.get<string>('FINANCING_DEFAULT_RATE_EA');
    const rate = raw === undefined ? FALLBACK_ANNUAL_RATE : Number(raw);
    return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : FALLBACK_ANNUAL_RATE;
  }
}
