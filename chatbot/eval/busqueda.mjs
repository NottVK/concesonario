// Evaluación de la búsqueda semántica (herramienta de desarrollo; no es código del producto).
// 10 consultas en lenguaje natural contra GET /api/vehiculos/buscar; cada una exige una condición en el top 3.
// Aprueba con 8 de 10. Una consulta más (fuera de catálogo) es solo INFORMATIVA: con nomic-embed-text las
// consultas sin relación puntúan tan alto como las buenas, así que la búsqueda no puede decir «no hay»; eso lo
// decide el bot (ver la pregunta 3 de la evaluación del chat).
//
// Uso (con la API encendida, con vectores ya calculados: `npm run embeddings:sync` en backend/):
//   node chatbot/eval/busqueda.mjs
// Variables: API_URL (por defecto http://localhost:8000/api), RESULTS_DIR (por defecto chatbot/eval/results).
// La API limita esta ruta a 10 por minuto; el script espera si recibe 429.
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const candidates = [join(here, '..', 'bench', 'package.json'), join(here, '..', '..', 'backend', 'package.json'), join(here, '..', '..', 'frontend', 'package.json')]
const base = candidates.find((file) => existsSync(join(dirname(file), 'node_modules', 'axios')))
if (!base) throw new Error('No encuentro axios. Ejecuta `npm install` en chatbot/bench (o en backend/).')
const axios = createRequire(base)('axios')

const API_URL = (process.env.API_URL ?? 'http://localhost:8000/api').replace(/\/+$/, '')
const RESULTS_DIR = process.env.RESULTS_DIR ?? join(here, 'results')

const SMALL = ['Picanto', 'Kwid', 'Spark GT', 'March', 'Grand i10', 'Onix', 'Sandero', 'Mazda 2', 'Rio', 'Accent', 'Yaris', 'Fiesta', 'Logan', 'Polo', 'Versa', 'Virtus']
const FAMILY = ['Fortuner', 'Land Cruiser Prado', 'Explorer', 'Sorento', 'Santa Fe', 'Tucson', 'Sportage', 'Equinox', 'X5', 'Territory', 'Captiva', 'CX-50', 'Koleos', 'Tiguan', 'Taos', 'X-Trail', 'RAV4', 'Escape', 'Bronco Sport', 'X3', 'CX-5', 'Seltos', 'Creta', 'Qashqai']
const PICKUPS = ['Hilux', 'Ranger', 'Frontier', 'Amarok']
const SEVEN = ['Fortuner', 'Land Cruiser Prado', 'Explorer', 'Sorento', 'Santa Fe', 'X5', 'Captiva', 'X-Trail']
const SUV_COMPACT = ['CX-30', 'Seltos', 'Creta', 'Kicks', 'Tracker', 'T-Cross', 'Duster', 'Captur', 'Corolla Cross', 'Groove', 'Territory', 'X1', 'Taos', 'Tucson']

/** [consulta, descripción de la condición, predicado sobre un vehículo] */
const CASES = [
  ['económico para la ciudad', 'un auto pequeño/económico', (v) => SMALL.includes(v.model)],
  ['camioneta para familia', 'una camioneta o SUV familiar', (v) => FAMILY.includes(v.model) || PICKUPS.includes(v.model)],
  ['algo eléctrico', 'combustible eléctrico', (v) => v.fuel === 'electrico'],
  ['camioneta de siete puestos para viajes largos', 'una SUV grande de siete puestos', (v) => SEVEN.includes(v.model)],
  ['pickup para trabajo en el campo', 'una pickup', (v) => PICKUPS.includes(v.model)],
  ['carro híbrido para ahorrar gasolina', 'combustible híbrido', (v) => v.fuel === 'hibrido'],
  ['deportivo descapotable', 'el Mazda MX-5', (v) => v.model === 'MX-5'],
  ['lujo alemán', 'una BMW', (v) => v.brand?.name === 'BMW'],
  ['automático barato y usado', 'usado, automático y de menos de 100 millones', (v) => v.status === 'usado' && v.transmission === 'automatica' && Number(v.price) <= 100_000_000],
  ['SUV compacta nueva', 'una SUV compacta nueva', (v) => v.status === 'nuevo' && SUV_COMPACT.includes(v.model)],
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function search(q, attempt = 0) {
  const response = await axios.get(`${API_URL}/vehiculos/buscar`, { params: { q, limit: 5 }, validateStatus: () => true })
  if (response.status === 429 && attempt < 2) {
    const wait = Number(response.headers['retry-after']) || 60
    console.log(`  (límite de la API; espero ${wait} s)`)
    await sleep(wait * 1000 + 500)
    return search(q, attempt + 1)
  }
  if (response.status === 503) throw new Error('La API responde 503: la búsqueda inteligente no está disponible (¿Ollama apagado?).')
  if (response.status !== 200) throw new Error(`La API respondió ${response.status}: ${JSON.stringify(response.data)}`)
  return response.data
}

const label = (v) => `${v.brand?.name ?? '?'} ${v.model} (${v.status}, ${v.fuel}, $${Number(v.price).toLocaleString('es-CO')})`

const rows = []
let passed = 0
for (const [query, expectation, predicate] of CASES) {
  const found = await search(query)
  const top = found.slice(0, 3)
  const ok = top.some(predicate)
  if (ok) passed += 1
  rows.push({ query, expectation, ok, top: top.map(label), returned: found.length })
  console.log(`${ok ? 'PASA ' : 'FALLA'}  «${query}» → ${expectation}`)
  for (const line of top.map(label)) console.log(`        · ${line}`)
  if (found.length === 0) console.log('        · (sin resultados)')
}

console.log(`\nResultado: ${passed}/${CASES.length} (aprueba con 8 de 10)`)
mkdirSync(RESULTS_DIR, { recursive: true })
const file = join(RESULTS_DIR, `busqueda-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
writeFileSync(file, JSON.stringify({ apiUrl: API_URL, passed, total: CASES.length, rows }, null, 2))
console.log(`Guardado en ${file}`)
process.exitCode = passed >= 8 ? 0 : 1
