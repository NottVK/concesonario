import axios from 'axios';
import { loadRootEnv } from '../../database/db.config.js';
import { McpPartsStore, partsStoreConfig } from './parts-store.js';

/**
 * `npm run tienda:probar` (decisión 135): comprueba la conexión con la tienda de repuestos ANTES de dejarla activa.
 * Usa REPUESTOS_MCP_URL y REPUESTOS_MCP_TOKEN (del .env o del comando) y hace las pruebas acordadas con la tienda:
 * salud, una compra de suspensión del VIN de REL-1006 y ninguna de frenos. No muestra el token.
 */
const VIN_REL_1006 = '3MZBP2SM1SM600006';

async function health(url: URL): Promise<boolean> {
  const target = new URL('/api/salud', url.origin);
  try {
    const response = await axios.get<unknown>(target.toString(), { timeout: 6000, maxRedirects: 0, validateStatus: () => true });
    console.log(`1) Salud ${target.toString()} → HTTP ${response.status} ${JSON.stringify(response.data).slice(0, 80)}`);
    return response.status === 200;
  } catch (error) {
    console.log(`1) Salud ${target.toString()} → sin respuesta (${error instanceof Error ? error.message.slice(0, 80) : 'error'})`);
    return false;
  }
}

async function purchases(store: McpPartsStore, especialidad: string, expectAny: boolean, step: string): Promise<boolean> {
  try {
    const check = await store.purchasesFor({ vin: VIN_REL_1006, especialidad });
    const count = check.conectada ? check.compras.length : 0;
    const ok = expectAny ? count > 0 : count === 0;
    console.log(`${step}) REL-1006 ${especialidad}: ${count} compra(s) → ${ok ? 'OK' : expectAny ? 'se esperaba al menos una' : 'se esperaba ninguna'}`);
    return ok;
  } catch (error) {
    console.log(`${step}) REL-1006 ${especialidad}: falló (${error instanceof Error ? error.name : 'error'})`);
    return false;
  }
}

async function main(): Promise<void> {
  loadRootEnv();
  const config = partsStoreConfig();
  if (!config) {
    console.log('Falta REPUESTOS_MCP_URL (y REPUESTOS_MCP_TOKEN). En PowerShell, sin tocar el .env:');
    console.log("  $env:REPUESTOS_MCP_URL='http://<ip-de-la-tienda>:3100/mcp'; $env:REPUESTOS_MCP_TOKEN='<token>'; npm run tienda:probar");
    console.log('Pasos completos: docs/DOCUMENTACION-TECNICA.md, sección 9.5.');
    process.exitCode = 1;
    return;
  }
  console.log(`Probando la tienda en ${config.url.toString()} (el token no se muestra)`);
  const store = new McpPartsStore(config);
  const results = [
    await health(config.url),
    await purchases(store, 'suspension', true, '2'),
    await purchases(store, 'frenos', false, '3'),
  ];
  const ok = results.every(Boolean);
  console.log(ok
    ? 'Todo bien: deja REPUESTOS_MCP_URL y REPUESTOS_MCP_TOKEN en el .env y reinicia la API.'
    : 'Algo falló: no actives la tienda todavía (las garantías saldrían «No se pudo verificar con la tienda»).');
  process.exitCode = ok ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(`No se pudo probar la tienda: ${error instanceof Error ? error.message : 'error desconocido'}`);
  process.exitCode = 1;
});
