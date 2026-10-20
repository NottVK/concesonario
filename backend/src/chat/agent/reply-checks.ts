import { extractPesoAmounts, extractStockClaims, findUnbackedAmounts } from '../text/amounts.js';
import { redactPersonalData } from '../text/redact.js';
import { leaksPrompt } from './prompt.js';
import type { Collected } from './collected.js';

export type Problem = 'prompt' | 'amount' | 'stock' | 'booked' | 'personal-data' | 'empty';

// El bot nunca agenda por su cuenta: solo prepara una propuesta que la persona confirma en pantalla.
const BOOKED_CLAIM =
  /(?<!\bno\s)(?<!\btodav[ií]a no\s)\bqued[oó]\s+(?:agendad|confirmad|registrad|reservad)|(?<!\bno\s)\b(?:agend[eé]|reserv[eé]|registr[eé]|confirm[eé])\b|\bcita\s+(?:agendada|confirmada|registrada)\b/i;

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
  if (leaksPrompt(reply, `${collected.text()} ${userMessage}`)) problems.push('prompt');

  const allowedMoney = [...collected.money, ...extractPesoAmounts(userMessage).map((a) => a.value)];
  if (findUnbackedAmounts(reply, allowedMoney).length > 0) problems.push('amount');

  const allowedCounts = new Set([...collected.counts, ...integersIn(userMessage)]);
  if (extractStockClaims(reply).some((claim) => !allowedCounts.has(claim))) problems.push('stock');

  if (BOOKED_CLAIM.test(reply)) problems.push('booked');
  if (redactPersonalData(reply) !== reply) problems.push('personal-data');
  return problems;
}

/** Nota que se le devuelve al modelo en el único reintento. */
export function correctionNote(problems: Problem[]): string {
  const lines: string[] = [];
  if (problems.includes('amount')) lines.push('Citaste un monto en pesos que no viene de una herramienta de este turno. Usa solo los montos exactos que devolvieron las herramientas (precio_texto, cuota_texto) o llama a la herramienta que falta.');
  if (problems.includes('stock')) lines.push('Dijiste una cantidad de unidades que no coincide con el resultado de buscar_vehiculos. Usa solo el total que devolvió la herramienta.');
  if (problems.includes('booked')) lines.push('No digas que la cita quedó agendada: solo hay una propuesta pendiente que la persona debe confirmar en pantalla.');
  if (problems.includes('personal-data')) lines.push('No escribas correos, teléfonos ni documentos. Pide que usen el formulario de la cita.');
  if (problems.includes('empty')) lines.push('Tu respuesta llegó vacía.');
  return `[Nota del sistema] ${lines.join(' ')} Responde de nuevo, corto y en español.`;
}

export const PROMPT_REFUSAL = 'No puedo compartir mis instrucciones internas, pero con gusto te ayudo con el catálogo, precios, créditos o un test-drive.';
export const GENERIC_FALLBACK =
  'No pude confirmar esa información con seguridad. Puedes revisar el catálogo o agendar desde el detalle del vehículo.';
