import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module.js';
import { TelegramClient } from './telegram.client.js';
import { TelegramService } from './telegram.service.js';

@Module({
  imports: [ChatModule],
  providers: [TelegramClient, TelegramService],
})
export class TelegramModule {}
