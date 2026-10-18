import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotExchange } from './entities/bot-exchange.entity.js';
import { ExternalBot } from './entities/external-bot.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([ExternalBot, BotExchange])],
  exports: [TypeOrmModule],
})
export class A2aModule {}
