import { DataSource } from 'typeorm';
import { buildDataSourceOptions, loadRootEnv } from './db.config.js';

// Punto de entrada del CLI de TypeORM (migration:run / generate / revert).
loadRootEnv();

export default new DataSource(buildDataSourceOptions());
