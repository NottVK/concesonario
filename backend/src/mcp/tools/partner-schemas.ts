import { z } from 'zod';
import { VIN_PATTERN } from '../../vin/vin-decoder.js';

/**
 * Argumentos de las herramientas del taller (decisión 134). Lo que manda el taller es DATO no confiable: tipos exactos,
 * topes de tamaño y formatos cerrados en los identificadores. Los objetos no son estrictos (el taller puede mandar
 * campos de más y se descartan), pero nada de lo que sobra llega a la base ni a una respuesta.
 */

const relationId = z.string().regex(/^REL-\d{4,6}$/);
const orderCode = z.string().regex(/^OT-\d{1,8}$/);
const vin = z.string().max(40).transform((v) => v.trim().toUpperCase()).pipe(z.string().regex(VIN_PATTERN));
const freeText = (max: number) => z.string().max(2000).transform((v) => v.slice(0, max)).nullish();

export const consultarRelacionSchema = z.strictObject({ id_relacion: relationId });

export const decodificarVinSchema = z.strictObject({ vin });

export const validarGarantiaSchema = z.object({
  codigo: orderCode,
  id_relacion: relationId,
  vin,
  por_garantia: z.boolean().default(false),
  motivo_reclamo: freeText(300),
  servicios: z.array(z.object({
    tarea_id: z.union([z.number().int().nonnegative(), z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)]),
    sku: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).optional(),
    especialidad: z.string().regex(/^[a-z_]{2,40}$/),
    causa: z.string().regex(/^[a-z_]{2,40}$/).nullish(),
    aplica: z.boolean(),
    motivo: freeText(300),
    evidencias: z.array(z.string().max(500)).max(20).default([]),
  })).min(1).max(10),
});

export const notificarEstadoSchema = z.object({
  codigo: orderCode,
  id_relacion: relationId,
  estado: z.string().regex(/^[a-z_]{3,30}$/),
  placa: z.string().regex(/^[A-Za-z0-9-]{1,10}$/).optional(),
  sede: z.string().max(120).optional(),
  nota: freeText(300),
  fecha: z.string().max(40).optional(),
});

const ID_RELACION = { type: 'string', pattern: '^REL-[0-9]{4,6}$', description: 'Identificador de la relación cliente–vehículo, por ejemplo REL-1005' };
const CODIGO = { type: 'string', pattern: '^OT-[0-9]{1,8}$', description: 'Código de la orden del taller, por ejemplo OT-0018' };
const VIN = { type: 'string', minLength: 17, maxLength: 17, description: 'VIN de 17 caracteres, sin I, O ni Q' };

/** Esquemas JSON que se publican en `tools/list` (solo para un bot con el permiso `taller`). */
export const PARTNER_JSON_SCHEMAS = {
  consultar_relacion: { type: 'object', additionalProperties: false, properties: { id_relacion: ID_RELACION }, required: ['id_relacion'] },
  decodificar_vin: { type: 'object', additionalProperties: false, properties: { vin: VIN }, required: ['vin'] },
  validar_garantia: {
    type: 'object',
    properties: {
      codigo: CODIGO, id_relacion: ID_RELACION, vin: VIN,
      por_garantia: { type: 'boolean' },
      motivo_reclamo: { type: 'string', maxLength: 300 },
      servicios: {
        type: 'array', minItems: 1, maxItems: 10,
        items: {
          type: 'object',
          properties: {
            tarea_id: { type: ['integer', 'string'] }, sku: { type: 'string' },
            especialidad: { type: 'string', description: 'frenos, suspension, motor, electrico, transmision o mantenimiento_general' },
            causa: { type: 'string', description: 'defecto_fabrica, repuesto_defectuoso, mala_instalacion_taller, manipulacion_cliente o desgaste_normal' },
            aplica: { type: 'boolean', description: 'Dictamen del mecánico: si la garantía aplica' },
            motivo: { type: 'string', maxLength: 300 },
            evidencias: { type: 'array', maxItems: 20, items: { type: 'string', description: 'URL de una foto o PDF' } },
          },
          required: ['tarea_id', 'especialidad', 'aplica'],
        },
      },
    },
    required: ['codigo', 'id_relacion', 'vin', 'servicios'],
  },
  notificar_estado_vehiculo: {
    type: 'object',
    properties: {
      codigo: CODIGO, id_relacion: ID_RELACION,
      estado: { type: 'string', pattern: '^[a-z_]{3,30}$', description: 'Estado nuevo de la orden, por ejemplo en_diagnostico' },
      placa: { type: 'string' }, sede: { type: 'string' }, nota: { type: 'string', maxLength: 300 },
      fecha: { type: 'string', description: 'Fecha y hora ISO 8601 del cambio' },
    },
    required: ['codigo', 'id_relacion', 'estado'],
  },
} as const;
