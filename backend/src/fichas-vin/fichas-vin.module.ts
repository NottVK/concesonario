import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FichaVin } from './entities/ficha-vin.entity.js';
import { FichasVinController } from './fichas-vin.controller.js';
import { FichasVinService } from './fichas-vin.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([FichaVin])],
  controllers: [FichasVinController],
  providers: [FichasVinService],
})
export class FichasVinModule {}
