import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentService } from './agent/agent.service.js';
import { PublicApiClient } from './api/public-api.client.js';
import { AppointmentConfirmService } from './appointment-confirm.service.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { AppointmentProposal } from './entities/appointment-proposal.entity.js';
import { ChatSession } from './entities/chat-session.entity.js';
import { Conversation } from './entities/conversation.entity.js';
import { MODEL_PROVIDER } from './model/model-provider.js';
import { createModelProvider } from './model/provider-factory.js';
import { InternalSecret } from './security/internal-secret.js';
import { ConversationService } from './session/conversation.service.js';
import { ProposalService } from './session/proposal.service.js';
import { PurgeService } from './session/purge.service.js';
import { SessionService } from './session/session.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation, ChatSession, AppointmentProposal])],
  controllers: [ChatController],
  providers: [
    // El proveedor se elige con CHAT_PROVIDER (ollama, groq o mock); una configuración mala impide arrancar.
    { provide: MODEL_PROVIDER, useFactory: () => createModelProvider() },
    InternalSecret,
    PublicApiClient,
    AgentService,
    ChatService,
    AppointmentConfirmService,
    SessionService,
    ConversationService,
    ProposalService,
    PurgeService,
  ],
  // InternalSecret lo usa el límite global de peticiones (AppModule) para reconocer las llamadas internas.
  exports: [TypeOrmModule, MODEL_PROVIDER, InternalSecret],
})
export class ChatModule {}
