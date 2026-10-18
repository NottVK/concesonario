import { Type } from 'class-transformer';
import { IsEnum, IsInt, Matches, Min } from 'class-validator';
import { POSITIVE_MONEY_REGEX } from '../../common/money.js';
import { PaymentMethod } from '../entities/sale.entity.js';

/** El vendedor NO viaja en el cuerpo: se toma siempre del token. */
export class CreateSaleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vehicleId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId: number;

  /** Precio final pactado en COP, como texto (hasta 2 decimales), mayor que cero. */
  @Matches(POSITIVE_MONEY_REGEX, { message: 'finalPrice debe ser un monto en COP mayor que cero' })
  finalPrice: string;

  @IsEnum(PaymentMethod, { message: `payment debe ser: ${Object.values(PaymentMethod).join(', ')}` })
  payment: PaymentMethod;
}
