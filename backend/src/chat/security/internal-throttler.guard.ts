import { Inject, Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { INTERNAL_HEADER, InternalSecret } from './internal-secret.js';

/**
 * Rutas que el bot llama sobre sí mismo. Lista corta y exacta: cualquier otra ruta con la cabecera interna
 * sigue sujeta al límite por IP.
 */
const INTERNAL_ROUTES: { method: string; path: RegExp }[] = [
  { method: 'GET', path: /^\/api\/marcas$/ },
  { method: 'GET', path: /^\/api\/vehiculos$/ },
  { method: 'GET', path: /^\/api\/vehiculos\/(?:comparar|buscar|\d{1,10}|\d{1,10}\/disponibilidad)$/ },
  { method: 'POST', path: /^\/api\/financiacion\/simular$/ },
  { method: 'POST', path: /^\/api\/citas$/ },
];

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Decide si una petición es una llamada interna del bot (las TRES condiciones a la vez). */
export function isInternalCall(request: Pick<Request, 'method' | 'path' | 'socket' | 'headers'>, secret: InternalSecret): boolean {
  if (!LOOPBACK.has(request.socket?.remoteAddress ?? '')) return false;
  if (!INTERNAL_ROUTES.some((r) => r.method === request.method && r.path.test(request.path))) return false;
  return secret.matches(request.headers[INTERNAL_HEADER]);
}

/**
 * Igual que el límite global por IP, salvo que omite el límite a las llamadas internas del bot: salen todas
 * de 127.0.0.1 y compartirían la cuota de los visitantes. Los límites reales se aplican en `/api/chat`.
 */
@Injectable()
export class InternalAwareThrottlerGuard extends ThrottlerGuard {
  @Inject(InternalSecret) private readonly internalSecret: InternalSecret;

  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    return isInternalCall(request, this.internalSecret);
  }
}
