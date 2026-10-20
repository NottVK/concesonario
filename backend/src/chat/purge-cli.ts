import { DataSource } from 'typeorm';
import { buildDataSourceOptions, loadRootEnv } from '../database/db.config.js';
import { purgeExpired } from './session/purge.js';

/** `npm run chat:purge`: aplica la retención del chat (7 días) a mano. La BD sale de las variables del entorno. */
async function main(): Promise<void> {
  loadRootEnv();
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();
  try {
    const result = await purgeExpired(dataSource);
    console.log(`Purga lista: ${result.sessions} sesiones y ${result.proposals} propuestas borradas.`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(`No se pudo purgar: ${error instanceof Error ? error.message : 'error desconocido'}`);
  process.exitCode = 1;
});
