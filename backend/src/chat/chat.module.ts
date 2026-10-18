import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from './entities/conversation.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation])],
  exports: [TypeOrmModule],
})
export class ChatModule {}
