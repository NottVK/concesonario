import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { A2aModule } from './a2a/a2a.module.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './common/jwt-auth.guard.js';
import { RolesGuard } from './common/roles.guard.js';
import { globalThrottleLimit } from './common/throttle.js';
import { ChatModule } from './chat/chat.module.js';
import { InternalAwareThrottlerGuard } from './chat/security/internal-throttler.guard.js';
import { CitasModule } from './citas/citas.module.js';
import { ClientesModule } from './clientes/clientes.module.js';
import { buildDataSourceOptions } from './database/db.config.js';
import { FinanciacionModule } from './financiacion/financiacion.module.js';
import { MarcasModule } from './marcas/marcas.module.js';
import { MetricasModule } from './metricas/metricas.module.js';
import { UsuariosModule } from './usuarios/usuarios.module.js';
import { VehiculosModule } from './vehiculos/vehiculos.module.js';
import { VentasModule } from './ventas/ventas.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'] }),
    TypeOrmModule.forRootAsync({
      useFactory: () => buildDataSourceOptions(),
    }),
    // Límite global por IP; las rutas sensibles lo endurecen con @Throttle().
    ThrottlerModule.forRoot([
      { ttl: 60_000, limit: globalThrottleLimit() },
    ]),
    AuthModule,
    FinanciacionModule,
    MarcasModule,
    VehiculosModule,
    ClientesModule,
    UsuariosModule,
    CitasModule,
    VentasModule,
    MetricasModule,
    ChatModule,
    A2aModule,
  ],
  // El orden importa: primero el límite de peticiones, luego autenticación, luego roles.
  providers: [
    { provide: APP_GUARD, useClass: InternalAwareThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
