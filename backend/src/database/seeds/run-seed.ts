import { DataSource } from 'typeorm';
import { buildDataSourceOptions, loadRootEnv } from '../db.config.js';
import { runSeed } from './seed.service.js';

loadRootEnv();

const dataSource = new DataSource(buildDataSourceOptions());
try {
  await dataSource.initialize();
  const result = await runSeed(dataSource);
  console.log(
    `Seed listo: ${result.brands} marcas, ${result.vehicles} vehículos, ${result.users} usuarios.`,
  );
} catch (error: unknown) {
  console.error('Falló el seed:', error);
  process.exitCode = 1;
} finally {
  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }
}
