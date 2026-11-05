import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module.js';
import { TelegramApiClient } from './telegram-api.client.js';
import { TelegramService } from './telegram.service.js';

/** Bot de Telegram del concesionario (decisión 128): el mismo asistente del chat web, por otro canal. */
@Module({
  imports: [ChatModule],
  providers: [TelegramApiClient, TelegramService],
})
export class TelegramModule {}
