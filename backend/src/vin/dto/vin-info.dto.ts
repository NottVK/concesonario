import { ApiProperty } from '@nestjs/swagger';

/** Qué significa cada parte del VIN (lectura local, ISO 3779). */
export class VinStructureDto {
  @ApiProperty({ example: '9FB', description: 'Posiciones 1 a 3 (WMI): fabricante y país' }) wmi: string;
  @ApiProperty({ type: String, nullable: true, example: 'Renault' }) manufacturer: string | null;
  @ApiProperty({ example: 'Suramérica', description: 'Región por la posición 1' }) region: string;
  @ApiProperty({ type: String, nullable: true, example: 'Colombia', description: 'País por las posiciones 1 y 2' }) country: string | null;
  @ApiProperty({ example: 'HJD20', description: 'Posiciones 4 a 8 (VDS): modelo, carrocería y motor, según el fabricante' }) vds: string;
  @ApiProperty({ example: '4', description: 'Posición 9: dígito verificador' }) checkDigit: string;
  @ApiProperty({ example: '7', description: 'El dígito que corresponde según el cálculo de la norma' }) checkDigitExpected: string;
  @ApiProperty({ example: false, description: 'Obligatorio solo en Norteamérica: muchos VIN latinoamericanos no lo cumplen' }) checkDigitValid: boolean;
  @ApiProperty({ example: 'L', description: 'Posición 10: año modelo' }) yearCode: string;
  @ApiProperty({ type: Number, nullable: true, example: 2020 }) year: number | null;
  @ApiProperty({ example: 'M', description: 'Posición 11: planta de ensamble' }) plantCode: string;
  @ApiProperty({ example: '500005', description: 'Posiciones 12 a 17: número de serie' }) serial: string;
}

/** Ficha de la base pública de la NHTSA (EE. UU.). */
export class VinExternalDto {
  @ApiProperty({ example: 'NHTSA vPIC' }) source: 'NHTSA vPIC';
  @ApiProperty({ type: String, nullable: true, example: 'Honda' }) make: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Accord' }) model: string | null;
  @ApiProperty({ type: Number, nullable: true, example: 2003 }) year: number | null;
  @ApiProperty({ type: String, nullable: true, example: 'EX-V6' }) trim: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Coupe' }) bodyClass: string | null;
  @ApiProperty({ type: Number, nullable: true, example: 2 }) doors: number | null;
  @ApiProperty({ type: String, nullable: true, example: '3.0 L, 6 cilindros' }) engine: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Gasolina' }) fuel: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Automática' }) transmission: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'United States (usa)' }) plantCountry: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'AMERICAN HONDA MOTOR CO., INC.' }) manufacturer: string | null;
}

/**
 * Datos de un VIN. Con `registered: true` vienen del registro del concesionario; si no, de la NHTSA o, como mínimo,
 * de la estructura del VIN (marca y año). Nunca trae datos del propietario.
 */
export class VinInfoDto {
  @ApiProperty({ example: '9FBHJD204LM500005' }) vin: string;
  @ApiProperty({ description: 'true si el VIN está en el registro del concesionario' }) registered: boolean;
  @ApiProperty({ enum: ['registro', 'nhtsa', 'estructura'], description: 'De dónde salen marca, modelo, año y el resto' }) source: 'registro' | 'nhtsa' | 'estructura';
  @ApiProperty({ type: String, nullable: true, example: 'Renault' }) brand: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Duster' }) model: string | null;
  @ApiProperty({ type: Number, nullable: true, example: 2020 }) year: number | null;
  @ApiProperty({ type: String, nullable: true, example: 'Intens 1.3 Turbo' }) version: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'SUV' }) bodyType: string | null;
  @ApiProperty({ type: Number, nullable: true, example: 5 }) doors: number | null;
  @ApiProperty({ type: String, nullable: true, example: '1.3 L turbo' }) engine: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Gasolina' }) fuel: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Automática CVT' }) transmission: string | null;
  @ApiProperty({ type: VinStructureDto, description: 'Qué significa cada parte del VIN' }) structure: VinStructureDto;
  @ApiProperty({ type: VinExternalDto, nullable: true, description: 'Ficha de la NHTSA, o null si no la conoce, no respondió o está apagada' }) external: VinExternalDto | null;
}
