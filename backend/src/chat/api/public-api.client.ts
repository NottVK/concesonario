import { Injectable } from '@nestjs/common';
import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { INTERNAL_HEADER, InternalSecret } from '../security/internal-secret.js';

/** Respuesta de la API ya interpretada; los errores HTTP no lanzan, los decide quien llama. */
export interface ApiResult<T = unknown> {
  status: number;
  data: T;
}

/** No hubo respuesta de la API (caída, tiempo agotado). */
export class ApiUnreachableError extends Error {
  constructor() {
    super('La API no respondió');
    this.name = 'ApiUnreachableError';
  }
}

/** Se intentó una ruta fuera de la lista blanca: se rechaza ANTES de tocar la red. */
export class RouteNotAllowedError extends Error {
  constructor(method: string, path: string) {
    super(`Ruta no permitida para el bot: ${method} ${path}`);
    this.name = 'RouteNotAllowedError';
  }
}

interface AllowedRoute {
  method: 'GET' | 'POST';
  path: RegExp;
}

/**
 * Lo único que el bot puede pedirle a la API (todos son endpoints públicos). `POST /citas` NO está aquí:
 * solo lo hace `createAppointment`, que usa el servicio de confirmación, nunca una tool.
 */
export const ALLOWED_ROUTES: readonly AllowedRoute[] = [
  { method: 'GET', path: /^\/marcas$/ },
  { method: 'GET', path: /^\/vehiculos$/ },
  { method: 'GET', path: /^\/vehiculos\/comparar$/ },
  { method: 'GET', path: /^\/vehiculos\/buscar$/ },
  { method: 'GET', path: /^\/vehiculos\/\d{1,10}$/ },
  { method: 'GET', path: /^\/vehiculos\/\d{1,10}\/disponibilidad$/ },
  { method: 'POST', path: /^\/financiacion\/simular$/ },
];

const CREATE_APPOINTMENT_ROUTE = '/citas';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/** Contrato que reciben las tools: solo lecturas y el simulador. */
export interface ReadOnlyApi {
  get<T = unknown>(path: string, params?: Record<string, string | number | undefined>): Promise<ApiResult<T>>;
  post<T = unknown>(path: string, body: Record<string, unknown>): Promise<ApiResult<T>>;
}

/**
 * Cliente de la propia API (Axios, sin token, sin redirecciones, 5 s) con lista blanca de (método, ruta).
 * Las llamadas llevan el secreto interno solo para que el límite por IP no se comparta con los visitantes.
 */
@Injectable()
export class PublicApiClient implements ReadOnlyApi {
  private readonly http: AxiosInstance;

  constructor(private readonly secret: InternalSecret) {
    this.http = axios.create({ timeout: 5000, maxRedirects: 0, validateStatus: () => true });
  }

  get<T = unknown>(path: string, params?: Record<string, string | number | undefined>): Promise<ApiResult<T>> {
    return this.call<T>('GET', path, params);
  }

  post<T = unknown>(path: string, body: Record<string, unknown>): Promise<ApiResult<T>> {
    return this.call<T>('POST', path, undefined, body);
  }

  /** Único camino hacia POST /citas: lo usa el servicio de confirmación, jamás una tool. */
  createAppointment<T = unknown>(body: Record<string, unknown>): Promise<ApiResult<T>> {
    return this.send<T>('POST', CREATE_APPOINTMENT_ROUTE, undefined, body);
  }

  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    params?: Record<string, string | number | undefined>,
    body?: Record<string, unknown>,
  ): Promise<ApiResult<T>> {
    if (!ALLOWED_ROUTES.some((r) => r.method === method && r.path.test(path))) {
      throw new RouteNotAllowedError(method, path);
    }
    return this.send<T>(method, path, params, body);
  }

  private async send<T>(
    method: 'GET' | 'POST',
    path: string,
    params?: Record<string, string | number | undefined>,
    body?: Record<string, unknown>,
  ): Promise<ApiResult<T>> {
    try {
      const response = await this.http.request<T>({
        method,
        url: `${baseUrl()}${path}`,
        params,
        data: body,
        headers: { [INTERNAL_HEADER]: this.secret.header() },
      });
      return { status: response.status, data: response.data };
    } catch {
      // El error de Axios trae las cabeceras (con el secreto): no se propaga ni se registra.
      throw new ApiUnreachableError();
    }
  }
}

/** URL de la propia API; solo se acepta loopback para que el secreto nunca salga de la máquina. */
export function baseUrl(): string {
  const raw = process.env.INTERNAL_API_URL ?? `http://127.0.0.1:${process.env.PORT ?? 8000}/api`;
  const url = new URL(raw);
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error('INTERNAL_API_URL debe apuntar a esta misma máquina (127.0.0.1)');
  }
  return raw.replace(/\/+$/, '');
}
