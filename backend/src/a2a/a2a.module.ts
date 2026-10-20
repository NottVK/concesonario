import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogoModule } from '../catalogo/catalogo.module.js';
import { FinanciacionModule } from '../financiacion/financiacion.module.js';
import { RateWindow } from '../mcp/gateway/rate-window.js';
import { OTHER_BOT_GATEWAY } from '../chat/tools/other-bot.js';
import { McpModule } from '../mcp/mcp.module.js';
import { A2A_CONFIG, loadA2aConfig } from './a2a.config.js';
import { AdminA2aController } from './admin/admin-a2a.controller.js';
import { A2aTasksController, AgentCardController } from './a2a.controller.js';
import { ChatOtherBotGateway } from './chat-bridge/other-bot.gateway.js';
import { BotExchange } from './entities/bot-exchange.entity.js';
import { ExternalBot } from './entities/external-bot.entity.js';
import { A2aTasksService } from './inbound/tasks.service.js';
import { A2aOutboundService, OUTBOUND_RUNTIME } from './outbound/a2a-outbound.service.js';
import type { OutboundRuntime } from './outbound/a2a-outbound.service.js';
import { CircuitBreaker } from './outbound/circuit-breaker.js';
import { loadOutboundSettings, OUTBOUND_SETTINGS } from './outbound/outbound.config.js';
import { OutboundLimiter } from './outbound/outbound-limiter.js';
import { SecureHttp } from './outbound/secure-http.js';
import { TargetPolicy } from './outbound/target-policy.js';
import type { SettingsSource } from './outbound/target-policy.js';

/**
 * Canal A2A. Entrante: la tarjeta pública y las tareas (deterministas). Saliente: `A2aOutboundService`, el único
 * camino para preguntarle algo a otro bot. La puerta de entrada (IP, 401 y cuota diaria por bot) es la misma del MCP,
 * importada de `McpModule`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ExternalBot, BotExchange]), McpModule, CatalogoModule, FinanciacionModule],
  controllers: [AgentCardController, A2aTasksController, AdminA2aController],
  providers: [
    // Si A2A_PUBLIC_BASE_URL es inválida (o falta en producción) la API NO arranca.
    { provide: A2A_CONFIG, useFactory: () => loadA2aConfig() },
    A2aTasksService,
    {
      // Si A2A_DEV_ALLOWED_TARGETS es inválida o está con NODE_ENV=production la API NO arranca. Se relee en cada llamada
      // (es barato) para que un cambio de entorno en pruebas surta efecto sin reiniciar.
      provide: OUTBOUND_SETTINGS,
      useFactory: (): SettingsSource => {
        loadOutboundSettings();
        return () => loadOutboundSettings();
      },
    },
    {
      provide: OUTBOUND_RUNTIME,
      inject: [OUTBOUND_SETTINGS],
      useFactory: (settings: SettingsSource): OutboundRuntime => ({
        http: new SecureHttp(new TargetPolicy(settings)),
        breaker: new CircuitBreaker(),
        limiter: new OutboundLimiter(),
        testWindow: new RateWindow(60_000),
      }),
    },
    A2aOutboundService,
    // El chat solo conoce esta interfaz (decisión 119): así no importa nada de `a2a/outbound`.
    { provide: OTHER_BOT_GATEWAY, useClass: ChatOtherBotGateway },
  ],
  exports: [TypeOrmModule, A2aOutboundService, OTHER_BOT_GATEWAY],
})
export class A2aModule {}
