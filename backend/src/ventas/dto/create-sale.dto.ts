import { MAX_DB_INT, tooBig } from '../../common/limits.js';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, Matches, Max, Min } from 'class-validator';
import { POSITIVE_MONEY_REGEX } from '../../common/money.js';
import { PaymentMethod } from '../entities/sale.entity.js';

/** El vendedor NO viaja en el cuerpo: se toma siempre del token. */
export class CreateSaleDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_DB_INT, tooBig('vehicleId'))
  vehicleId: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_DB_INT, tooBig('customerId'))
  customerId: number;

  /** Precio final pactado en COP, como texto (hasta 2 decimales), mayor que cero. */
  @ApiProperty({ example: '115000000.50', description: 'Precio final en COP como texto, hasta 2 decimales, mayor que cero y no superior a 5.000.000.000' })
  @Matches(POSITIVE_MONEY_REGEX, { message: 'finalPrice debe ser un monto en COP mayor que cero' })
  finalPrice: string;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod, { message: `payment debe ser: ${Object.values(PaymentMethod).join(', ')}` })
  payment: PaymentMethod;
}
