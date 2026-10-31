import { Injectable } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';
import { TELEGRAM_API, TELEGRAM_POLL_SECONDS, telegramToken } from './telegram.config.js';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    chat: { id: number; type: string };
  };
}

interface TelegramResponse<T> {
  ok: boolean;
  result: T;
}

/** Cliente mínimo de la Bot API. El token vive solo en la URL base; nunca se registra en logs. */
@Injectable()
export class TelegramClient {
  private http: AxiosInstance | null = null;

  private api(): AxiosInstance {
    this.http ??= axios.create({ baseURL: `${TELEGRAM_API}/bot${telegramToken()}`, timeout: (TELEGRAM_POLL_SECONDS + 10) * 1000 });
    return this.http;
  }

  async getUpdates(offset: number, signal: AbortSignal): Promise<TelegramUpdate[]> {
    const { data } = await this.api().get<TelegramResponse<TelegramUpdate[]>>('/getUpdates', {
      params: { offset, timeout: TELEGRAM_POLL_SECONDS, allowed_updates: JSON.stringify(['message']) },
      signal,
    });
    return data.result;
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    await this.api().post('/sendMessage', { chat_id: chatId, text, link_preview_options: { is_disabled: true } });
  }

  async sendTyping(chatId: number): Promise<void> {
    await this.api().post('/sendChatAction', { chat_id: chatId, action: 'typing' });
  }

  /** Un long polling no convive con un webhook: se borra el que hubiera. Devuelve el nombre público del bot. */
  async prepare(): Promise<string> {
    await this.api().post('/deleteWebhook');
    const { data } = await this.api().get<TelegramResponse<{ username?: string }>>('/getMe');
    return data.result.username ?? 'bot';
  }
}
