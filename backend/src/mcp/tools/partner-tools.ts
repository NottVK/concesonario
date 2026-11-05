import { consultarRelacionSchema, decodificarVinSchema, notificarEstadoSchema, PARTNER_JSON_SCHEMAS, validarGarantiaSchema } from './partner-schemas.js';
import type { ToolDefinition } from './tools.js';

/**
 * Herramientas que el TALLER llama en nuestro MCP (decisión 134). Solo las ve y usa un bot con el permiso `taller`:
 * `consultar_relacion` devuelve datos del cliente. Nada de lo que devuelven pasa por un modelo de lenguaje, y la
 * auditoría guarda solo identificadores (id_relacion, código de la orden, estado), nunca la cédula ni el teléfono.
 */
const INVALID = 'Parámetros no válidos: revisa id_relacion (REL-####), codigo (OT-####), vin (17 caracteres) y los campos obligatorios.';

const consultarRelacion: ToolDefinition = {
  name: 'consultar_relacion',
  scope: 'taller',
  readOnly: true,
  title: 'Consultar relación cliente–vehículo',
  description: 'Cliente, vehículo (cabecera del VIN), kilometraje y garantía vigente de una relación REL-####, en camelCase. null si no existe.',
  inputSchema: PARTNER_JSON_SCHEMAS.consultar_relacion,
  invalidMessage: INVALID,
  async execute(raw, { partner }) {
    const parsed = consultarRelacionSchema.safeParse(raw);
    if (!parsed.success || !partner) return { kind: 'invalid' };
    const relation = await partner.consultRelation(parsed.data.id_relacion);
    return { kind: 'ok', summary: { id_relacion: parsed.data.id_relacion }, available: 1, make: () => relation };
  },
};

const decodificarVin: ToolDefinition = {
  name: 'decodificar_vin',
  scope: 'taller',
  readOnly: true,
  title: 'Decodificar VIN',
  description: 'Datos de fábrica de un VIN (marca, modelo, versión, carrocería, puertas, motor, combustible, transmisión) y qué significa cada parte del código.',
  inputSchema: PARTNER_JSON_SCHEMAS.decodificar_vin,
  invalidMessage: INVALID,
  async execute(raw, { partner }) {
    const parsed = decodificarVinSchema.safeParse(raw);
    if (!parsed.success || !partner) return { kind: 'invalid' };
    const info = await partner.decodeVin(parsed.data.vin);
    // El VIN no se audita: identifica el vehículo de un cliente.
    return { kind: 'ok', summary: {}, available: 1, make: () => info };
  },
};

const validarGarantia: ToolDefinition = {
  name: 'validar_garantia',
  scope: 'taller',
  readOnly: false,
  title: 'Validar garantía',
  description:
    'El concesionario valida la garantía de cada servicio del diagnóstico. Responde el acuse con el resultado y, aparte, lo registra en el taller ' +
    'con registrar_resultado_garantia. Repetirla para la misma orden recalcula y reenvía el resultado.',
  inputSchema: PARTNER_JSON_SCHEMAS.validar_garantia,
  invalidMessage: INVALID,
  async execute(raw, { partner }) {
    const parsed = validarGarantiaSchema.safeParse(raw);
    if (!parsed.success || !partner) return { kind: 'invalid' };
    const ack = await partner.validateWarranty(parsed.data);
    const summary = { codigo: parsed.data.codigo, id_relacion: parsed.data.id_relacion, servicios: parsed.data.servicios.length };
    return { kind: 'ok', summary, available: 1, make: () => ack };
  },
};

const notificarEstado: ToolDefinition = {
  name: 'notificar_estado_vehiculo',
  scope: 'taller',
  readOnly: false,
  title: 'Notificar estado del vehículo',
  description: 'El taller avisa un cambio de estado de una orden. Responde un acuse de recibo.',
  inputSchema: PARTNER_JSON_SCHEMAS.notificar_estado_vehiculo,
  invalidMessage: INVALID,
  async execute(raw, { partner }) {
    const parsed = notificarEstadoSchema.safeParse(raw);
    if (!parsed.success || !partner) return { kind: 'invalid' };
    const ack = await partner.notifyStatus(parsed.data);
    return { kind: 'ok', summary: { codigo: parsed.data.codigo, id_relacion: parsed.data.id_relacion, estado: parsed.data.estado }, available: 1, make: () => ack };
  },
};

export const PARTNER_TOOLS: readonly ToolDefinition[] = [consultarRelacion, decodificarVin, validarGarantia, notificarEstado];
