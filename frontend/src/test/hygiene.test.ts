/**
 * Higiene del código fuente (no de su comportamiento): recorre todos los archivos de `src/` que no son pruebas.
 * Protege reglas de privacidad del proyecto: nada de consola, y el almacenamiento solo donde está justificado.
 */
const sources = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/** Quita comentarios: mencionar "localStorage" para explicar por qué no se usa no es usarlo. */
const stripComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1')

const productionFiles = Object.entries(sources)
  .filter(([path]) => !/\.test\.tsx?$/.test(path) && !path.startsWith('/src/test/') && !path.endsWith('/schema.d.ts'))
  .map(([path, text]): [string, string] => [path, stripComments(text)])

const offenders = (pattern: RegExp, allowed: string[] = []): string[] =>
  productionFiles.filter(([path, text]) => pattern.test(text) && !allowed.includes(path)).map(([path]) => path)

describe('higiene del código fuente', () => {
  it('encuentra los archivos (si esto falla, la prueba no está mirando nada)', () => {
    expect(productionFiles.length).toBeGreaterThan(40)
    expect(productionFiles.some(([path]) => path === '/src/auth/AuthContext.tsx')).toBe(true)
  })

  it('no hay llamadas a console.*: los datos de clientes y las contraseñas no deben acabar en la consola', () => {
    expect(offenders(/\bconsole\s*\.\s*(log|info|warn|error|debug|trace|dir|table)\b/)).toEqual([])
  })

  it('localStorage solo se usa para la señal de cierre de sesión entre pestañas (sin datos)', () => {
    expect(offenders(/\blocalStorage\b/, ['/src/auth/AuthContext.tsx'])).toEqual([])
  })

  it('sessionStorage solo guarda el token y los ids del comparador', () => {
    expect(offenders(/\bsessionStorage\b/, ['/src/api/session.ts', '/src/features/compare/CompareContext.tsx'])).toEqual([])
  })

  it('no hay cookies, IndexedDB, persistencia de la caché, HTML sin escapar ni ejecución dinámica de código', () => {
    expect(offenders(/document\s*\.\s*cookie/)).toEqual([])
    expect(offenders(/\bindexedDB\b|\bopenDatabase\b/)).toEqual([])
    expect(offenders(/persistQueryClient|query-persist-client|createSyncStoragePersister/)).toEqual([])
    expect(offenders(/dangerouslySetInnerHTML|\binnerHTML\s*=/)).toEqual([])
    expect(offenders(/\beval\s*\(|new\s+Function\s*\(/)).toEqual([])
  })

  it('nada de datos en window.name, ni en el estado del historial salvo la ruta de destino del login', () => {
    expect(offenders(/window\s*\.\s*name\s*=/)).toEqual([])
    const withState = offenders(/\bstate\s*=\s*\{\{|\bstate:\s*\{/)
    // Estado de navegación permitido: la ruta de origen (login) y los filtros que recuerda el detalle.
    expect(withState.sort()).toEqual(
      ['/src/auth/guards.tsx', '/src/features/catalog/VehicleCard.tsx'].sort(),
    )
  })
})
