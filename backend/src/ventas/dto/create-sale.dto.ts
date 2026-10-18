import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, Matches, Min } from 'class-validator';
import { POSITIVE_MONEY_REGEX } from '../../common/money.js';
import { PaymentMethod } from '../entities/sale.entity.js';

/** El vendedor NO viaja en el cuerpo: se toma siempre del token. */
export class CreateSaleDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vehicleId: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId: number;

  /** Precio final pactado en COP, como texto (hasta 2 decimales), mayor que cero. */
  @ApiProperty({ example: '115000000.50', description: 'Precio final en COP como texto, hasta 2 decimales, mayor que cero' })
  @Matches(POSITIVE_MONEY_REGEX, { message: 'finalPrice debe ser un monto en COP mayor que cero' })
  finalPrice: string;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod, { message: `payment debe ser: ${Object.values(PaymentMethod).join(', ')}` })
  payment: PaymentMethod;
}
