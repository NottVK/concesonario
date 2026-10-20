/**
 * Palabras en español natural para los valores internos de los enums (que van sin tildes). Se usan donde el
 * texto lo lee una persona o un modelo de lenguaje: el seed y los embeddings.
 */
export const FUEL_LABEL: Record<string, string> = {
  gasolina: 'gasolina',
  diesel: 'diésel',
  hibrido: 'híbrido',
  electrico: 'eléctrico',
};

export const TRANSMISSION_LABEL: Record<string, string> = {
  manual: 'manual',
  automatica: 'automática',
};

export const label = (map: Record<string, string>, value: string): string => map[value] ?? value;
