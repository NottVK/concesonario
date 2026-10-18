/** Escapa %, _ y \ para usar texto del usuario dentro de un LIKE/ILIKE. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}
