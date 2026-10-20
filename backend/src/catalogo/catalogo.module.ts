import { Module } from '@nestjs/common';
import { MarcasModule } from '../marcas/marcas.module.js';
import { VehiculosModule } from '../vehiculos/vehiculos.module.js';
import { PublicCatalogService } from './public-catalog.service.js';

/** Catálogo público para canales de terceros: la ÚNICA puerta entre el MCP y los datos de vehículos y marcas. */
@Module({
  imports: [VehiculosModule, MarcasModule],
  providers: [PublicCatalogService],
  exports: [PublicCatalogService],
})
export class CatalogoModule {}
