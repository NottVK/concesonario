import type { ReadOnlyApi } from '../api/public-api.client.js';
import { safeField } from '../text/sanitize.js';

/**
 * Respuesta a un VIN sin el modelo (decisión 129): si el mensaje trae un VIN, el código consulta `GET /vin/:vin`
 * por la lista blanca y arma la respuesta con una plantilla. Es inmediata y no puede inventar datos.
 */

/** Datos de `GET /vin/:vin` (solo los campos que usa el bot). */
export interface ApiVinInfo {
  vin: string;
  registered: boolean;
  brand: string | null;
  model: string | null;
  year: number | null;
  version: string | null;
  bodyType: string | null;
  doors: number | null;
  engine: string | null;
  fuel: string | null;
  transmission: string | null;
  source?: 'registro' | 'nhtsa' | 'estructura';
  structure?: ApiVinStructure;
  external?: { plantCountry: string | null } | null;
}

/** Qué significa cada parte del VIN, según `GET /vin/:vin` (decisión 132). */
export interface ApiVinStructure {
  wmi: string;
  manufacturer: string | null;
  region: string;
  country: string | null;
  vds: string;
  checkDigitValid: boolean;
  yearCode: string;
  year: number | null;
  plantCode: string;
  serial: string;
}

// 17 caracteres sin I, O ni Q (con /i el rango tampoco acepta i, o ni q), separados de otras letras o números.
const VIN_IN_TEXT = /(?<![A-Za-z0-9])[A-HJ-NPR-Z0-9]{17}(?![A-Za-z0-9])/gi;
// Una "palabra" de 11 a 20 letras y números con al menos un dígito: parece un VIN mal escrito.
const VIN_LIKE = /(?<![A-Za-z0-9])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{11,20}(?![A-Za-z0-9])/;

export const VIN_INVALID_REPLY = 'Ese VIN no parece válido: debe tener 17 caracteres, letras y números, sin I, O ni Q. Revísalo en la tarjeta de propiedad o en el parabrisas.';
export const VIN_UNAVAILABLE_REPLY = 'No pude consultar ese VIN en este momento. Intenta de nuevo en un rato.';

/** El primer VIN del mensaje, en mayúsculas; debe tener letras y números (una palabra larga no es un VIN). */
export function findVin(message: string): string | null {
  for (const match of message.matchAll(VIN_IN_TEXT)) {
    const candidate = match[0].toUpperCase();
    if (/\d/.test(candidate) && /[A-Z]/.test(candidate)) return candidate;
  }
  return null;
}

/** El mensaje dice "VIN" y trae un código que no tiene el formato: se avisa en vez de mandarlo al modelo. */
export function mentionsInvalidVin(message: string): boolean {
  return /\bvin\b/i.test(message) && VIN_LIKE.test(message);
}

/** Consulta la API y arma el texto. Lanza si la API no responde (quien llama decide el mensaje y lo registra). */
export async function vinReply(api: ReadOnlyApi, vin: string): Promise<string> {
  const response = await api.get<ApiVinInfo>(`/vin/${vin}`);
  if (response.status === 400) return VIN_INVALID_REPLY;
  if (response.status !== 200) return VIN_UNAVAILABLE_REPLY;
  return describeVin(response.data);
}

export function describeVin(info: ApiVinInfo): string {
  const vin = safeField(info.vin);
  const code = info.structure ? codeMeaning(info.structure) : '';
  if (info.registered) return [`Estos son los datos del VIN ${vin}:`, ...dataLines(info), code].filter(Boolean).join('\n');
  if (info.source === 'nhtsa') {
    const plant = info.external?.plantCountry ? [`• Planta: ${safeField(info.external.plantCountry)}`] : [];
    return [`El VIN ${vin} no está en nuestro registro, pero en la base pública de la NHTSA (EE. UU.) aparece así:`, ...dataLines(info), ...plant, code].filter(Boolean).join('\n');
  }
  return [unregistered(vin, info.brand ? safeField(info.brand) : null, info.year), code].filter(Boolean).join('\n');
}

function dataLines(info: ApiVinInfo): string[] {
  const lines = [
    ['Marca', info.brand],
    ['Modelo', info.model],
    ['Año', info.year],
    ['Versión', info.version],
    ['Carrocería', info.bodyType && info.doors ? `${info.bodyType} de ${info.doors} puertas` : info.bodyType],
    ['Motor', [info.engine, info.fuel].filter(Boolean).join(', ')],
    ['Transmisión', info.transmission],
  ].filter(([, value]) => value !== null && value !== undefined && value !== '');
  return lines.map(([name, value]) => `• ${name}: ${safeField(String(value))}`);
}

/** Qué significa el código, en lenguaje natural: origen, año, serie y el dígito verificador. */
export function codeMeaning(s: ApiVinStructure): string {
  const where = s.country ? `${safeField(s.country)} (${safeField(s.region)})` : safeField(s.region);
  const maker = s.manufacturer ? `, fabricante ${safeField(s.manufacturer)}` : '';
  const year = s.year ? ` La posición 10 (${safeField(s.yearCode)}) indica que es modelo ${s.year}.` : '';
  return `Qué dice el código: las posiciones 1 a 3 (${safeField(s.wmi)}) indican que se fabricó en ${where}${maker}.${year} ` +
    `Las posiciones 4 a 8 (${safeField(s.vds)}) describen el modelo y el motor, la 11 (${safeField(s.plantCode)}) la planta y las últimas seis (${safeField(s.serial)}) son el número de serie. ` +
    checkDigitText(s);
}

function checkDigitText(s: ApiVinStructure): string {
  if (s.checkDigitValid) return `El dígito verificador (posición 9) es correcto.`;
  if (s.region === 'Norteamérica') return `Ojo: el dígito verificador (posición 9) no cuadra; revisa que el VIN esté bien escrito.`;
  return `El dígito verificador (posición 9) no cuadra, algo común en vehículos fabricados fuera de Norteamérica.`;
}

function unregistered(vin: string, brand: string | null, year: number | null): string {
  const start = `El VIN ${vin} no está en nuestro registro.`;
  if (brand && year) {
    return `${start} Por su estructura es un ${brand} modelo ${year} (las tres primeras letras indican el fabricante y la posición 10, el año). Para la versión y el motor, consulta con un asesor.`;
  }
  if (brand) return `${start} Por sus tres primeras letras es un ${brand}. Para el resto de datos, consulta con un asesor.`;
  return `${start} No reconozco su fabricante (${vin.slice(0, 3)})${year ? ` y, según la posición 10, es modelo ${year}` : ''}. Revisa que esté bien escrito o consulta con un asesor.`;
}
