import { extractPesoAmounts, extractStockClaims, findUnbackedAmounts } from '../text/amounts.js';
import { redactPersonalData } from '../text/redact.js';
import { leaksPrompt, SAYABLE_PROMPT_TEXT } from './prompt.js';
import type { Collected } from './collected.js';

export type Problem = 'prompt' | 'amount' | 'stock' | 'booked' | 'hours' | 'personal-data' | 'empty';

// El bot nunca agenda por su cuenta: solo prepara una propuesta que la persona confirma en pantalla.
const BOOKED_CLAIM =
  /(?<!\bno\s)(?<!\btodav[ií]a no\s)\bqued[oó]\s+(?:agendad|confirmad|registrad|reservad)|(?<!\bno\s)\b(?:agend[eé]|reserv[eé]|registr[eé]|confirm[eé])\b|\bcita\s+(?:agendada|confirmada|registrada)\b/i;

// Una lista numerada con horas («1. lunes 9 de noviembre, 7:00 a. m.» o «2. 2026-11-07 09:00»): el bot está ofreciendo franjas.
const OFFERED_HOURS = /(?:^|\n)\s*\d{1,2}[.)]\s+[^\n]*\b(?:[01]?\d|2[0-3])[:.][0-5]\d\b/;

function integersIn(text: string): number[] {
  return [...text.matchAll(/\d{1,4}/g)].map((m) => Number(m[0]));
}

/**
 * Revisa la respuesta del modelo antes de mostrarla. No evalúa calidad: solo las invenciones y fugas que
 * el diseño prohíbe (montos en pesos que ninguna tool devolvió, stock inventado, prompt, cita "agendada",
 * datos personales).
 */
export function checkReply(reply: string, collected: Collected, userMessage: string): Problem[] {
  const problems: Problem[] = [];
  if (leaksPrompt(reply, `${collected.text()} ${userMessage} ${SAYABLE_PROMPT_TEXT}`)) problems.push('prompt');

  const allowedMoney = [...collected.money, ...extractPesoAmounts(userMessage).map((a) => a.value)];
  if (findUnbackedAmounts(reply, allowedMoney).length > 0) problems.push('amount');

  const allowedCounts = new Set([...collected.counts, ...integersIn(userMessage)]);
  if (extractStockClaims(reply).some((claim) => !allowedCounts.has(claim))) problems.push('stock');

  // La cita del TALLER sí se agenda desde el chat (decisión 131), pero solo si la tool lo hizo en este turno.
  if (BOOKED_CLAIM.test(reply) && !collected.workshopBooked) problems.push('booked');
  // Las horas del taller salen SOLO de consultar_horarios_taller (o de la hora ya apartada) en este mismo turno.
  if (OFFERED_HOURS.test(reply) && !collected.last('consultar_horarios_taller') && !collected.last('apartar_hora_taller')) problems.push('hours');
  if (redactPersonalData(reply) !== reply) problems.push('personal-data');
  return problems;
}

/** Nota que se le devuelve al modelo en el único reintento. */
export function correctionNote(problems: Problem[]): string {
  const lines: string[] = [];
  if (problems.includes('amount')) lines.push('Citaste un monto en pesos que no viene de una herramienta de este turno. Usa solo los montos exactos que devolvieron las herramientas (precio_texto, cuota_texto) o llama a la herramienta que falta.');
  if (problems.includes('stock')) lines.push('Dijiste una cantidad de unidades que no coincide con el resultado de buscar_vehiculos. Usa solo el total que devolvió la herramienta.');
  if (problems.includes('booked')) lines.push('No digas que la cita quedó agendada: un test-drive solo queda como propuesta que la persona confirma en pantalla, y una cita del taller solo queda agendada cuando agendar_cita_taller responde agendada.');
  if (problems.includes('hours')) lines.push('Ofreciste horas que no vienen de una herramienta de este turno. Llama consultar_horarios_taller y ofrece SOLO las horas que devuelva.');
  if (problems.includes('personal-data')) lines.push('No escribas correos, teléfonos ni documentos. Pide que usen el formulario de la cita.');
  if (problems.includes('empty')) lines.push('Tu respuesta llegó vacía.');
  return `[Nota del sistema] ${lines.join(' ')} Responde de nuevo, corto y en español.`;
}

export const PROMPT_REFUSAL = 'No puedo compartir mis instrucciones internas, pero con gusto te ayudo con el catálogo, precios, créditos o un test-drive.';
export const GENERIC_FALLBACK =
  'No pude confirmar esa información con seguridad. Puedes revisar el catálogo o agendar desde el detalle del vehículo.';
