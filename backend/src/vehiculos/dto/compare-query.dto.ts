import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsInt, Min } from 'class-validator';

export const MAX_COMPARE = 3;

/** GET /vehiculos/comparar?ids=1,2,3 */
export class CompareQueryDto {
  @ApiProperty({
    type: String,
    example: '1,2,3',
    description: `De 2 a ${MAX_COMPARE} ids de vehículo distintos, separados por coma`,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').map((id) => Number(id.trim())) : value,
  )
  @ArrayMinSize(2, { message: 'ids debe tener al menos 2 vehículos' })
  @ArrayMaxSize(MAX_COMPARE, { message: `ids no puede superar ${MAX_COMPARE} vehículos` })
  @ArrayUnique({ message: 'ids no puede repetir vehículos' })
  @IsInt({ each: true, message: 'ids debe ser una lista de enteros separados por coma' })
  @Min(1, { each: true })
  ids: number[];
}
