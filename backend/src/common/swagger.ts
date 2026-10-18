import { applyDecorators } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiProperty, getSchemaPath } from '@nestjs/swagger';

/** Metadatos de paginación que acompañan a toda lista paginada. */
export class PageMeta {
  @ApiProperty({ example: 60 }) total: number;
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 12 }) limit: number;
  @ApiProperty({ example: 5 }) pages: number;
}

/** Documenta una respuesta `{ data: Modelo[], meta }` (Swagger no soporta genéricos). */
export function ApiPaginatedResponse<T extends Type<unknown>>(model: T): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(model, PageMeta),
    ApiOkResponse({
      schema: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          meta: { $ref: getSchemaPath(PageMeta) },
        },
      },
    }),
  );
}
