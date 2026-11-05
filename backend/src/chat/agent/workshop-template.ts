/**
 * Respuesta de respaldo con los datos de las tools del taller (decisión 131), para cuando el modelo no logra una
 * respuesta válida. Nada de aquí viene del modelo.
 */
interface ToolResults {
  last(tool: string): Record<string, unknown> | undefined;
}

const str = (value: unknown): string => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');

function siteText(value: unknown): string {
  const site = (value ?? {}) as Record<string, unknown>;
  return [str(site.nombre), str(site.direccion)].filter(Boolean).join(', ');
}

function booked(data: Record<string, unknown>): string {
  const next = str(data.siguiente_paso);
  return `¡Listo! Tu cita en el taller quedó agendada: orden ${str(data.orden)} en ${siteText(data.sede)}, el ${str(data.fecha)}.${next ? ` ${next}.` : ''}`;
}

function slots(data: Record<string, unknown>): string {
  const list = Array.isArray(data.franjas) ? (data.franjas as Record<string, unknown>[]) : [];
  if (list.length === 0) return `${siteText(data.sede)} no tiene horas libres en esas fechas. ¿Quieres que busque otro día?`;
  return `Horas libres en ${siteText(data.sede)}: ${list.map((f, i) => `${i + 1}. ${str(f.texto)}`).join('; ')}. ¿Cuál prefieres?`;
}

/** El prediagnóstico en pocas líneas: especialidad, servicios con precio, garantía y sede recomendada. */
function diagnosisSummary(data: Record<string, unknown>): string {
  const services = Array.isArray(data.servicios_probables) ? (data.servicios_probables as Record<string, unknown>[]) : [];
  const list = services.map((s) => `${str(s.nombre)} (${str(s.precio_texto)})`).join('; ');
  const warranty = (data.garantia ?? null) as Record<string, unknown> | null;
  const warrantyText = warranty ? (warranty.vigente === true ? ' Tu garantía está vigente.' : ' Tu garantía ya no está vigente.') : '';
  const site = data.sede_recomendada ? ` Te recomiendo llevarlo a ${siteText(data.sede_recomendada)}.` : '';
  const likely = list ? ` Lo más probable es: ${list}.` : '';
  return `Según el prediagnóstico del taller, parece un tema de ${str(data.especialidad)}.${likely}${warrantyText}${site} Es un prediagnóstico: el valor final lo confirma el taller.`;
}

function prediagnosis(data: Record<string, unknown>): string {
  return `${diagnosisSummary(data)} ¿Te busco horas libres?`;
}

/**
 * Si en este turno hubo prediagnóstico y la respuesta no lo muestra (ningún precio, o la especialidad si no hay precios), se antepone el
 * resumen con los datos del taller: el cliente siempre ve el prediagnóstico antes de elegir hora. El orden de los
 * pasos lo sigue decidiendo el modelo.
 */
export function withPrediagnosis(reply: string, results: ToolResults): string {
  const data = results.last('prediagnosticar_taller');
  if (!data || typeof data.especialidad !== 'string') return reply;
  const services = Array.isArray(data.servicios_probables) ? (data.servicios_probables as Record<string, unknown>[]) : [];
  const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  // Con precios, se exige al menos uno (la especialidad puede aparecer solo en el nombre de la sede: «Motor y Eléctrico»).
  const prices = services.map((s) => str(s.precio_texto)).filter(Boolean);
  const shown = prices.length > 0 ? prices.some((price) => reply.includes(price)) : fold(reply).includes(fold(data.especialidad));
  if (shown) return reply;
  return `${diagnosisSummary(data)}\n\n${reply}`;
}

const ASK_REASON = 'Y cuéntame, por favor, el motivo por el cual estás cobrando la garantía.';

/**
 * Si el cliente viene por la garantía sin decir el motivo y el modelo le pide el documento sin preguntarle por qué,
 * se agrega la pregunta: el motivo del reclamo es lo que el taller recibe para validar la garantía.
 */
export function withWarrantyReason(reply: string, userMessage: string): string {
  if (!/garant[ií]a/i.test(userMessage)) return reply;
  if (/\b(porque|ya que|debido|pues)\b/i.test(userMessage)) return reply;
  if (!/\b(DNI|documento)\b/i.test(reply) || /\b(motivo|por qu[eé]|qu[eé] (le )?pas)/i.test(reply)) return reply;
  return `${reply} ${ASK_REASON}`;
}

export function workshopTemplate(results: ToolResults): string | null {
  const book = results.last('agendar_cita_taller');
  if (book?.agendada === true) return booked(book);
  const held = results.last('apartar_hora_taller');
  if (held?.apartada === true) return `Te aparté ${str(held.fecha)} en ${siteText(held.sede)}. ¿Confirmas la cita?`;
  const hours = results.last('consultar_horarios_taller');
  if (hours) return slots(hours);
  const diagnosis = results.last('prediagnosticar_taller');
  if (diagnosis) return prediagnosis(diagnosis);
  const who = results.last('identificar_cliente_taller');
  if (who) return `Encontré tu ${str(who.vehiculo)} de placa ${str(who.placa)}. Cuéntame qué le pasa al carro.`;
  return null;
}
