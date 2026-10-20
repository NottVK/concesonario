import axios from 'axios';
import type { AxiosRequestConfig } from 'axios';
import http from 'node:http';
import https from 'node:https';
import type { Readable } from 'node:stream';
import { ExchangeStatus } from '../entities/bot-exchange.entity.js';
import { OutboundFailure } from './errors.js';
import { OUTBOUND_DEFAULTS } from './outbound.config.js';
import type { PinnedTarget, TargetPolicy } from './target-policy.js';

export interface SecureRequest {
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  body?: string;
  /** Tope de la respuesta, contado en el stream. */
  maxBytes: number;
  deadlineMs?: number;
}

export interface SecureResponse {
  status: number;
  text: string;
  bytes: number;
}

const JSON_TYPE = /^application\/json\s*(;|$)/i;

type LookupCallback = (error: Error | null, address: string | { address: string; family: number }[], family?: number) => void;

/** `lookup` que devuelve SIEMPRE la IP ya validada: el socket no vuelve a resolver el nombre (anti DNS rebinding). */
export function pinnedLookup(pinned: Pick<PinnedTarget, 'address' | 'family'>): AxiosRequestConfig['lookup'] {
  const lookup = (_hostname: string, options: unknown, callback: LookupCallback): void => {
    const wantsAll = typeof options === 'object' && options !== null && (options as { all?: boolean }).all === true;
    if (wantsAll) callback(null, [{ address: pinned.address, family: pinned.family }]);
    else callback(null, pinned.address, pinned.family);
  };
  return lookup as AxiosRequestConfig['lookup'];
}

/** Espera una promesa pero se rinde cuando se acaba el plazo (el DNS no se puede cancelar a mitad). */
function untilDeadline<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(new OutboundFailure(ExchangeStatus.TIMEOUT, 'plazo'));
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    return undefined;
  });
}

function networkFailure(error: unknown): OutboundFailure {
  const code = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : 'desconocido';
  if (/^(ERR_TLS|CERT_|DEPTH_ZERO|SELF_SIGNED|UNABLE_TO_|ERR_SSL)/.test(code)) return new OutboundFailure(ExchangeStatus.REMOTE_ERROR, 'tls');
  return new OutboundFailure(ExchangeStatus.REMOTE_ERROR, `red-${code}`);
}

/**
 * Cliente HTTP de la salida A2A. Cada llamada: valida la URL contra la política SSRF, resuelve el DNS y se conecta a la
 * IP validada; sin redirecciones, sin proxy, sin compresión, sin reutilizar conexiones; el plazo es TOTAL (conexión,
 * cabeceras y cuerpo); la respuesta debe ser JSON y no pasar del tope, que se cuenta en el stream mientras llega.
 * Todo fallo es un `OutboundFailure` con su categoría; el detalle (`code`) es solo para el registro de operación.
 */
export class SecureHttp {
  constructor(private readonly policy: TargetPolicy) {}

  async request(request: SecureRequest): Promise<SecureResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.deadlineMs ?? OUTBOUND_DEFAULTS.deadlineMs);
    try {
      const target = this.policy.check(request.url);
      const pinned = await untilDeadline(this.policy.pin(target), controller.signal);
      const stream = await this.send(pinned, request, controller.signal);
      return await this.readBody(stream, request.maxBytes, controller.signal);
    } catch (error) {
      if (error instanceof OutboundFailure) throw error;
      if (controller.signal.aborted) throw new OutboundFailure(ExchangeStatus.TIMEOUT, 'plazo');
      throw networkFailure(error);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Envía la petición y devuelve el cuerpo como stream SOLO si la respuesta cumple lo mínimo (estado, tipo, codificación, tamaño anunciado). */
  private async send(pinned: PinnedTarget, request: SecureRequest, signal: AbortSignal): Promise<Readable> {
    const response = await axios.request<Readable>({
      url: pinned.target.url.href,
      method: request.method,
      data: request.body,
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'identity',
        'User-Agent': 'AutoMax-Bot/1.0',
        ...(request.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...request.headers,
      },
      responseType: 'stream',
      signal,
      lookup: pinnedLookup(pinned),
      maxRedirects: 0,
      proxy: false,
      decompress: false,
      validateStatus: () => true,
      transformResponse: [],
      httpAgent: new http.Agent({ keepAlive: false }),
      httpsAgent: new https.Agent({ keepAlive: false, minVersion: 'TLSv1.2' }),
    });
    const stream = response.data;
    const fail = (status: ExchangeStatus, code: string): never => {
      stream.destroy();
      throw new OutboundFailure(status, code);
    };
    const { status } = response;
    if (status >= 300 && status < 400) return fail(ExchangeStatus.INVALID_RESPONSE, 'redireccion');
    if (status < 200 || status >= 400) return fail(ExchangeStatus.REMOTE_ERROR, `http-${status}`);
    if (status === 204 || status === 205) return fail(ExchangeStatus.INVALID_RESPONSE, 'sin-contenido');
    const encoding = String(response.headers['content-encoding'] ?? 'identity').toLowerCase();
    if (encoding !== 'identity') return fail(ExchangeStatus.INVALID_RESPONSE, 'codificacion');
    if (!JSON_TYPE.test(String(response.headers['content-type'] ?? ''))) return fail(ExchangeStatus.INVALID_RESPONSE, 'tipo');
    const announced = Number(response.headers['content-length']);
    if (Number.isFinite(announced) && announced > request.maxBytes) return fail(ExchangeStatus.INVALID_RESPONSE, 'tamano');
    return stream;
  }

  private async readBody(stream: Readable, maxBytes: number, signal: AbortSignal): Promise<SecureResponse> {
    const chunks: Buffer[] = [];
    let size = 0;
    const onAbort = (): void => {
      stream.destroy();
    };
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      for await (const chunk of stream) {
        const piece = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
        size += piece.length;
        if (size > maxBytes) {
          stream.destroy();
          throw new OutboundFailure(ExchangeStatus.INVALID_RESPONSE, 'tamano');
        }
        chunks.push(piece);
      }
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
    if (signal.aborted) throw new OutboundFailure(ExchangeStatus.TIMEOUT, 'plazo');
    if (size === 0) throw new OutboundFailure(ExchangeStatus.INVALID_RESPONSE, 'vacio');
    return { status: 200, text: new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks)), bytes: size };
  }
}
