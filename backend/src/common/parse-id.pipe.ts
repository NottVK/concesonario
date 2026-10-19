import { BadRequestException, Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { MAX_DB_INT } from './limits.js';

/**
 * Id de ruta estricto: solo un entero positivo escrito en decimal y que quepa en un `integer`.
 * `ParseIntPipe` de Nest acepta `1e20` (lo convierte en 1), `1.5` (en 1) y números gigantes, que luego
 * reventaban en PostgreSQL con un 500 ("out of range for type integer").
 */
@Injectable()
export class ParseIdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    if (!/^[1-9]\d{0,9}$/.test(value) || Number(value) > MAX_DB_INT) {
      throw new BadRequestException('El id debe ser un número entero positivo válido');
    }
    return Number(value);
  }
}
