import { createHash } from 'node:crypto';
import { sanitizeText } from '../common/text.js';

/** Los campos de un vehículo que entran al texto embebido. Deliberadamente SIN precio ni kilometraje. */
export interface EmbeddableVehicle {
  brandName: string;
  model: string;
  version: string;
  year: number;
  fuel: string;
  transmission: string;
  status: string;
  color: string;
  description: string | null;
}

const MAX_DESCRIPTION = 800;

/**
 * Texto que se convierte en vector: marca, modelo, versión, año, combustible, transmisión, estado, color y
 * descripción saneada (máx. 800). El precio y el kilometraje NO van: cambian seguido y harían que un vector
 * viejo "recordara" un precio que ya no es; el precio siempre sale de la fila actual.
 */
export function buildEmbeddingText(vehicle: EmbeddableVehicle): string {
  const parts = [
    `${vehicle.brandName} ${vehicle.model} ${vehicle.version}`.trim(),
    `año ${vehicle.year}`,
    `combustible ${vehicle.fuel}`,
    `transmisión ${vehicle.transmission}`,
    `estado ${vehicle.status}`,
    `color ${vehicle.color}`,
  ];
  const description = vehicle.description ? sanitizeText(vehicle.description, MAX_DESCRIPTION) : '';
  if (description) parts.push(description);
  return parts.join('. ');
}

/** sha256 del texto más el nombre del modelo: si cualquiera cambia, el vector se recalcula. */
export function embeddingHash(text: string, model: string): string {
  return createHash('sha256').update(`${model}\n${text}`).digest('hex');
}
