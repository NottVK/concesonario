import { centsToMoney, MONEY_REGEX, moneyToCents } from '../../common/money.js';
import { safeDescription, safeField } from '../text/sanitize.js';
import type { VehicleCard } from './tool-types.js';

/** Vehículo tal como lo devuelve la API pública (solo los campos que usa el bot). */
export interface ApiVehicle {
  id: number;
  brand?: { name?: string };
  model: string;
  year: number;
  version: string;
  price: string;
  mileage: number;
  fuel: string;
  transmission: string;
  color: string;
  status: string;
  description?: string | null;
  images?: string[];
}

/** 95000000.00 → "$95.000.000" (pesos enteros, puntos de miles, como se escribe en Colombia). */
export function formatPesos(amount: string | number): string {
  const text = typeof amount === 'number' ? String(amount) : amount;
  if (!MONEY_REGEX.test(text)) return '$?';
  const pesos = (moneyToCents(text) + 50n) / 100n;
  return `$${pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

export function vehicleTitle(v: ApiVehicle): string {
  return [safeField(v.brand?.name ?? ''), safeField(v.model), safeField(v.version)].filter(Boolean).join(' ');
}

/** Lista blanca de campos hacia el modelo: sin imágenes, sin ids internos aparte del propio id. */
export function vehicleForModel(v: ApiVehicle): Record<string, unknown> {
  const description = safeDescription(v.description);
  return {
    id: v.id,
    marca: safeField(v.brand?.name ?? ''),
    modelo: safeField(v.model),
    version: safeField(v.version),
    anio: v.year,
    precio: v.price,
    precio_texto: formatPesos(v.price),
    combustible: safeField(v.fuel),
    transmision: safeField(v.transmission),
    color: safeField(v.color),
    estado: safeField(v.status),
    km: v.mileage,
    ...(description ? { descripcion: description } : {}),
  };
}

const IMAGE_PATH = /^\/autos\/[\w./-]{1,150}$/;

export function vehicleCard(v: ApiVehicle): VehicleCard {
  const image = v.images?.find((path) => IMAGE_PATH.test(path) && !path.includes('..')) ?? null;
  return {
    id: v.id,
    title: vehicleTitle(v),
    year: v.year,
    price: v.price,
    priceText: formatPesos(v.price),
    fuel: safeField(v.fuel),
    transmission: safeField(v.transmission),
    mileage: v.mileage,
    status: safeField(v.status),
    image,
  };
}

/** Diferencia absoluta entre dos precios, calculada en centavos (el modelo nunca resta). */
export function priceDifference(a: string, b: string): string {
  const diff = moneyToCents(a) - moneyToCents(b);
  return centsToMoney(diff < 0n ? -diff : diff);
}

/** Mensaje de error de la API (string o lista) listo para mostrar; nunca el cuerpo completo. */
export function apiMessage(data: unknown, fallback: string): string {
  const message = (data as { message?: unknown } | null)?.message;
  if (typeof message === 'string') return safeField(message, 200);
  if (Array.isArray(message) && typeof message[0] === 'string') return safeField(message[0], 200);
  return fallback;
}
