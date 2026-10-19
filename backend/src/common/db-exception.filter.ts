import { ArgumentsHost, Catch, ConflictException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { QueryFailedError } from 'typeorm';
import { SLOT_UNAVAILABLE_MESSAGE } from '../citas/appointment-rules.js';

const PG_UNIQUE_VIOLATION = '23505';
const PG_EXCLUSION_VIOLATION = '23P01';
const PG_FK_VIOLATION = '23503';

/** Traduce errores de restricciones de PostgreSQL a 409 con mensaje en español. */
@Catch(QueryFailedError)
export class DbExceptionFilter extends BaseExceptionFilter {
  catch(exception: QueryFailedError, host: ArgumentsHost): void {
    const code = (exception.driverError as { code?: string } | undefined)?.code;
    const message = DbExceptionFilter.messageFor(code);
    super.catch(message ? new ConflictException(message) : exception, host);
  }

  private static messageFor(code: string | undefined): string | undefined {
    switch (code) {
      case PG_UNIQUE_VIOLATION:
        return 'Ya existe un registro con esos datos';
      case PG_EXCLUSION_VIOLATION:
        return SLOT_UNAVAILABLE_MESSAGE;
      case PG_FK_VIOLATION:
        return 'El registro está relacionado con otros datos';
      default:
        return undefined;
    }
  }
}
