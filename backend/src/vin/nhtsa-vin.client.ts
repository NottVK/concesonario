import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { z } from 'zod';
import { sanitizeText } from '../common/text.js';

/**
 * Decodificación de un VIN en la base pública de la NHTSA de EE. UU. (vPIC: gratuita y sin clave). Solo se envía el
 * VIN, nunca datos del cliente. Lo que responde es un DATO externo: se valida con zod, se sanea y se recorta. Si no
 * responde a tiempo o no conoce el VIN (los fabricados en Colombia no están registrados allá), devuelve null y queda
 * la lectura local. Se apaga con VIN_DECODER_EXTERNAL=false.
 */

export interface ExternalVinData {
  source: 'NHTSA vPIC';
  make: string | null;
  model: string | null;
  year: number | null;
  trim: string | null;
  bodyClass: string | null;
  doors: number | null;
  engine: string | null;
  fuel: string | null;
  transmission: string | null;
  plantCountry: string | null;
  manufacturer: string | null;
}

/** Interfaz para inyectar el decodificador externo (en las pruebas se reemplaza). */
export abstract class ExternalVinDecoder {
  abstract decode(vin: string): Promise<ExternalVinData | null>;
}

const NHTSA_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues';
const TIMEOUT_MS = 8000;
const CACHE_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

const text = z.string().max(300).optional().nullable();
const responseSchema = z.object({
  Results: z.array(z.object({
    Make: text, Model: text, ModelYear: text, Trim: text, Series: text, BodyClass: text, Doors: text, DisplacementL: text,
    EngineCylinders: text, FuelTypePrimary: text, TransmissionStyle: text, PlantCountry: text, Manufacturer: text, ErrorCode: text,
  })).min(1),
});
type NhtsaRow = z.output<typeof responseSchema>['Results'][number];

const FUEL: Record<string, string> = { gasoline: 'Gasolina', diesel: 'Diésel', electric: 'Eléctrico', 'flexible fuel vehicle (ffv)': 'Flex (gasolina/etanol)' };
const BODY: Record<string, string> = {
  coupe: 'Coupé', 'sedan/saloon': 'Sedán', sedan: 'Sedán', 'hatchback/liftback/notchback': 'Hatchback', convertible: 'Convertible',
  'sport utility vehicle (suv)/multi-purpose vehicle (mpv)': 'SUV', 'crossover utility vehicle (cuv)': 'Crossover', pickup: 'Pickup', 'minivan': 'Minivan', wagon: 'Station wagon',
};
const COUNTRY: Record<string, string> = {
  'united states (usa)': 'Estados Unidos', mexico: 'México', canada: 'Canadá', japan: 'Japón', 'south korea': 'Corea del Sur',
  germany: 'Alemania', brazil: 'Brasil', china: 'China', france: 'Francia', spain: 'España', italy: 'Italia', 'united kingdom (uk)': 'Reino Unido',
};
const TRANSMISSION: Record<string, string> = { automatic: 'Automática', manual: 'Manual', 'manual/standard': 'Manual', 'continuously variable transmission (cvt)': 'Automática CVT' };

export function externalDecoderEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VIN_DECODER_EXTERNAL?.trim().toLowerCase() !== 'false';
}

@Injectable()
export class NhtsaVinClient extends ExternalVinDecoder {
  private readonly logger = new Logger(NhtsaVinClient.name);
  private readonly http: AxiosInstance;
  private readonly cache = new Map<string, { at: number; data: ExternalVinData | null }>();

  constructor() {
    super();
    this.http = axios.create({ timeout: TIMEOUT_MS, maxRedirects: 0, maxContentLength: 200_000, proxy: false, validateStatus: (s) => s === 200 });
  }

  async decode(vin: string): Promise<ExternalVinData | null> {
    const cached = this.cache.get(vin);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;
    const data = await this.fetch(vin);
    if (this.cache.size >= CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(vin, { at: Date.now(), data });
    return data;
  }

  private async fetch(vin: string): Promise<ExternalVinData | null> {
    const started = Date.now();
    try {
      const response = await this.http.get<unknown>(`${NHTSA_URL}/${encodeURIComponent(vin)}`, { params: { format: 'json' } });
      const parsed = responseSchema.safeParse(response.data);
      return parsed.success ? toData(parsed.data.Results[0]!) : null;
    } catch (error) {
      // Solo el nombre del error y el tiempo: el mensaje podría traer la URL completa.
      this.logger.warn(`NHTSA no respondió a los ${Date.now() - started} ms (${error instanceof Error ? error.name : 'error'})`);
      return null;
    }
  }
}

const clean = (value: string | null | undefined, max = 80): string | null => {
  const out = sanitizeText(value ?? '', max).trim();
  return out && out !== 'Not Applicable' ? out : null;
};

const number = (value: string | null | undefined): number | null => {
  const n = Number(value);
  return value && Number.isFinite(n) && n > 0 ? n : null;
};

const titleCase = (value: string | null): string | null => (value ? value.toLowerCase().replace(/(^|[\s(])\p{L}/gu, (m) => m.toUpperCase()) : null);

/** null si la NHTSA no reconoce el fabricante (código 7), trae caracteres inválidos (400) o no dio ni la marca. */
export function toData(row: NhtsaRow): ExternalVinData | null {
  const codes = (row.ErrorCode ?? '').split(',').map((c) => c.trim());
  if (codes.includes('7') || codes.includes('400') || !clean(row.Make)) return null;
  const liters = number(row.DisplacementL);
  const cylinders = number(row.EngineCylinders);
  const engine = [liters ? `${liters.toFixed(1)} L` : null, cylinders ? `${cylinders} cilindros` : null].filter(Boolean).join(', ') || null;
  const fuel = clean(row.FuelTypePrimary);
  const transmission = clean(row.TransmissionStyle);
  const body = clean(row.BodyClass);
  const plant = clean(row.PlantCountry);
  return {
    source: 'NHTSA vPIC',
    make: titleCase(clean(row.Make)),
    model: clean(row.Model),
    year: number(row.ModelYear),
    trim: clean(row.Trim) ?? clean(row.Series),
    bodyClass: body ? (BODY[body.toLowerCase()] ?? body) : null,
    doors: number(row.Doors),
    engine,
    fuel: fuel ? (FUEL[fuel.toLowerCase()] ?? fuel) : null,
    transmission: transmission ? (TRANSMISSION[transmission.toLowerCase()] ?? transmission) : null,
    plantCountry: plant ? (COUNTRY[plant.toLowerCase()] ?? titleCase(plant)) : null,
    manufacturer: clean(row.Manufacturer, 120),
  };
}
