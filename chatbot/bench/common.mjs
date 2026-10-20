// Utilidades compartidas del banco de pruebas del modelo (herramienta de desarrollo; no es código del producto).
// Usa axios (CLAUDE.md: Axios para HTTP): el propio de `chatbot/bench` (npm install) o, si falta, el del frontend.
import { execSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const here = dirname(fileURLToPath(import.meta.url))
export const RESULTS_DIR = process.env.RESULTS_DIR ?? join(here, 'results')

function loadAxios() {
  const candidates = [join(here, 'package.json'), join(here, '..', '..', 'frontend', 'package.json')]
  for (const base of candidates) {
    if (!existsSync(join(dirname(base), 'node_modules', 'axios'))) continue
    return createRequire(base)('axios')
  }
  throw new Error('No encuentro axios. Ejecuta `npm install` dentro de chatbot/bench.')
}
export const axios = loadAxios()

export const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434'
export const MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5:3b'

const http = axios.create({ baseURL: OLLAMA_HOST, timeout: 600_000 })

/** Fecha de hoy en Bogotá (día de la semana y YYYY-MM-DD) para la línea final del prompt. */
export function bogotaToday() {
  const parts = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const get = (type) => parts.find((p) => p.type === type)?.value
  return `${get('weekday')} ${get('year')}-${get('month')}-${get('day')}`
}

/** Prompt de sistema de PRUEBA: del mismo tamaño y forma que el v1 (el real se escribe en el paso 4). */
export function systemPrompt() {
  const text = readFileSync(join(here, 'prompt.bench.es.md'), 'utf8')
  return `${text.trim()}\n\nHoy es ${bogotaToday()} (hora de Bogotá).`
}

/** Una llamada a Ollama sin streaming. Devuelve el mensaje y las métricas que reporta el servidor (en ms). */
export async function chat({ messages, tools, numCtx, keepAlive = '10m', numPredict = 300 }) {
  const started = performance.now()
  const { data } = await http.post('/api/chat', {
    model: MODEL,
    messages,
    ...(tools ? { tools } : {}),
    stream: false,
    keep_alive: keepAlive,
    options: { num_ctx: numCtx, temperature: 0, seed: 42, num_predict: numPredict },
  })
  const ms = (ns) => (ns ?? 0) / 1e6
  return {
    message: data.message,
    wallMs: performance.now() - started,
    loadMs: ms(data.load_duration),
    promptMs: ms(data.prompt_eval_duration),
    evalMs: ms(data.eval_duration),
    promptTokens: data.prompt_eval_count ?? 0,
    evalTokens: data.eval_count ?? 0,
  }
}

/** Descarga el modelo de la memoria (para medir el arranque en frío). */
export async function unload() {
  await http.post('/api/generate', { model: MODEL, keep_alive: 0 })
  // Ollama tarda un instante en liberar la memoria.
  await new Promise((resolve) => setTimeout(resolve, 3000))
}

/** Lo que Ollama dice que tiene cargado (tamaño en memoria y cuánto va en GPU). */
export async function loadedInfo() {
  const { data } = await http.get('/api/ps')
  const entry = (data.models ?? []).find((m) => m.name === MODEL || m.model === MODEL)
  return entry ? { sizeGB: +(entry.size / 1e9).toFixed(2), vramGB: +((entry.size_vram ?? 0) / 1e9).toFixed(2), contextLength: entry.context_length ?? null } : null
}

/**
 * Interpreta la salida de `vm_stat` de macOS y devuelve la RAM DISPONIBLE en MB: libre + inactiva + especulativa
 * (la memoria que el sistema puede dar sin tocar disco). Devuelve null si el texto no trae esos datos.
 */
export function parseVmStat(text) {
  const pageSize = Number(/page size of (\d+) bytes/.exec(text)?.[1] ?? 16384)
  const pages = (label) => Number(new RegExp(`^${label}:\\s+(\\d+)\\.`, 'm').exec(text)?.[1] ?? NaN)
  const total = pages('Pages free') + pages('Pages inactive') + pages('Pages speculative')
  return Number.isFinite(total) ? Math.round((total * pageSize) / 1048576) : null
}

/** Lee la memoria disponible en Linux (`MemAvailable` de /proc/meminfo) en MB. */
export function parseMeminfo(text) {
  const kb = Number(/^MemAvailable:\s+(\d+) kB/m.exec(text)?.[1] ?? NaN)
  return Number.isFinite(kb) ? Math.round(kb / 1024) : null
}

/**
 * Muestrea cada segundo la RAM DISPONIBLE del sistema y guarda el mínimo (el pico de uso):
 *  - Windows: WMI `AvailableMBytes` (no depende del idioma).
 *  - macOS: `vm_stat` (libre + inactiva + especulativa).
 *  - Linux: `MemAvailable`.
 * `minFreeMB` es la memoria estrictamente libre según `os.freemem()` (más pesimista).
 */
export function startRamSampler() {
  let minAvailable = Infinity
  let minFree = os.freemem() / 1048576
  let samples = 0
  const record = (mb) => {
    if (mb !== null && Number.isFinite(mb)) {
      minAvailable = Math.min(minAvailable, mb)
      samples++
    }
  }
  let stopSource = () => {}

  if (process.platform === 'win32') {
    const shell = spawn('powershell', ['-NoProfile', '-Command', 'while($true){ (Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory).AvailableMBytes; Start-Sleep -Seconds 1 }'], { stdio: ['ignore', 'pipe', 'ignore'] })
    shell.stdout.on('data', (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) if (line.trim() !== '') record(Number(line.trim()))
    })
    stopSource = () => shell.kill()
  } else {
    const read = () => {
      try {
        if (process.platform === 'darwin') record(parseVmStat(execSync('vm_stat', { encoding: 'utf8' })))
        else record(parseMeminfo(readFileSync('/proc/meminfo', 'utf8')))
      } catch (error) {
        // Si el sistema no responde en ese segundo se omite la muestra; el mínimo se calcula con las demás.
        process.stderr.write(`(muestreo de RAM omitido: ${error.message})\n`)
      }
    }
    read()
    const timer = setInterval(read, 1000)
    stopSource = () => clearInterval(timer)
  }
  const freeTimer = setInterval(() => {
    minFree = Math.min(minFree, os.freemem() / 1048576)
  }, 1000)

  return {
    /** Reinicia los mínimos (se llama justo antes de cada medición). */
    reset() {
      minAvailable = Infinity
      minFree = os.freemem() / 1048576
    },
    snapshot() {
      return { minAvailableMB: Number.isFinite(minAvailable) ? Math.round(minAvailable) : null, minFreeMB: Math.round(minFree), samples }
    },
    stop() {
      clearInterval(freeTimer)
      stopSource()
    },
  }
}

