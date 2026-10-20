import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotExchange } from '../a2a/entities/bot-exchange.entity.js';
import { ExternalBot } from '../a2a/entities/external-bot.entity.js';
import { CatalogoModule } from '../catalogo/catalogo.module.js';
import { AdminBotsController } from './admin/admin-bots.controller.js';
import { AuditPurgeService } from './audit/audit-purge.service.js';
import { AuditService } from './audit/audit.service.js';
import { McpAuthGuard, McpPreAuthGuard } from './gateway/mcp.guards.js';
import { McpGatewayService } from './gateway/mcp-gateway.service.js';
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
    McpGatewayService,
    McpService,
    McpPreAuthGuard,
    McpAuthGuard,
  ],
  exports: [BotKeysService, AuditService, MCP_SECRETS],
})
export class McpModule {}
