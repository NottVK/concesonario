import { Logger, Module } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { WORKSHOP_GATEWAY } from '../chat/tools/workshop.js';
import { WORKSHOP_PARTNER } from '../mcp/tools/partner.js';
import { RelacionesModule } from '../relaciones/relaciones.module.js';
import { RelacionesService } from '../relaciones/relaciones.service.js';
import { VinModule } from '../vin/vin.module.js';
import { WarrantyValidation } from './entities/warranty-validation.entity.js';
import { WorkshopOrder } from './entities/workshop-order.entity.js';
import { McpWorkshopClient } from './mcp-workshop.client.js';
import { DisconnectedPartsStore, McpPartsStore, PARTS_STORE, partsStoreConfig } from './partner/parts-store.js';
import type { PartsStoreClient } from './partner/parts-store.js';
import { WorkshopPartnerService } from './partner/workshop-partner.service.js';
import { SimulatedWorkshopClient } from './simulated-workshop.client.js';
import { tallerMcpConfig } from './taller.config.js';
import { WorkshopBookingService } from './workshop-booking.service.js';
import { WorkshopGatewayService } from './workshop-gateway.service.js';
import { WorkshopSessionStore } from './workshop-session.store.js';
import { WorkshopSites } from './workshop-sites.js';
import { WORKSHOP_CLIENT } from './workshop.types.js';
import type { WorkshopClient } from './workshop.types.js';

function createWorkshopClient(relations: RelacionesService, orders: Repository<WorkshopOrder>): WorkshopClient {
  // Una TALLER_MCP_URL o un token inválidos lanzan aquí y la API no arranca.
  const config = tallerMcpConfig();
  if (config) return new McpWorkshopClient(config);
  if (process.env.NODE_ENV !== 'test') new Logger('TallerModule').warn('Sin TALLER_MCP_URL: el concesionario agenda en el taller SIMULADO');
  return new SimulatedWorkshopClient(relations, orders);
}

function createPartsStore(): PartsStoreClient {
  const config = partsStoreConfig();
  if (config) return new McpPartsStore(config);
  if (process.env.NODE_ENV !== 'test') new Logger('TallerModule').warn('Sin REPUESTOS_MCP_URL: la garantía no se puede verificar con la tienda de repuestos (se anota)');
  return new DisconnectedPartsStore();
}

/**
 * Integración con el taller para agendar (decisiones 130 y 131): el cliente MCP (real o simulado) y el gateway con el
 * que el modelo del chat llama, por tools, las herramientas del taller.
 */
@Module({
  imports: [TypeOrmModule.forFeature([WorkshopOrder, WarrantyValidation]), RelacionesModule, VinModule],
  providers: [
    { provide: WORKSHOP_CLIENT, useFactory: createWorkshopClient, inject: [RelacionesService, getRepositoryToken(WorkshopOrder)] },
    WorkshopSessionStore,
    WorkshopSites,
    WorkshopBookingService,
    WorkshopGatewayService,
    { provide: WORKSHOP_GATEWAY, useExisting: WorkshopGatewayService },
    // Lo que el taller llama en nuestro MCP (decisión 134).
    WorkshopPartnerService,
    // Tienda de repuestos (decisión 135): preparada; sin REPUESTOS_MCP_URL queda sin conexión.
    { provide: PARTS_STORE, useFactory: createPartsStore },
    { provide: WORKSHOP_PARTNER, useExisting: WorkshopPartnerService },
  ],
  exports: [WORKSHOP_GATEWAY, WORKSHOP_PARTNER],
})
export class TallerModule {}
