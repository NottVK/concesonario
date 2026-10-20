// Utilidades compartidas del banco de pruebas del modelo (herramienta de desarrollo; no es código del producto).
// Usa axios del frontend (CLAUDE.md: Axios para HTTP) para no añadir dependencias nuevas al repo.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(here, '..', '..', 'frontend', 'package.json'))
export const axios = require('axios')

export const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434'
export const MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5:3b'

const http = axios.create({ baseURL: OLLAMA_HOST, timeout: 300_000 })

/** Fecha de hoy en Bogotá (YYYY-MM-DD) y su día de la semana, para la línea final del prompt. */
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
 * Muestrea la RAM DISPONIBLE de Windows (incluye la caché recuperable) cada segundo con WMI, que no depende del idioma.
 * `stop()` devuelve el mínimo observado (el pico de uso) y el mínimo de `os.freemem()` (la memoria estrictamente libre).
 */
export function startRamSampler() {
  const shell = spawn('powershell', ['-NoProfile', '-Command', 'while($true){ (Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory).AvailableMBytes; Start-Sleep -Seconds 1 }'], { stdio: ['ignore', 'pipe', 'ignore'] })
  let minAvailable = Infinity
  let minFree = os.freemem() / 1048576
  let samples = 0
  shell.stdout.on('data', (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      const value = Number(line.trim())
      if (line.trim() !== '' && Number.isFinite(value)) {
        minAvailable = Math.min(minAvailable, value)
        samples++
      }
    }
  })
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
      shell.kill()
    },
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
