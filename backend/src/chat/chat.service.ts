import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { AgentService } from './agent/agent.service.js';
import { PROMPT_VERSION } from './agent/prompt.js';
import { PublicApiClient } from './api/public-api.client.js';
import { chatPerHourLimit, CHAT_MESSAGE_MAX_CHARS, CHAT_QUEUE_LENGTH, CHAT_TURN_TIMEOUT_MS } from './chat.config.js';
import { ChatRetryException, MODEL_SLOW_MESSAGE, MODEL_UNAVAILABLE_MESSAGE } from './chat.errors.js';
import type { ChatReplyDto, ChatStatusDto } from './dto/chat.dto.js';
import { ConversationRole } from './entities/conversation.entity.js';
import { MODEL_PROVIDER, ProviderAbortedError, ProviderTimeoutError, ProviderUnavailableError } from './model/model-provider.js';
import type { ModelProvider } from './model/model-provider.js';
import { HourlyLimiter } from './security/hourly-limiter.js';
import { InferenceQueue, QueueFullError } from './security/inference-queue.js';
import { ConversationService } from './session/conversation.service.js';
import { ProposalService } from './session/proposal.service.js';
import { SessionService } from './session/session.service.js';
import { sanitizeText } from './text/sanitize.js';
import { BadRequestException, GatewayTimeoutException, ServiceUnavailableException } from '@nestjs/common';
import type { ApiVehicle } from './tools/format.js';

const STATUS_CACHE_MS = 30_000;

export interface TurnRequest {
  message: string;
  vehicleId?: number;
  sessionToken: string | undefined;
  ip: string;
  /** Se dispara si la persona cierra la conexión: se cancela la espera y la llamada al modelo. */
  signal: AbortSignal;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly queue = new InferenceQueue(1, CHAT_QUEUE_LENGTH);
  private readonly hourly = new HourlyLimiter(chatPerHourLimit);
  private statusCache: { at: number; value: ChatStatusDto } | null = null;

  constructor(
    @Inject(MODEL_PROVIDER) private readonly provider: ModelProvider,
    private readonly agent: AgentService,
    private readonly sessions: SessionService,
    private readonly conversations: ConversationService,
    private readonly proposals: ProposalService,
    private readonly api: PublicApiClient,
  ) {}

  async turn(request: TurnRequest): Promise<ChatReplyDto> {
    // Antes de gastar nada: el mensaje se sanea y se rechaza si queda vacío.
    const message = sanitizeText(request.message, CHAT_MESSAGE_MAX_CHARS);
    if (!message) throw new BadRequestException('El mensaje no puede estar vacío');
    if (!this.hourly.tryConsume(request.ip)) {
      throw new ChatRetryException('Llegaste al límite de mensajes por hora. Intenta más tarde.', HttpStatus.TOO_MANY_REQUESTS, this.hourly.retryAfterSeconds(request.ip));
    }

    const { session, newToken } = await this.sessions.resolve(request.sessionToken);
    if (request.vehicleId) await this.trustViewedVehicle(session, request.vehicleId);
    await this.sessions.beginTurn(session.id);

    const history = await this.conversations.context(session.id);
    const output = await this.runAgent(request, session.id, message, history, session.seenVehicleIds);

    await this.conversations.save(session.id, [
      { role: ConversationRole.USER, message },
      { role: ConversationRole.ASSISTANT, message: output.reply, promptVersion: PROMPT_VERSION, model: this.provider.model },
    ]);
    await this.sessions.addSeen(session, output.seenVehicleIds);
    return { reply: output.reply, cards: output.cards, proposal: output.proposal, ...(newToken ? { sessionToken: newToken } : {}) };
  }

  async removeSession(token: string | undefined): Promise<void> {
    const session = await this.sessions.find(token);
    if (session) await this.sessions.remove(session.id);
  }

  /** Estado del proveedor con caché de 30 s, para que el widget no sondee al modelo en cada carga. */
  async status(): Promise<ChatStatusDto> {
    const now = Date.now();
    if (this.statusCache && now - this.statusCache.at < STATUS_CACHE_MS) return this.statusCache.value;
    const value: ChatStatusDto = {
      available: await this.provider.isAvailable(),
      provider: this.provider.name,
      external: this.provider.external,
    };
    this.statusCache = { at: now, value };
    return value;
  }

  /** El vehículo de la ficha solo se acepta si existe y no está vendido; el modelo no puede inventar ids. */
  private async trustViewedVehicle(session: Awaited<ReturnType<SessionService['resolve']>>['session'], vehicleId: number): Promise<void> {
    try {
      const response = await this.api.get<ApiVehicle>(`/vehiculos/${vehicleId}`);
      if (response.status === 200 && response.data.status !== 'vendido') await this.sessions.addSeen(session, [vehicleId]);
    } catch (error) {
      this.logger.warn(`No se pudo verificar el vehículo de la ficha: ${error instanceof Error ? error.message : 'error'}`);
    }
  }

  private async runAgent(
    request: TurnRequest,
    sessionId: string,
    message: string,
    history: Awaited<ReturnType<ConversationService['context']>>,
    seenVehicleIds: number[],
  ): ReturnType<AgentService['run']> {
    const turnSignal = AbortSignal.any([request.signal, AbortSignal.timeout(CHAT_TURN_TIMEOUT_MS)]);
    try {
      return await this.queue.run(
        () =>
          this.agent.run({
            history,
            userMessage: message,
            api: this.api,
            sessionId,
            seenVehicleIds,
            createProposal: (input) => this.proposals.create(sessionId, input),
            signal: turnSignal,
          }),
        turnSignal,
      );
    } catch (error) {
      throw this.mapError(error, request.signal);
    }
  }

  private mapError(error: unknown, clientSignal: AbortSignal): unknown {
    if (error instanceof QueueFullError) return new ChatRetryException(error.message, HttpStatus.SERVICE_UNAVAILABLE, 5);
    // La persona cerró la conexión: nadie leerá la respuesta.
    if (clientSignal.aborted) return error;
    if (error instanceof ProviderUnavailableError) {
      this.logger.warn(`Modelo no disponible: ${error.message}`);
      return new ServiceUnavailableException(MODEL_UNAVAILABLE_MESSAGE);
    }
    // Sin cierre del cliente, una cancelación solo puede venir del tope de 90 s del turno.
    if (error instanceof ProviderTimeoutError || error instanceof ProviderAbortedError || (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))) {
      return new GatewayTimeoutException(MODEL_SLOW_MESSAGE);
    }
    return error;
  }
}
