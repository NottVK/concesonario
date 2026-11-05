import { Injectable } from '@nestjs/common';
import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { TELEGRAM_POLL_TIMEOUT_S, telegramToken } from './telegram.config.js';
import type { InlineKeyboard, TelegramUpdate } from './telegram.types.js';

/** Error de la Bot API SIN la URL ni la configuración de Axios: la URL lleva el token y nunca debe llegar a un log. */
export class TelegramApiError extends Error {
  constructor(
    readonly status: number | null,
    description: string,
  ) {
    super(description);
    this.name = 'TelegramApiError';
  }
}

interface BotApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

interface CallOptions {
  signal?: AbortSignal;
  timeout?: number;
}

/** Cliente mínimo de la Bot API con Axios (no fetch): sin redirecciones, con tiempo máximo y sin exponer el token. */
@Injectable()
export class TelegramApiClient {
  private http: AxiosInstance | null = null;

  /** Espera hasta 25 s mensajes nuevos; `offset` confirma los ya atendidos para que Telegram no los repita. */
  getUpdates(offset: number, signal: AbortSignal): Promise<TelegramUpdate[]> {
    const body = { offset, timeout: TELEGRAM_POLL_TIMEOUT_S, allowed_updates: ['message', 'callback_query'] };
    return this.call<TelegramUpdate[]>('getUpdates', body, { signal, timeout: (TELEGRAM_POLL_TIMEOUT_S + 10) * 1000 });
  }

  /** Texto plano: sin `parse_mode`, así nada de lo que diga el modelo se interpreta como formato o enlace. */
  async sendMessage(chatId: number, text: string, keyboard?: InlineKeyboard): Promise<void> {
    const body = { chat_id: chatId, text, link_preview_options: { is_disabled: true }, ...(keyboard ? { reply_markup: keyboard } : {}) };
    await this.call('sendMessage', body);
  }

  async sendTyping(chatId: number): Promise<void> {
    await this.call('sendChatAction', { chat_id: chatId, action: 'typing' });
  }

  async answerCallback(callbackId: string): Promise<void> {
    await this.call('answerCallbackQuery', { callback_query_id: callbackId });
  }

  /** Quita los botones de un mensaje para que no se puedan pulsar dos veces. */
  async removeButtons(chatId: number, messageId: number): Promise<void> {
    await this.call('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });
  }

  /** Con un webhook configurado Telegram no entrega mensajes por long polling. */
  async deleteWebhook(): Promise<void> {
    await this.call('deleteWebhook', { drop_pending_updates: false });
  }

  private client(): AxiosInstance {
    if (!this.http) {
      const token = telegramToken();
      if (!token) throw new TelegramApiError(null, 'Falta TELEGRAM_BOT_TOKEN');
      this.http = axios.create({ baseURL: `https://api.telegram.org/bot${token}/`, timeout: 10_000, maxRedirects: 0 });
    }
    return this.http;
  }

  private async call<T = unknown>(method: string, body: Record<string, unknown>, options: CallOptions = {}): Promise<T> {
    try {
      const response = await this.client().post<BotApiResponse<T>>(method, body, options);
      if (!response.data.ok) throw new TelegramApiError(response.status, response.data.description ?? 'Telegram rechazó la petición');
      return response.data.result as T;
    } catch (error) {
      throw toTelegramError(error);
    }
  }
}

/** Convierte cualquier error de Axios en uno sin URL (la URL lleva el token). */
export function toTelegramError(error: unknown): unknown {
  if (error instanceof TelegramApiError) return error;
  if (axios.isCancel(error)) return new TelegramApiError(null, 'Petición cancelada');
  if (axios.isAxiosError<BotApiResponse<unknown>>(error)) {
    const status = error.response?.status ?? null;
    const description = error.response?.data?.description ?? (status ? `Telegram respondió ${status}` : 'Telegram no respondió');
    return new TelegramApiError(status, description);
  }
  return error;
}
