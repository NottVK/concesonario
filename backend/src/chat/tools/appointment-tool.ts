import { APPOINTMENT_DURATION_MIN, BUSINESS_TIME_ZONE, SLOT_UNAVAILABLE_MESSAGE, validateSlot } from '../../citas/appointment-rules.js';
import { parseArgs } from './args.js';
import { apiMessage, vehicleTitle } from './format.js';
import type { ApiVehicle } from './format.js';
import { toolError } from './tool-types.js';
import type { ChatTool } from './tool-types.js';

// Colombia no tiene horario de verano: el desfase de Bogotá es siempre -05:00.
const BOGOTA_OFFSET = '-05:00';

interface Availability {
  busy: { startsAt: string; endsAt: string }[];
}

const dayFormat = new Intl.DateTimeFormat('es-CO', {
  timeZone: BUSINESS_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const timeFormat = new Intl.DateTimeFormat('es-CO', {
  timeZone: BUSINESS_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** «sábado 7 de noviembre, 10:00 a. m. (hora de Bogotá)»; lo arma el servidor, nunca el modelo. */
export function describeSlot(start: Date): string {
  return `${dayFormat.format(start)}, ${timeFormat.format(start)} (hora de Bogotá)`;
}

/**
 * SOLO PROPONE: valida la cita con las mismas reglas que `POST /citas` y guarda una propuesta de un solo uso.
 * La cita real se crea cuando la persona confirma en el widget con sus datos; esta tool nunca llama a POST /citas.
 */
export const agendarCita: ChatTool = {
  name: 'agendar_cita',
  definition: {
    name: 'agendar_cita',
    description:
      'Prepara una propuesta de test-drive (NO la agenda: la persona debe confirmarla en pantalla). ' +
      'Pasa el id del vehículo, la fecha (AAAA-MM-DD) y la hora (HH:MM, 24 horas, hora de Bogotá). Atendemos de lunes a sábado de 8:00 a 18:00; cada visita dura 60 minutos.',
    parameters: {
      type: 'object',
      properties: {
        vehicleId: { type: 'integer', minimum: 1 },
        date: { type: 'string', description: 'Fecha AAAA-MM-DD' },
        time: { type: 'string', description: 'Hora HH:MM en formato de 24 horas' },
      },
      required: ['vehicleId', 'date', 'time'],
    },
  },
  async run(raw, ctx) {
    const parsed = parseArgs(raw, {
      vehicleId: { kind: 'int', min: 1, max: 2_147_483_647, required: true },
      date: { kind: 'str', max: 10, pattern: /^\d{4}-\d{2}-\d{2}$/, required: true },
      time: { kind: 'str', max: 5, pattern: /^([01]\d|2[0-3]):[0-5]\d$/, required: true },
    });
    if (!parsed.ok) return toolError(parsed.error);
    const { vehicleId, date, time } = parsed.value as { vehicleId: number; date: string; time: string };
    if (!ctx.seen.has(vehicleId)) return toolError('Ese id no salió de una búsqueda de esta conversación. Usa buscar_vehiculos primero.');

    const startsAtIso = `${date}T${time}:00${BOGOTA_OFFSET}`;
    const start = new Date(startsAtIso);
    const problem = validateSlot(start, APPOINTMENT_DURATION_MIN, ctx.now);
    if (problem) return toolError(problem);

    const vehicle = await ctx.api.get<ApiVehicle>(`/vehiculos/${vehicleId}`);
    if (vehicle.status !== 200) return toolError('No encontré ese vehículo.');
    if (vehicle.data.status === 'vendido') return toolError('Ese vehículo ya fue vendido; no se puede agendar.');

    const end = new Date(start.getTime() + APPOINTMENT_DURATION_MIN * 60_000);
    const availability = await ctx.api.get<Availability>(`/vehiculos/${vehicleId}/disponibilidad`, {
      from: new Date(start.getTime() - 60 * 60_000).toISOString(),
      to: new Date(end.getTime() + 60 * 60_000).toISOString(),
    });
    if (availability.status !== 200) return toolError(apiMessage(availability.data, 'No pude revisar la disponibilidad ahora.'));
    const overlaps = availability.data.busy.some((slot) => new Date(slot.startsAt) < end && new Date(slot.endsAt) > start);
    if (overlaps) return toolError(SLOT_UNAVAILABLE_MESSAGE);

    const label = vehicleTitle(vehicle.data);
    const summary = `Test-drive del ${label}, ${describeSlot(start)}`;
    const proposal = await ctx.createProposal({ vehicleId, vehicleLabel: label, startsAt: start, summary });
    return {
      data: {
        estado: 'propuesta_pendiente_de_confirmacion',
        resumen: summary,
        mensaje:
          'La propuesta está lista y NO está agendada. Dile a la persona que revise la tarjeta de la pantalla y que ' +
          'confirme con su nombre, correo y teléfono. No digas que la cita quedó agendada.',
      },
      proposal,
      seen: [vehicleId],
    };
  },
};
