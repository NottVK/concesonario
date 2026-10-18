import { Module } from '@nestjs/common';
import { FinanciacionController } from './financiacion.controller.js';
import { FinanciacionService } from './financiacion.service.js';

@Module({
  controllers: [FinanciacionController],
  providers: [FinanciacionService],
  exports: [FinanciacionService],
})
export class FinanciacionModule {}
