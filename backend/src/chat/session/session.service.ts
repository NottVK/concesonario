import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { chatMaxTurns, chatMinTurnGapMs, CHAT_SESSION_IDLE_MS, CHAT_SESSION_MAX_AGE_MS } from '../chat.config.js';
import { ChatRetryException } from '../chat.errors.js';
import { ChatSession } from '../entities/chat-session.entity.js';

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;
const MAX_SEEN = 50;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface ResolvedSession {
  session: ChatSession;
  /** Solo viene cuando la sesión es nueva: el navegador debe guardarlo (el servidor solo conserva su hash). */
  newToken: string | null;
}

@Injectable()
export class SessionService {
  constructor(@InjectRepository(ChatSession) private readonly sessions: Repository<ChatSession>) {}

  /** La sesión la genera SIEMPRE el servidor: un token que el cliente invente simplemente no existe. */
  async resolve(token: string | undefined): Promise<ResolvedSession> {
    const existing = await this.find(token);
    if (existing) return { session: existing, newToken: null };
    const newToken = randomBytes(32).toString('base64url');
    const session = await this.sessions.save(this.sessions.create({ tokenHash: hashToken(newToken), seenVehicleIds: [] }));
    return { session, newToken };
  }

  /** Sesión vigente (menos de 2 h sin actividad y menos de 24 h de creada) o null. */
  async find(token: string | undefined, now = new Date()): Promise<ChatSession | null> {
    if (!token || !TOKEN_FORMAT.test(token)) return null;
    const session = await this.sessions.findOneBy({ tokenHash: hashToken(token) });
    if (!session) return null;
    const idle = now.getTime() - session.lastActivityAt.getTime();
    const age = now.getTime() - session.createdAt.getTime();
    return idle > CHAT_SESSION_IDLE_MS || age > CHAT_SESSION_MAX_AGE_MS ? null : session;
  }

  /**
   * Cuenta un turno en un solo UPDATE condicionado (pausa mínima entre turnos y tope por sesión), así dos
   * mensajes simultáneos de la misma sesión no pasan los dos.
   */
  async beginTurn(sessionId: string): Promise<void> {
    const gapMs = chatMinTurnGapMs();
    // Con CTE el resultado llega como una fila normal (un UPDATE ... RETURNING cambia de forma según el driver).
    const rows: { n: number }[] = await this.sessions.query(
      `WITH contado AS (
         UPDATE chat_sesiones
            SET turnos = turnos + 1, ultimo_turno_en = now(), ultima_actividad = now()
          WHERE id = $1 AND turnos < $2
            AND (ultimo_turno_en IS NULL OR ultimo_turno_en <= now() - ($3 || ' milliseconds')::interval)
        RETURNING 1)
       SELECT count(*)::int AS n FROM contado`,
      [sessionId, chatMaxTurns(), String(gapMs)],
    );
    if ((rows[0]?.n ?? 0) > 0) return;
    const session = await this.sessions.findOneBy({ id: sessionId });
    if (session && session.turns >= chatMaxTurns()) {
      throw new ChatRetryException('Esta conversación llegó a su límite de mensajes. Inicia una nueva conversación.', HttpStatus.TOO_MANY_REQUESTS, 60);
    }
    throw new ChatRetryException('Espera un par de segundos antes de enviar otro mensaje.', HttpStatus.TOO_MANY_REQUESTS, Math.max(1, Math.ceil(gapMs / 1000)));
  }

  async touch(sessionId: string): Promise<void> {
    await this.sessions.update({ id: sessionId }, { lastActivityAt: () => 'now()' });
  }

  async addSeen(session: ChatSession, ids: number[]): Promise<void> {
    const merged = [...new Set([...session.seenVehicleIds, ...ids])].slice(-MAX_SEEN);
    await this.sessions.update({ id: session.id }, { seenVehicleIds: merged });
    session.seenVehicleIds = merged;
  }

  /** Derecho a borrar: la sesión y, en cascada, su historial y sus propuestas. */
  async remove(sessionId: string): Promise<void> {
    await this.sessions.delete({ id: sessionId });
  }
}
