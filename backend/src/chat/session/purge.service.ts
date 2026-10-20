import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { purgeExpired } from './purge.js';
import type { PurgeResult } from './purge.js';

const HOUR_MS = 60 * 60 * 1000;

/** Purga cada hora con `setInterval` y `unref()` (no mantiene vivo el proceso); sin dependencias nuevas. */
@Injectable()
export class PurgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PurgeService.name);
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

  purge(now = new Date()): Promise<PurgeResult> {
    return purgeExpired(this.dataSource, now);
  }

  private async purgeSafely(): Promise<void> {
    try {
      const result = await this.purge();
      if (result.sessions + result.proposals > 0) {
        this.logger.log(`Purga del chat: ${result.sessions} sesiones y ${result.proposals} propuestas`);
      }
    } catch (error) {
      this.logger.error(`No se pudo purgar el chat: ${error instanceof Error ? error.message : 'error desconocido'}`);
    }
  }
}
