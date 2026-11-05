import { Logger, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VinRecord } from './entities/vin-record.entity.js';
import { ExternalVinDecoder, externalDecoderEnabled, NhtsaVinClient } from './nhtsa-vin.client.js';
import type { ExternalVinData } from './nhtsa-vin.client.js';
import { VinController } from './vin.controller.js';
import { VinService } from './vin.service.js';

/** Decodificador externo apagado (VIN_DECODER_EXTERNAL=false): solo registro y estructura. */
class DisabledVinDecoder extends ExternalVinDecoder {
  decode(): Promise<ExternalVinData | null> {
    return Promise.resolve(null);
  }
}

/** Registro y lectura de VIN (decisiones 129 y 132). */
@Module({
  imports: [TypeOrmModule.forFeature([VinRecord])],
  controllers: [VinController],
  providers: [
    VinService,
    {
      provide: ExternalVinDecoder,
      useFactory: (): ExternalVinDecoder => {
        const enabled = externalDecoderEnabled();
        new Logger('VinModule').log(enabled ? 'VIN: se completa con la base pública de la NHTSA' : 'VIN: NHTSA apagada (VIN_DECODER_EXTERNAL=false)');
        return enabled ? new NhtsaVinClient() : new DisabledVinDecoder();
      },
    },
  ],
  exports: [VinService],
})
export class VinModule {}
