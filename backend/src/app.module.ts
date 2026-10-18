import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { A2aModule } from './a2a/a2a.module.js';
import { ChatModule } from './chat/chat.module.js';
import { CitasModule } from './citas/citas.module.js';
import { ClientesModule } from './clientes/clientes.module.js';
import { buildDataSourceOptions } from './database/db.config.js';
import { MarcasModule } from './marcas/marcas.module.js';
import { UsuariosModule } from './usuarios/usuarios.module.js';
import { VehiculosModule } from './vehiculos/vehiculos.module.js';
import { VentasModule } from './ventas/ventas.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'] }),
    TypeOrmModule.forRootAsync({
      useFactory: () => buildDataSourceOptions(),
    }),
    MarcasModule,
    VehiculosModule,
    ClientesModule,
    UsuariosModule,
    CitasModule,
    VentasModule,
    ChatModule,
    A2aModule,
  ],
})
export class AppModule {}
