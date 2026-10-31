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
// Los e2e existentes cubren todas las tools y el prompt v2; el valor por defecto (solo ficha por VIN) se prueba en fichas-vin.e2e-spec.ts.
process.env.CHAT_ALLOWED_TOOLS = 'buscar_vehiculos,detalle_vehiculo,comparar_vehiculos,simular_credito,agendar_cita,preguntar_a_otro_bot,consultar_ficha_vin,reportar_falla_garantia,consultar_estado_garantia';
process.env.CHAT_PROMPT_VERSION = 'v2';
// Embeddings simulados y umbral bajo (el mock solo compara palabras); sin pausa ni topes del chat salvo en sus pruebas de límites.
process.env.EMBEDDING_PROVIDER = 'mock';
process.env.SEARCH_MIN_SIMILARITY = '0.1';
process.env.CHAT_LIMIT_PER_MINUTE = '10000';
process.env.CHAT_LIMIT_PER_HOUR = '10000';
process.env.CHAT_MIN_TURN_GAP_MS = '0';
// Secretos del MCP SOLO para las pruebas (nunca los del .env del usuario): se fijan aquí, después de cargar el entorno.
process.env.MCP_KEY_PEPPER = 'pepper-solo-para-pruebas-e2e-0123456789abcdef';
process.env.BOT_KEY_ENCRYPTION_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
delete process.env.MCP_KEY_PEPPER_PREVIOUS;
delete process.env.MCP_KEY_PEPPER_VERSION;
// URL pública del bot para la tarjeta A2A: fija en pruebas (nunca la del .env del usuario).
process.env.A2A_PUBLIC_BASE_URL = 'https://bot.automax.test';
delete process.env.A2A_DEV_ALLOWED_TARGETS;
