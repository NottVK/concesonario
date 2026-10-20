import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { purgeBotAudit } from './purge.js';

const HOUR_MS = 60 * 60 * 1000;

/** Purga la auditoría del MCP cada hora (`setInterval` con `unref`, como la del chat). */
@Injectable()
export class AuditPurgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditPurgeService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  onModuleInit(): void {
    // En pruebas no hay temporizadores sueltos; ahí se llama a purge() directamente.
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.purgeSafely(), HOUR_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  purge(now = new Date()): Promise<number> {
    return purgeBotAudit(this.dataSource, now);
  }

  private async purgeSafely(): Promise<void> {
    try {
      const removed = await this.purge();
      if (removed > 0) this.logger.log(`Purga de la auditoría del MCP: ${removed} filas`);
    } catch (error) {
      this.logger.error(`No se pudo purgar la auditoría del MCP: ${error instanceof Error ? error.message : 'error desconocido'}`);
    }
  }
}
