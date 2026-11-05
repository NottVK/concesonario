import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VinRecord } from '../vin/entities/vin-record.entity.js';
import { CONTACT_CRYPTO, ContactCrypto } from './contact-crypto.js';
import { Relationship } from './entities/relationship.entity.js';
import { RelacionesService } from './relaciones.service.js';

/** Relaciones cliente–vehículo (decisión 130). */
@Module({
  imports: [TypeOrmModule.forFeature([Relationship, VinRecord])],
  // Sin BOT_KEY_ENCRYPTION_KEY válida la API no arranca (igual que el MCP).
  providers: [{ provide: CONTACT_CRYPTO, useFactory: () => ContactCrypto.fromEnv() }, RelacionesService],
  exports: [RelacionesService],
})
export class RelacionesModule {}
