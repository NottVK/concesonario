// Utilidades compartidas de la evaluación del chat (herramienta de desarrollo; no es código del producto).
// Usa axios (CLAUDE.md: Axios para HTTP) y reutiliza los extractores de montos del backend compilado
// (`cd backend && npm run build`), que ya tienen sus propias pruebas.
import { createRequire } from 'node:module'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
export const RESULTS_DIR = process.env.RESULTS_DIR ?? join(here, 'results')
export const FIXTURES_FILE = join(here, 'fixtures.json')

function loadAxios() {
  for (const base of [join(root, 'chatbot', 'bench'), join(root, 'backend'), join(root, 'frontend')]) {
    if (existsSync(join(base, 'node_modules', 'axios'))) return createRequire(join(base, 'package.json'))('axios')
  }
  throw new Error('No encuentro axios. Ejecuta `npm install` en chatbot/bench (o en backend/).')
}
export const axios = loadAxios()

export async function loadBackendModules() {
  const dist = join(root, 'backend', 'dist')
  if (!existsSync(join(dist, 'chat', 'text', 'amounts.js'))) {
    throw new Error('Falta backend/dist. Ejecuta `cd backend && npm install && npm run build` y vuelve a intentar.')
  }
  const amounts = await import(pathToFileURL(join(dist, 'chat', 'text', 'amounts.js')).href)
  const prompt = await import(pathToFileURL(join(dist, 'chat', 'agent', 'prompt.js')).href)
  return { ...amounts, ...prompt }
}

export const API_URL = (process.env.API_URL ?? 'http://localhost:8000/api').replace(/\/+$/, '')
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export const http = axios.create({ baseURL: API_URL, validateStatus: () => true, timeout: 180_000 })

/** Una petición con reintentos para 429 (límites de la API) y 503 (proveedor sin cupo): espera y vuelve a intentar. */
export async function request(config, { attempts = 5 } = {}) {
  let response
  for (let attempt = 0; attempt < attempts; attempt++) {
    response = await http.request(config)
    if (response.status === 429) {
      const wait = Number(response.headers['retry-after']) || 20
      await sleep(Math.min(wait, 70) * 1000 + 300)
      continue
    }
    if (response.status === 503 && attempt < attempts - 1) {
      await sleep(15_000)
      continue
    }
    return response
  }
  return response
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true })
}

// ---- Fechas en hora de Bogotá (sin horario de verano: siempre -05:00) ----
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' })
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export const bogotaToday = () => dayFormat.format(new Date())
export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
export const weekdayOf = (isoDate) => new Date(`${isoDate}T12:00:00Z`).getUTCDay()
/** «martes 3 de noviembre». */
export function spanishDate(isoDate) {
  const date = new Date(`${isoDate}T12:00:00Z`)
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} de ${MONTHS[date.getUTCMonth()]}`
}
/** Primer día con el día de la semana pedido (0 = domingo) a partir de `fromIso` (incluido). */
export function nextWeekday(fromIso, weekday) {
  let day = fromIso
  while (weekdayOf(day) !== weekday) day = addDays(day, 1)
  return day
}
