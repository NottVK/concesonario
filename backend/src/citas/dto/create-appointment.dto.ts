import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDefined, IsInt, IsObject, Matches, Min, ValidateNested } from 'class-validator';
import { CustomerDto } from '../../clientes/dto/customer.dto.js';

/** ISO 8601 con zona horaria obligatoria (Z o ±hh:mm), para no depender de la hora del servidor. */
export const ISO_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Cuerpo público de POST /citas. Lleva los datos del cliente en lugar de un `customerId`
 * para que un anónimo no pueda agendar a nombre de un cliente existente adivinando ids.
 */
export class CreateAppointmentDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vehicleId: number;

  @ApiProperty({
    example: '2026-11-03T10:00:00-05:00',
    description:
      'ISO 8601 con zona horaria. Lunes a sábado, 8:00–18:00 hora de Bogotá; la cita dura 60 min y debe terminar antes del cierre',
  })
  @Matches(ISO_WITH_OFFSET, {
    message: 'scheduledAt debe ser ISO 8601 con zona horaria, p. ej. 2026-11-03T10:00:00-05:00',
  })
  scheduledAt: string;

  // ValidateNested no falla si el campo falta; IsDefined + IsObject lo hacen obligatorio.
  @ApiProperty({ type: () => CustomerDto, description: 'Si el correo ya existe se reutiliza el cliente sin modificarlo' })
  @IsDefined({ message: 'customer es obligatorio' })
  @IsObject({ message: 'customer debe ser un objeto con name, email y phone opcional' })
  @ValidateNested()
  @Type(() => CustomerDto)
  customer: CustomerDto;
}
