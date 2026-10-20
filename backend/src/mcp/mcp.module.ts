import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotExchange } from '../a2a/entities/bot-exchange.entity.js';
import { ExternalBot } from '../a2a/entities/external-bot.entity.js';
import { CatalogoModule } from '../catalogo/catalogo.module.js';
import { AdminBotsController } from './admin/admin-bots.controller.js';
import { AuditPurgeService } from './audit/audit-purge.service.js';
import { AuditService } from './audit/audit.service.js';
import { BotAuthGuard, BotPreAuthGuard } from './gateway/bot.guards.js';
import { BotGatewayService } from './gateway/bot-gateway.service.js';
import { BotKeysService } from './keys/bot-keys.service.js';
import { McpController } from './mcp.controller.js';
import { loadMcpSecrets, MCP_SECRETS } from './mcp.config.js';
import { McpService } from './server/mcp.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ExternalBot, BotExchange]), CatalogoModule],
  controllers: [AdminBotsController, McpController],
  providers: [
    // Si falta MCP_KEY_PEPPER o BOT_KEY_ENCRYPTION_KEY (o son inválidos) la API NO arranca.
    { provide: MCP_SECRETS, useFactory: () => loadMcpSecrets() },
    BotKeysService,
    AuditService,
    AuditPurgeService,
    BotGatewayService,
    McpService,
    BotPreAuthGuard,
    BotAuthGuard,
  ],
  // La puerta (servicio y guards) la usa también el canal A2A: una sola IpGate y una sola cuota diaria por bot (decisión 109).
  exports: [BotKeysService, AuditService, MCP_SECRETS, BotGatewayService, BotPreAuthGuard, BotAuthGuard],
})
export class McpModule {}
