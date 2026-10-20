import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

const FILES = sourceFiles(here);
const importsOf = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!);

describe('Higiene de chat/: el bot solo habla con la API pública', () => {
  it('no importa entidades ni repositorios de vehículos, clientes, citas ni ventas', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      for (const specifier of importsOf(file)) {
        if (/\.\.\/(vehiculos|clientes|citas|ventas|usuarios|marcas)\/.*(entities|\.service|\.repository)/.test(specifier)) {
          offenders.push(`${relative(here, file)} → ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no usa repositorios ni acceso directo a esas tablas (solo las de chat)', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const text = readFileSync(file, 'utf8');
      if (/FROM\s+"?(vehiculos|clientes|citas|ventas|usuarios)\b|INTO\s+"?(vehiculos|clientes|citas|ventas)\b|UPDATE\s+"?(vehiculos|clientes|citas|ventas)\b/i.test(text)) {
        offenders.push(relative(here, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('el único código que crea citas es el servicio de confirmación (ninguna tool)', () => {
    const users = FILES.filter((file) => readFileSync(file, 'utf8').includes('createAppointment')).map((f) => relative(here, f).replace(/\\/g, '/'));
    expect(users.sort()).toEqual(['api/public-api.client.ts', 'appointment-confirm.service.ts']);
    for (const file of FILES.filter((f) => f.includes(`${join('chat', 'tools')}`) || relative(here, f).startsWith('tools'))) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/createAppointment|'\/citas'/);
    }
  });

  it('no usa fetch (Axios para HTTP) ni lee .env', () => {
    for (const file of FILES) {
      const text = readFileSync(file, 'utf8');
      expect(text, relative(here, file)).not.toMatch(/\bfetch\(/);
      expect(text, relative(here, file)).not.toMatch(/readFileSync\([^)]*\.env/);
    }
  });

  it('ningún archivo registra claves ni el secreto interno', () => {
    for (const file of FILES) {
      const text = readFileSync(file, 'utf8');
      const logCalls = [...text.matchAll(/(?:logger|console)\.\w+\(([^;]*)\)/g)].map((m) => m[1]!).join('\n');
      expect(logCalls, relative(here, file)).not.toMatch(/apiKey|GROQ_API_KEY|secret\.header|\.header\(\)|Authorization/i);
    }
  });
});
