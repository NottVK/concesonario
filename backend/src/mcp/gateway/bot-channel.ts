import { SetMetadata } from '@nestjs/common';

/** Canales entrantes que comparten la puerta de entrada (IP, 401 idéntico y cuota diaria por bot). */
export type BotChannelName = 'mcp' | 'a2a';

export const BOT_CHANNEL_KEY = 'bot-channel';

/** Marca el canal de un controlador o ruta; los guards `Bot*` lo exigen (sin él, fallan cerrado). */
export const BotChannel = (channel: BotChannelName) => SetMetadata(BOT_CHANNEL_KEY, channel);
