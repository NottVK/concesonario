/** Número que parece un documento (7 a 12 dígitos, o con puntos: 1.020.304.050). */
const DOCUMENT_LIKE = /\b\d{1,3}(?:[.,]\d{3}){2,3}\b|\b\d{7,12}\b/g;

export const DOCUMENT_PLACEHOLDER = '[documento]';

/** El documento no debe llegar al modelo, al historial ni a los logs: se reemplaza antes de usar el texto. */
export function redactDocuments(text: string): string {
  return text.replace(DOCUMENT_LIKE, DOCUMENT_PLACEHOLDER);
}
