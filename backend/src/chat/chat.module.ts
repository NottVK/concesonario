import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from './entities/conversation.entity.js';
import { MODEL_PROVIDER } from './model/model-provider.js';
import { createModelProvider } from './model/provider-factory.js';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation])],
  // El proveedor se elige con CHAT_PROVIDER (ollama, groq o mock); una configuración mala impide arrancar.
  providers: [{ provide: MODEL_PROVIDER, useFactory: () => createModelProvider() }],
  exports: [TypeOrmModule, MODEL_PROVIDER],
})
export class ChatModule {}
