import { z } from 'zod';

/**
 * Validación de lo que responde el MCP del taller (decisiones 130 y 131). Lo que manda otro servicio es un DATO no
 * confiable: se aceptan solo los campos que se usan, con topes de largo, y una respuesta que no cumpla se trata como
 * caída. Lo que el flujo no necesita es opcional: el taller real no siempre lo manda.
 */
const site = z.object({
  id: z.number().int(),
  codigo: z.string().min(1).max(40),
  nombre: z.string().min(1).max(160),
  tipo: z.string().max(40).optional(),
  especialidades: z.array(z.string().max(40)).max(20).optional(),
  activo: z.boolean().optional(),
  ubicacion: z.object({ ciudad: z.string().max(80).optional(), direccion: z.string().max(200).optional() }).optional(),
  horario: z.object({ dias: z.array(z.number().int()).max(7).optional(), apertura: z.string().max(10).optional(), cierre: z.string().max(10).optional() }).optional(),
});

const nextStep = z.object({ responsable: z.string().max(40), descripcion: z.string().max(400) });

export const sitesSchema = z.object({ elementos: z.array(site).max(50) });

export const prediagnosisSchema = z.object({
  id_relacion: z.string().max(20).optional(),
  vehiculo: z.string().max(300).optional(),
  garantia: z.object({
    vigente: z.boolean(),
    vence: z.string().max(20).optional(),
    kmMaximo: z.number().optional(),
    cubre: z.array(z.string().max(40)).max(10).optional(),
    motivo: z.string().max(300).nullish(),
  }).optional(),
  especialidad: z.string().max(40),
  servicios: z.array(z.string().max(40)).max(20).optional(),
  confianza: z.number().min(0).max(1).optional(),
  resumen: z.string().max(2000).optional(),
  fuente: z.string().max(20).optional(),
  ruta: z.enum(['especializada', 'revision_general']),
  servicios_probables: z.array(z.object({ sku: z.string().max(40), nombre: z.string().max(160), precio_mano_obra: z.number().int().nonnegative() })).max(20).default([]),
  sede_sugerida: site.nullish(),
});

/**
 * `enrutar_garantia` (decisión 133): el prediagnóstico más la decisión de a qué taller va el carro, con su
 * `id_prediagnostico` para agendar sin volver a calcular nada. La estimación de garantía no es una promesa.
 */
export const routingSchema = prediagnosisSchema.extend({
  id_prediagnostico: z.string().min(1).max(20),
  taller: site,
  motivo_decision: z.string().max(600).optional(),
  por_garantia: z.boolean().optional(),
  garantia: prediagnosisSchema.shape.garantia.unwrap().extend({
    aplica_probable: z.boolean().nullish(),
    causa_probable: z.string().max(60).nullish(),
  }).optional(),
});

/** `consultar_disponibilidad` con `desde` y `hasta` (máximo 14 días): solo las franjas libres. */
export const availabilitySchema = z.object({
  fecha: z.string().max(20).optional(),
  desde: z.string().max(20).optional(),
  hasta: z.string().max(20).optional(),
  cupo_por_franja: z.number().int().nonnegative().optional(),
  franjas: z.array(z.object({ inicio: z.string().max(40), libres: z.number().int() })).max(200),
});

/** `reservar_franja`: la hora queda apartada unos minutos mientras el cliente confirma. */
export const reservationSchema = z.object({
  id_reserva: z.string().min(1).max(20),
  fecha_hora: z.string().max(40),
  vence_en: z.string().max(40),
  minutos_vigencia: z.number().int().positive().max(120).optional(),
  taller: site.optional(),
  siguiente_paso: nextStep.optional(),
});

export const workOrderSchema = z.object({
  codigo: z.string().min(1).max(20),
  estado: z.string().max(30),
  sede: site.optional(),
  fecha_cita: z.string().max(40).optional(),
  por_garantia: z.boolean().optional().default(false),
  siguiente_paso: nextStep.optional(),
  acciones_disponibles: z.array(z.string().max(60)).max(20).optional(),
});

/**
 * `consultar_manipulacion` (decisión 135): si a un componente de un VIN ya se le hizo algo (reparación, cambio de
 * repuesto, manipulación del cliente o trabajo de otro taller). Solo se usan el sí/no y el tipo y la fecha de cada evento.
 */
export const tamperingSchema = z.object({
  manipulado: z.boolean(),
  eventos: z.array(z.object({
    fecha: z.string().max(40).optional(),
    tipo: z.string().max(40),
    especialidad: z.string().max(40).optional(),
    sku: z.string().max(40).optional(),
    codigo: z.string().max(20).optional(),
  })).max(50).default([]),
});

/** `listar_ordenes { id_relacion, abiertas: true }`: se usa solo para confirmar una cita tras un reintento. */
export const ordersSchema = z
  .object({ elementos: z.array(workOrderSchema).max(50).optional(), ordenes: z.array(workOrderSchema).max(50).optional() })
  .transform((data) => data.elementos ?? data.ordenes ?? []);