/** Datos de la máquina y de Ollama que se guardan junto a cada resultado (para poder compararlos). */
export async function environmentInfo() {
  let ollamaVersion = null
  try {
    ollamaVersion = (await http.get('/api/version')).data.version ?? null
  } catch (error) {
    ollamaVersion = `no responde (${error.message})`
  }
  let memoryPressure = null
  if (process.platform === 'darwin') {
    try {
      memoryPressure = execSync('memory_pressure -Q', { encoding: 'utf8' }).trim()
    } catch (error) {
      memoryPressure = `no disponible (${error.message})`
    }
  }
  return {
    // `BENCH_HOST_LABEL` evita que el nombre real del equipo quede en los archivos de resultados (y en el repo).
    host: process.env.BENCH_HOST_LABEL ?? os.hostname(),
    platform: `${process.platform}/${process.arch}`,
    cpu: os.cpus()[0]?.model ?? null,
    cores: os.cpus().length,
    totalRamGB: +(os.totalmem() / 1073741824).toFixed(1),
    node: process.version,
    ollamaHost: OLLAMA_HOST,
    ollamaVersion,
    memoryPressure,
  }
}

export const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
export const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}

/** Último archivo de resultados que empieza por `prefix` (por nombre, que lleva la fecha). */
export function latestResult(prefix) {
  if (!existsSync(RESULTS_DIR)) return null
  const files = readdirSync(RESULTS_DIR).filter((f) => f.startsWith(prefix) && f.endsWith('.json')).sort()
  return files.length ? join(RESULTS_DIR, files[files.length - 1]) : null
}

export const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '')
export const safeName = (text) => text.replace(/[^a-zA-Z0-9.]+/g, '_')
