import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { consultarPrecioSchema, consultarStockSchema, INPUT_JSON_SCHEMAS, listarMarcasSchema } from './tools/schemas.js';
import { TOOLS } from './tools/tools.js';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}
const importsOf = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!);

describe('higiene del servidor MCP: solo habla con el catálogo público', () => {
  const protocol = [...sources(join(here, 'tools')), ...sources(join(here, 'server')), join(here, 'mcp.controller.ts')];

  it('las tools y el servidor no importan TypeORM, entidades, repositorios ni servicios de vehículos, marcas, clientes, citas o ventas', () => {
    const offenders: string[] = [];
    for (const file of protocol) {
      for (const specifier of importsOf(file)) {
        const forbidden =
          /typeorm|^pg$|\/entities\//.test(specifier) ||
          /\.\.\/(\.\.\/)?(vehiculos|marcas|clientes|citas|ventas|usuarios|financiacion|metricas)\//.test(specifier);
        // La ÚNICA excepción: el servicio de catálogo público (campos explícitos, nunca entidades).
        if (forbidden && !/a2a\/entities\/bot-exchange\.entity/.test(specifier)) offenders.push(`${relative(srcRoot, file)} → ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
    // Y sí usan el catálogo público.
    expect(protocol.some((file) => importsOf(file).some((s) => s.includes('catalogo/public-catalog.service')))).toBe(true);
  });

  it('el catálogo público no usa repositorios ni TypeORM: solo los servicios del catálogo', () => {
    for (const file of sources(join(srcRoot, 'catalogo'))) {
      const specifiers = importsOf(file);
      expect(specifiers.filter((s) => /typeorm|^pg$/.test(s)), relative(srcRoot, file)).toEqual([]);
      expect(readFileSync(file, 'utf8')).not.toMatch(/Repository|createQueryBuilder|\.query\(/);
    }
  });

  it('ninguna tool es de escritura y agendar_cita no existe en ninguna parte del servidor MCP', () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual(['consultar_precio', 'consultar_stock', 'listar_marcas']);
    for (const file of protocol) {
      expect(readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), relative(srcRoot, file)).not.toMatch(/agendar_cita|createAppointment|\.save\(|\.insert\(|\.update\(/);
    }
  });

  it('nada del MCP registra la key ni la cabecera Authorization', () => {
    for (const file of sources(here)) {
      const logCalls = [...readFileSync(file, 'utf8').matchAll(/(?:logger|console)\.\w+\(([^;]*)\)/g)].map((m) => m[1]!).join('\n');
      expect(logCalls, relative(srcRoot, file)).not.toMatch(/apiKey|authorization|\bkey\b|keyHash|pepper|secret/i);
    }
  });

  it('no usa fetch (Axios para HTTP) ni lee .env', () => {
    for (const file of sources(here)) {
      const text = readFileSync(file, 'utf8');
      expect(text, relative(srcRoot, file)).not.toMatch(/\bfetch\(/);
      expect(text, relative(srcRoot, file)).not.toMatch(/readFileSync\([^)]*\.env/);
    }
  });
});

describe('esquemas de las tools', () => {
  it('consultar_stock: tipos exactos, límites y al menos marca o modelo', () => {
    const ok = [{ marca: 'Mazda' }, { modelo: 'CX-5', anio: 2024, estado: 'nuevo', limite: 10 }, { marca: 'Ｍａｚｄａ' }, { marca: '  Mazda   3  ' }];
    for (const args of ok) expect(consultarStockSchema.safeParse(args).success, JSON.stringify(args)).toBe(true);
    const bad: unknown[] = [
      undefined, null, 'texto', [], {}, { anio: 2024 }, { marca: 5 }, { marca: '' }, { marca: ' ' }, { marca: 'x'.repeat(61) },
      { marca: 'a<b>' }, { marca: "o'brien" }, { marca: 'a;b' }, { marca: 'a\u0000b' }, { marca: '‮abc' }, { marca: 'Mazda', anio: '2024' },
      { marca: 'Mazda', anio: 2024.5 }, { marca: 'Mazda', anio: 1989 }, { marca: 'Mazda', anio: 2101 }, { marca: 'Mazda', limite: 0 },
      { marca: 'Mazda', limite: 11 }, { marca: 'Mazda', estado: 'vendido' }, { marca: 'Mazda', otro: 1 }, { marca: 'Mazda', __proto__: { x: 1 }, y: 1 },
    ];
    for (const args of bad) expect(consultarStockSchema.safeParse(args).success, JSON.stringify(args)).toBe(false);
    expect(consultarStockSchema.parse({ marca: 'Ｍａｚｄａ' }).marca).toBe('Mazda'); // NFKC
    expect(consultarStockSchema.parse({ marca: '  Mazda   3 ' }).marca).toBe('Mazda 3');
    // Los saltos de línea y tabuladores son espacio en blanco: se colapsan (no pasan como control).
    expect(consultarStockSchema.parse({ marca: 'a\n\tb' }).marca).toBe('a b');
    expect(consultarStockSchema.parse({ marca: 'Mazda' }).limite).toBe(5);
  });

  it('consultar_precio: o vehiculo_id o marca+modelo, nunca mezclados', () => {
    for (const ok of [{ vehiculo_id: 1 }, { vehiculo_id: 2_147_483_647 }, { marca: 'Kia', modelo: 'Sportage' }, { marca: 'Kia', modelo: 'Sportage', anio: 2024 }]) {
      expect(consultarPrecioSchema.safeParse(ok).success, JSON.stringify(ok)).toBe(true);
    }
    for (const bad of [{}, { vehiculo_id: 0 }, { vehiculo_id: -1 }, { vehiculo_id: 2_147_483_648 }, { vehiculo_id: '1' }, { vehiculo_id: 1.5 }, { vehiculo_id: 1, marca: 'Kia' },
      { marca: 'Kia' }, { modelo: 'Sportage' }, { marca: 'Kia', modelo: 'Sportage', vehiculo_id: 1 }, { vehiculo_id: 1, x: 1 }]) {
      expect(consultarPrecioSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('listar_marcas no admite argumentos', () => {
    expect(listarMarcasSchema.safeParse({}).success).toBe(true);
    expect(listarMarcasSchema.safeParse({ x: 1 }).success).toBe(false);
  });

  it('los esquemas JSON publicados coinciden con los de zod (mismas propiedades) y no admiten propiedades extra', () => {
    const keys = (schema: object): string[] => Object.keys((schema as { properties: object }).properties).sort();
    expect(keys(INPUT_JSON_SCHEMAS.consultar_stock)).toEqual(['anio', 'estado', 'limite', 'marca', 'modelo']);
    expect(keys(INPUT_JSON_SCHEMAS.consultar_precio)).toEqual(['anio', 'marca', 'modelo', 'vehiculo_id']);
    expect(keys(INPUT_JSON_SCHEMAS.listar_marcas)).toEqual([]);
    for (const schema of Object.values(INPUT_JSON_SCHEMAS)) expect((schema as { additionalProperties: boolean }).additionalProperties).toBe(false);
    for (const tool of TOOLS) expect(tool.description.length).toBeLessThan(400);
  });
});
