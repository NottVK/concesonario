import { loadRootEnv } from '../src/database/db.config.js';

export const TEST_DB_NAME = 'concesionario_test';

// Se ejecuta en cada worker antes de las pruebas: apunta todo a la BD de pruebas.
loadRootEnv();
process.env.DB_NAME = TEST_DB_NAME;
process.env.THROTTLE_LIMIT = '10000';
process.env.THROTTLE_PUBLIC_LIMIT = '10000';
process.env.JWT_SECRET ??= 'secreto-solo-para-pruebas-e2e';
// Las pruebas nunca llaman a un modelo real: el proveedor es el simulado.
process.env.CHAT_PROVIDER = 'mock';
// Embeddings simulados y umbral bajo (el mock solo compara palabras); sin pausa ni topes del chat salvo en sus pruebas de límites.
process.env.EMBEDDING_PROVIDER = 'mock';
process.env.SEARCH_MIN_SIMILARITY = '0.1';
process.env.CHAT_LIMIT_PER_MINUTE = '10000';
process.env.CHAT_LIMIT_PER_HOUR = '10000';
process.env.CHAT_MIN_TURN_GAP_MS = '0';
