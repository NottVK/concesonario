import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogoModule } from '../catalogo/catalogo.module.js';
import { FinanciacionModule } from '../financiacion/financiacion.module.js';
import { McpModule } from '../mcp/mcp.module.js';
import { A2A_CONFIG, loadA2aConfig } from './a2a.config.js';
import { A2aTasksController, AgentCardController } from './a2a.controller.js';
import { BotExchange } from './entities/bot-exchange.entity.js';
import { ExternalBot } from './entities/external-bot.entity.js';
import { A2aTasksService } from './inbound/tasks.service.js';

/**
 * Canal A2A. Hoy: la tarjeta pública y las tareas ENTRANTES (deterministas). La puerta de entrada (IP, 401 y cuota
 * diaria por bot) es la misma del MCP, importada de `McpModule`; el cliente saliente llega en la 6.5.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ExternalBot, BotExchange]), McpModule, CatalogoModule, FinanciacionModule],
  controllers: [AgentCardController, A2aTasksController],
  providers: [
    // Si A2A_PUBLIC_BASE_URL es inválida (o falta en producción) la API NO arranca.
    { provide: A2A_CONFIG, useFactory: () => loadA2aConfig() },
    A2aTasksService,
  ],
  exports: [TypeOrmModule],
})
export class A2aModule {}
