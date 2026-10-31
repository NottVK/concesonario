import { HttpException, HttpStatus, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ChatService } from '../chat/chat.service.js';
import { TelegramClient, type TelegramUpdate } from './telegram.client.js';
import { isValidTelegramToken, TELEGRAM_MAX_SESSIONS, telegramEnabled, telegramToken } from './telegram.config.js';
import { ERROR_TEXT, formatReply, UNSUPPORTED_TEXT, WELCOME_TEXT } from './telegram.format.js';

const RETRY_MS = 5000;
const TURN_ABORT_MS = 300_000;

/** Canal de Telegram: cada mensaje de texto privado pasa por el mismo ChatService que el widget web. */
@Injectable()
export class TelegramService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TelegramService.name);
  private readonly stop = new AbortController();
  private readonly sessions = new Map<number, string>();
  private offset = 0;

  constructor(
    private readonly client: TelegramClient,
    private readonly chat: ChatService,
  ) {}

  onApplicationBootstrap(): void {
    if (!telegramEnabled()) return;
    if (!isValidTelegramToken(telegramToken())) {
      this.logger.error('TELEGRAM_BOT_TOKEN no tiene el formato de @BotFather: Telegram queda apagado');
      return;
    }
    void this.run();
  }

  onApplicationShutdown(): void {
    this.stop.abort();
  }

  private async run(): Promise<void> {
    try {
      this.logger.log(`Telegram conectado como @${await this.client.prepare()} (long polling)`);
    } catch (error) {
      this.logger.error(`No se pudo conectar con Telegram: ${this.describe(error)}`);
      return;
    }
    while (!this.stop.signal.aborted) {
      await this.pollOnce();
    }
  }

  private async pollOnce(): Promise<void> {
    try {
      const updates = await this.client.getUpdates(this.offset, this.stop.signal);
      for (const update of updates) {
        this.offset = update.update_id + 1;
        await this.handle(update);
      }
    } catch (error) {
      if (this.stop.signal.aborted) return;
      this.logger.warn(`Telegram: ${this.describe(error)}; reintento en ${RETRY_MS / 1000} s`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    }
  }

  /** Procesa un mensaje; un fallo en una conversación nunca detiene el sondeo. */
  async handle(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message || message.chat.type !== 'private') return;
    const chatId = message.chat.id;
    try {
      await this.client.sendMessage(chatId, await this.answer(chatId, message.text));
    } catch (error) {
      this.logger.warn(`Telegram: no se pudo atender el chat ${chatId}: ${this.describe(error)}`);
    }
  }

  private async answer(chatId: number, text: string | undefined): Promise<string> {
    if (text === undefined) return UNSUPPORTED_TEXT;
    if (text.trim() === '/start') return WELCOME_TEXT;
    await this.client.sendTyping(chatId).catch(() => undefined);
    try {
      const reply = await this.chat.turn({
        message: text,
        sessionToken: this.sessions.get(chatId),
        // El límite por hora del chat se lleva por "IP": aquí es la conversación de Telegram.
        ip: `telegram:${chatId}`,
        signal: AbortSignal.timeout(TURN_ABORT_MS),
      });
      if (reply.sessionToken) this.remember(chatId, reply.sessionToken);
      return formatReply(reply);
    } catch (error) {
      return this.errorText(error);
    }
  }

  private errorText(error: unknown): string {
    if (error instanceof HttpException) {
      const status = error.getStatus();
      // El chat ya redacta el mensaje para la persona (límites, mensaje vacío, asistente no disponible, cola llena).
      if (status < 500 || status === HttpStatus.SERVICE_UNAVAILABLE) return error.message;
    }
    this.logger.error(`Telegram: fallo del chat: ${this.describe(error)}`);
    return ERROR_TEXT;
  }

  private remember(chatId: number, token: string): void {
    if (this.sessions.size >= TELEGRAM_MAX_SESSIONS) this.sessions.delete(this.sessions.keys().next().value as number);
    this.sessions.set(chatId, token);
  }

  /** Mensaje de error sin el token: la URL de la Bot API lo lleva y no debe llegar a los logs. */
  private describe(error: unknown): string {
    const text = error instanceof Error ? error.message : 'error desconocido';
    return text.split(telegramToken() || '\u0000').join('***');
  }
}
