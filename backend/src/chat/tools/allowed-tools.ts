/** Única tool activa por defecto: el chatbot queda limitado a la ficha pública por VIN. */
export const DEFAULT_ALLOWED_TOOLS: readonly string[] = ['consultar_ficha_vin'];

/**
 * Lista blanca de tools (`CHAT_ALLOWED_TOOLS`, nombres separados por coma). Se lee en cada uso, no al importar.
 * Las tools que no estén aquí se siguen compilando pero ni se ofrecen al modelo ni se ejecutan.
 * Vacía o sin definir = solo la ficha por VIN. Reactivar una tool = agregarla a la lista (ver decisión 128).
 */
export function allowedTools(env: string | undefined = process.env.CHAT_ALLOWED_TOOLS): ReadonlySet<string> {
  const names = (env ?? '').split(',').map((name) => name.trim()).filter(Boolean);
  return new Set(names.length > 0 ? names : DEFAULT_ALLOWED_TOOLS);
}

export function isToolAllowed(name: string): boolean {
  return allowedTools().has(name);
}
