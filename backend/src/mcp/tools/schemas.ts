import { z } from 'zod';
import { MCP_DEFAULTS } from '../mcp.config.js';

/**
 * Argumentos de las tools del MCP. TODO lo que llega de otro bot es DATO no confiable: tipos exactos (sin coerción),
 * objetos estrictos (un campo de más es error), texto corto con solo letras, números, espacio y guion, y nada se
 * concatena jamás a un texto, una URL o una consulta: solo viaja como parámetro.
 */

const [MIN_YEAR, MAX_YEAR] = MCP_DEFAULTS.yearRange;
const MAX_ID = 2_147_483_647;

// Un modelo se llama «CX-5», «Mazda 3», «Serie 1», «Grand i10»: letras, dígitos, espacios y guion.
const TEXT_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} -]*$/u;

/** NFKC (formas «compatibles» como «Ｍａｚｄａ» pasan a «Mazda»), espacios colapsados, y solo caracteres simples. */
const text = z
  .string()
  .max(200)
  .transform((value) => value.normalize('NFKC').trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1).max(MCP_DEFAULTS.maxTextChars).regex(TEXT_PATTERN));

const year = z.number().int().min(MIN_YEAR).max(MAX_YEAR);

export const consultarStockSchema = z
  .strictObject({
    marca: text.optional(),
    modelo: text.optional(),
    anio: year.optional(),
    estado: z.enum(['nuevo', 'usado']).optional(),
    limite: z.number().int().min(1).max(MCP_DEFAULTS.maxResults).default(MCP_DEFAULTS.defaultResults),
  })
  // Sin al menos un filtro de texto no hay consulta: así nadie recorre el catálogo entero de una llamada.
  .refine((value) => value.marca !== undefined || value.modelo !== undefined);

export const consultarPrecioSchema = z.union([
  z.strictObject({ vehiculo_id: z.number().int().min(1).max(MAX_ID) }),
  z.strictObject({ marca: text, modelo: text, anio: year.optional() }),
]);

export const listarMarcasSchema = z.strictObject({});

export type ConsultarStockArgs = z.output<typeof consultarStockSchema>;
export type ConsultarPrecioArgs = z.output<typeof consultarPrecioSchema>;

const textProperty = (description: string) => ({
  type: 'string',
  minLength: 1,
  maxLength: MCP_DEFAULTS.maxTextChars,
  pattern: '^[\\p{L}\\p{N}][\\p{L}\\p{N} -]*$',
  description,
});

/** Esquemas JSON de entrada que se publican en `tools/list` (a mano: los `transform` de zod no tienen JSON Schema). */
export const INPUT_JSON_SCHEMAS = {
  consultar_stock: {
    type: 'object',
    additionalProperties: false,
    properties: {
      marca: textProperty('Marca, por ejemplo Mazda'),
      modelo: textProperty('Modelo o parte del modelo, por ejemplo CX-5'),
      anio: { type: 'integer', minimum: MIN_YEAR, maximum: MAX_YEAR, description: 'Año del modelo' },
      estado: { type: 'string', enum: ['nuevo', 'usado'] },
      limite: { type: 'integer', minimum: 1, maximum: MCP_DEFAULTS.maxResults, default: MCP_DEFAULTS.defaultResults },
    },
    anyOf: [{ required: ['marca'] }, { required: ['modelo'] }],
  },
  consultar_precio: {
    type: 'object',
    additionalProperties: false,
    properties: {
      vehiculo_id: { type: 'integer', minimum: 1, maximum: MAX_ID, description: 'El campo `ref` de un resultado de consultar_stock' },
      marca: textProperty('Marca (junto con modelo)'),
      modelo: textProperty('Modelo (junto con marca)'),
      anio: { type: 'integer', minimum: MIN_YEAR, maximum: MAX_YEAR },
    },
    oneOf: [{ required: ['vehiculo_id'] }, { required: ['marca', 'modelo'] }],
  },
  listar_marcas: { type: 'object', additionalProperties: false, properties: {} },
} as const;
