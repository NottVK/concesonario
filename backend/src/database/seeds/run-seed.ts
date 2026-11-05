import { DataSource } from 'typeorm';
import { buildDataSourceOptions, loadRootEnv } from '../db.config.js';
import { runSeed, seedEmbeddings } from './seed.service.js';

loadRootEnv();

const dataSource = new DataSource(buildDataSourceOptions());
try {
  await dataSource.initialize();
  const result = await runSeed(dataSource);
  console.log(
    `Seed listo: ${result.brands} marcas, ${result.vehicles} vehículos, ${result.users} usuarios, ${result.vins} VIN y ${result.relations} relaciones de prueba.`,
  );
  console.log(await seedEmbeddings(dataSource));
} catch (error: unknown) {
  console.error('Falló el seed:', error);
  process.exitCode = 1;
} finally {
  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }
}
