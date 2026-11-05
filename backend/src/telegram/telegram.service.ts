import { HttpException, Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { setTimeout as sleep } from 'node:timers/promises';
import { AppointmentConfirmService } from '../chat/appointment-confirm.service.js';
import { CHAT_MESSAGE_MAX_CHARS, CHAT_SESSION_IDLE_MS } from '../chat/chat.config.js';
import { ChatService } from '../chat/chat.service.js';
import { nextBookingStep, readyCustomer, startBooking } from './booking-flow.js';
import type { Booking } from './booking-flow.js';
import { TelegramApiClient, TelegramApiError } from './telegram-api.client.js';
import { BUTTON_BOOK, BUTTON_CANCEL, BUTTON_CONFIRM, BUTTON_SKIP, replyToMessages, TEXTS } from './telegram-format.js';
import type { OutgoingMessage } from './telegram-format.js';
import {
  TELEGRAM_MAX_PENDING_PER_CHAT,
  TELEGRAM_RETRY_MAX_MS,
  TELEGRAM_RETRY_MIN_MS,
  TELEGRAM_TYPING_EVERY_MS,
  telegramEnabled,
} from './telegram.config.js';
import type { TelegramCallbackQuery, TelegramUpdate } from './telegram.types.js';

/** Lo que se recuerda de cada chat de Telegram, solo en memoria (el id del chat no se guarda en la base). */
interface ChatState {
  /** Token de la sesión del chat; el servidor solo guarda su hash, igual que con el navegador. */
  token: string | undefined;
  booking: Booking | null;
  lastSeen: number;
}

/**
 * Conecta el mismo asistente de la web con Telegram (decisión 128). Long polling, así que no necesita URL
 * pública ni túnel. Cada chat privado es una sesión del chat con sus mismos límites; los grupos se ignoran.
 */
@Injectable()
export class TelegramService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private readonly chats = new Map<number, ChatState>();
  private readonly queues = new Map<number, { tail: Promise<void>; pending: number }>();
  private readonly stopper = new AbortController();
  private offset = 0;
  private loop: Promise<void> | null = null;

  constructor(
    private readonly api: TelegramApiClient,
    private readonly chat: ChatService,
    private readonly confirmation: AppointmentConfirmService,
  ) {}

  onApplicationBootstrap(): void {
    if (!telegramEnabled()) return;
    this.loop = this.poll();
    this.logger.log('Bot de Telegram encendido (long polling)');
  }

  async onModuleDestroy(): Promise<void> {
    this.stopper.abort();
    await this.loop;
  }

  /** Recibe un mensaje o un botón. Devuelve la promesa de su atención (el ciclo no la espera; las pruebas sí). */
  accept(update: TelegramUpdate): Promise<void> {
    this.offset = Math.max(this.offset, update.update_id + 1);
    const chat = update.message?.chat ?? update.callback_query?.message?.chat;
    if (!chat || chat.type !== 'private') return Promise.resolve();
    return this.enqueue(chat.id, () => this.handle(chat.id, update));
  }

  private async poll(): Promise<void> {
    await this.api.deleteWebhook().catch((error: unknown) => this.logger.warn(`Telegram: no se pudo quitar el webhook: ${errorSummary(error)}`));
    let delay = TELEGRAM_RETRY_MIN_MS;
    while (!this.stopper.signal.aborted) {
      try {
        const updates = await this.api.getUpdates(this.offset, this.stopper.signal);
        for (const update of updates) void this.accept(update);
        this.prune();
        delay = TELEGRAM_RETRY_MIN_MS;
      } catch (error) {
        if (this.stopper.signal.aborted || !(await this.recover(error, delay))) return;
        delay = Math.min(delay * 2, TELEGRAM_RETRY_MAX_MS);
      }
    }
  }

  /** false si hay que apagar el bot (token rechazado); si no, espera y vuelve a intentar. */
  private async recover(error: unknown, delay: number): Promise<boolean> {
    if (error instanceof TelegramApiError && error.status === 401) {
      this.logger.error('Telegram rechazó TELEGRAM_BOT_TOKEN (401). El bot de Telegram queda apagado; revisa el token en .env.');
      return false;
    }
    this.logger.warn(`Telegram: no se pudieron leer mensajes (${errorSummary(error)}); reintento en ${delay / 1000} s`);
    // Si se apaga la API durante la espera, la espera se corta: no hay nada más que hacer.
    await sleep(delay, undefined, { signal: this.stopper.signal }).catch(() => undefined);
    return true;
  }

  /** Los mensajes de un chat se atienden en orden y con un tope; chats distintos no se esperan entre sí. */
  private enqueue(chatId: number, task: () => Promise<void>): Promise<void> {
    const queue = this.queues.get(chatId) ?? { tail: Promise.resolve(), pending: 0 };
    if (queue.pending >= TELEGRAM_MAX_PENDING_PER_CHAT) return this.send(chatId, { text: TEXTS.busy });
    queue.pending += 1;
    queue.tail = queue.tail
      .then(task)
      .catch((error: unknown) => this.logger.error(`Telegram: error atendiendo un mensaje: ${errorSummary(error)}`))
      .finally(() => {
        queue.pending -= 1;
        if (queue.pending === 0) this.queues.delete(chatId);
      });
    this.queues.set(chatId, queue);
    return queue.tail;
  }

  private async handle(chatId: number, update: TelegramUpdate): Promise<void> {
    if (update.callback_query) return this.onButton(chatId, update.callback_query);
    const text = update.message?.text;
    if (text === undefined) return this.send(chatId, { text: TEXTS.onlyText });
    return this.onText(chatId, text);
  }

  private async onText(chatId: number, text: string): Promise<void> {
    const state = this.state(chatId);
    const command = (text.trim().split(/\s+/)[0] ?? '').toLowerCase().replace(/@\w+$/, '');
    if (command === '/start' || command === '/ayuda') return this.send(chatId, { text: TEXTS.welcome });
    if (command === '/borrar') return this.forget(chatId, state);
    // Sin cita de test-drive en curso, /cancelar va al chat: puede estar cancelando el flujo del taller.
    if (command === '/cancelar' && state.booking) return this.cancelBooking(chatId, state);
    if (command === '/cancelar') return this.turn(chatId, state, 'cancelar');
    if (state.booking) return this.continueBooking(chatId, state, text);
    return this.turn(chatId, state, text);
  }

  /** Un turno del asistente, igual que en la web. El límite por hora se cuenta por chat de Telegram. */
  private async turn(chatId: number, state: ChatState, text: string): Promise<void> {
    if (Array.from(text).length > CHAT_MESSAGE_MAX_CHARS) return this.send(chatId, { text: TEXTS.tooLong });
    const stopTyping = this.typing(chatId);
    try {
      const reply = await this.chat.turn({ message: text, sessionToken: state.token, ip: `telegram:${chatId}`, signal: this.stopper.signal });
      if (reply.sessionToken) state.token = reply.sessionToken;
      stopTyping();
      for (const message of replyToMessages(reply)) await this.send(chatId, message);
    } catch (error) {
      stopTyping();
      await this.send(chatId, { text: this.errorText(error) });
    }
  }

  private async onButton(chatId: number, query: TelegramCallbackQuery): Promise<void> {
    await this.api.answerCallback(query.id).catch((error: unknown) => this.logger.debug(`Telegram: answerCallback: ${errorSummary(error)}`));
    if (query.message) {
      await this.api.removeButtons(chatId, query.message.message_id).catch((error: unknown) => this.logger.debug(`Telegram: removeButtons: ${errorSummary(error)}`));
    }
    const data = query.data ?? '';
    const state = this.state(chatId);
    if (data.startsWith(BUTTON_BOOK)) return this.beginBooking(chatId, state, data.slice(BUTTON_BOOK.length));
    if (data.startsWith(BUTTON_SKIP)) return this.send(chatId, { text: TEXTS.skipped });
    if (data === BUTTON_CONFIRM) return this.confirmBooking(chatId, state);
    if (data === BUTTON_CANCEL) return this.cancelBooking(chatId, state);
  }

  private async beginBooking(chatId: number, state: ChatState, proposalId: string): Promise<void> {
    const step = state.token ? startBooking(proposalId) : null;
    if (!step) return this.send(chatId, { text: TEXTS.expired });
    state.booking = step.booking;
    await this.send(chatId, step.message);
  }

  private async continueBooking(chatId: number, state: ChatState, text: string): Promise<void> {
    if (!state.booking) return;
    const step = nextBookingStep(state.booking, text);
    state.booking = step.booking;
    await this.send(chatId, step.message);
  }

  /** Único camino por el que Telegram crea una cita: el mismo servicio de confirmación que usa la web. */
  private async confirmBooking(chatId: number, state: ChatState): Promise<void> {
    const ready = readyCustomer(state.booking);
    if (!ready) return this.send(chatId, { text: TEXTS.noPendingBooking });
    state.booking = null;
    try {
      const result = await this.confirmation.confirm(state.token, { proposalId: ready.proposalId, customer: { name: ready.name, email: ready.email } });
      await this.send(chatId, { text: `${result.message} ¡Te esperamos!` });
    } catch (error) {
      await this.send(chatId, { text: this.errorText(error) });
    }
  }

  private async cancelBooking(chatId: number, state: ChatState): Promise<void> {
    const had = state.booking !== null;
    state.booking = null;
    await this.send(chatId, { text: had ? TEXTS.cancelled : TEXTS.nothingToCancel });
  }

  /** Derecho a borrar: la sesión del chat (y en cascada su historial y propuestas) y lo que se recuerda del chat. */
  private async forget(chatId: number, state: ChatState): Promise<void> {
    await this.chat.removeSession(state.token);
    this.chats.delete(chatId);
    await this.send(chatId, { text: TEXTS.forgotten });
  }

  private state(chatId: number): ChatState {
    const state = this.chats.get(chatId) ?? { token: undefined, booking: null, lastSeen: 0 };
    state.lastSeen = Date.now();
    this.chats.set(chatId, state);
    return state;
  }

  /** Olvida los chats sin actividad: pasado ese tiempo su sesión del chat ya venció. */
  private prune(now = Date.now()): void {
    for (const [chatId, state] of this.chats) {
      if (now - state.lastSeen > CHAT_SESSION_IDLE_MS && !this.queues.has(chatId)) this.chats.delete(chatId);
    }
  }

  /** "escribiendo…" hasta que llegue la respuesta (gpt-oss puede tardar más de 30 s). */
  private typing(chatId: number): () => void {
    const ping = (): void => {
      this.api.sendTyping(chatId).catch((error: unknown) => this.logger.debug(`Telegram: sendTyping: ${errorSummary(error)}`));
    };
    ping();
    const timer = setInterval(ping, TELEGRAM_TYPING_EVERY_MS);
    timer.unref();
    return () => clearInterval(timer);
  }

  private async send(chatId: number, message: OutgoingMessage): Promise<void> {
    await this.api.sendMessage(chatId, message.text, message.keyboard).catch((error: unknown) => this.logger.warn(`Telegram: no se pudo enviar un mensaje: ${errorSummary(error)}`));
  }

  /** El mensaje de una excepción de Nest tal cual (ya está en español y es apto para la persona); si no, uno genérico. */
  private errorText(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') return response;
      const message = (response as { message?: unknown }).message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.join('. ');
    }
    this.logger.error(`Telegram: error inesperado: ${errorSummary(error)}`);
    return TEXTS.failed;
  }
}

/** Solo el mensaje: un error de Axios trae la URL, y la URL de la Bot API lleva el token. */
function errorSummary(error: unknown): string {
  if (error instanceof TelegramApiError) return error.status ? `${error.status} ${error.message}` : error.message;
  return error instanceof Error ? `${error.name}: ${error.message}` : 'error desconocido';
}
