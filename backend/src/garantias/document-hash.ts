import { createHmac } from 'node:crypto';

/** Solo dígitos: «1.020.304.050», «1020304050» y «CC 1020304050» dan el mismo documento. */
export function normalizeDocument(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Cédulas de 6 a 12 dígitos. */
export function isValidDocument(normalized: string): boolean {
  return /^\d{6,12}$/.test(normalized);
}

/**
 * HMAC del documento con el pepper del servidor: en la base no queda el documento y quien robe la tabla no puede
 * probar cédulas sin el pepper. El prefijo separa este uso del de las keys de bots.
 */
export function hashDocument(raw: string): string {
  const pepper = process.env.MCP_KEY_PEPPER;
  if (!pepper) throw new Error('Falta MCP_KEY_PEPPER: sin él no se pueden verificar documentos');
  return createHmac('sha256', `garantia-documento:${pepper}`).update(normalizeDocument(raw)).digest('hex');
}
