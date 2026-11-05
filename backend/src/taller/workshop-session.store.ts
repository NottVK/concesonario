import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { RelationSummary } from '../relaciones/relaciones.service.js';
import type { Site } from './workshop.types.js';

/** Lo que el servidor recuerda de la conversación del taller de una sesión (decisión 131). El modelo no lo ve. */
export interface WorkshopSession {
  /** Cédula y VIN escritos por el cliente, hasta intentar identificarlo (entonces se borran). */
  cedula?: string;
  vin?: string;
  attempts: number;
  relation?: RelationSummary;
  /** Lo que el cliente contó, sin números personales: va al taller como `mensajes_cliente`. */
  symptoms: string[];
  /** Mensajes del cliente con sus propias palabras (sin cédula ni VIN) hasta el prediagnóstico: el taller los prefiere al resumen del modelo. */
  customerWords: string[];
  /** Ya hubo prediagnóstico: desde ahí los mensajes («la 5», «sí») ya no son síntomas. */
  diagnosed: boolean;
  /** Sedes consultadas, por código. */
  sites: Map<string, Site>;
  /** Decisión del taller (`enrutar_garantia`): con su id se agenda sin volver a calcular el prediagnóstico. */
  routing?: { id: string; siteCode: string };
  /** Horas que el taller ofreció en esta sesión: `CODIGO|fecha_hora`. Solo esas se pueden apartar y agendar. */
  offered: Set<string>;
  /** La última lista de horas que se le mostró al cliente, en orden: «la 2» es la segunda. */
  lastOffered: { siteCode: string; slot: string }[];
  /** Hora apartada con `reservar_franja` mientras el cliente confirma (vence a los 10 minutos). */
  hold?: { id: string; siteCode: string; slot: string; expiresAt: number };
  /** `id_mensaje` por acción (`enrutar|…`, `reservar|…`, `agendar|…`): un reintento no repite el cambio en el taller. */
  messageIds: Map<string, string>;
  /** Orden ya agendada en esta conversación (no se agenda dos veces). */
  booked?: Record<string, unknown>;
  touchedAt: number;
}

export const WORKSHOP_IDLE_MS = 30 * 60 * 1000;

/** El `id_mensaje` de una acción (`conc-<uuid>-<acción>`): el mismo para la misma clave, así un reintento no repite el cambio. */
export function messageIdFor(state: WorkshopSession, key: string, action: 'enrutar' | 'reservar' | 'agendar'): string {
  const existing = state.messageIds.get(key);
  if (existing) return existing;
  const id = `conc-${randomUUID()}-${action}`;
  state.messageIds.set(key, id);
  return id;
}

/** Estado en memoria por sesión del chat; vence a los 30 minutos sin actividad. */
@Injectable()
export class WorkshopSessionStore {
  private readonly sessions = new Map<string, WorkshopSession>();

  get(sessionId: string, now = Date.now()): WorkshopSession | undefined {
    this.prune(now);
    const session = this.sessions.get(sessionId);
    if (session) session.touchedAt = now;
    return session;
  }

  ensure(sessionId: string, now = Date.now()): WorkshopSession {
    const existing = this.get(sessionId, now);
    if (existing) return existing;
    const created: WorkshopSession = { attempts: 0, symptoms: [], customerWords: [], diagnosed: false, sites: new Map(), offered: new Set(), lastOffered: [], messageIds: new Map(), touchedAt: now };
    this.sessions.set(sessionId, created);
    return created;
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private prune(now: number): void {
    for (const [id, session] of this.sessions) if (now - session.touchedAt > WORKSHOP_IDLE_MS) this.sessions.delete(id);
  }
}
