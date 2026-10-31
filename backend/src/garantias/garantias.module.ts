import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { A2aModule } from '../a2a/a2a.module.js';
import { WARRANTY_GATEWAY } from '../chat/tools/warranty.js';
import { ChatSession } from '../chat/entities/chat-session.entity.js';
import { FichasVinModule } from '../fichas-vin/fichas-vin.module.js';
import { WarrantyChatGateway } from './chat-gateway.js';
import { CasoGarantia } from './entities/caso-garantia.entity.js';
import { PropietarioVin } from './entities/propietario-vin.entity.js';
import { WarrantyContractSkills } from './garantias-contract.js';
import { GarantiasController } from './garantias.controller.js';
import { GarantiasService } from './garantias.service.js';
import { ServiceDirectory } from './services/directory.js';
import { SimulatedServices } from './services/simulated.js';

/**
 * Flujo de garantías. Taller, Tienda y Pagos son de otros equipos: se llaman por `ServiceDirectory` (servicio registrado
 * en `bots_externos` o, en desarrollo, el simulado) y el chat solo conoce la interfaz `WARRANTY_GATEWAY`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CasoGarantia, PropietarioVin, ChatSession]), A2aModule, FichasVinModule],
  controllers: [GarantiasController],
  providers: [GarantiasService, WarrantyContractSkills, ServiceDirectory, SimulatedServices, { provide: WARRANTY_GATEWAY, useClass: WarrantyChatGateway }],
  exports: [WARRANTY_GATEWAY, SimulatedServices],
})
export class GarantiasModule {}
