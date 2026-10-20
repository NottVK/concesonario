// Medición de tiempo de respuesta y memoria del modelo local (paso 1 de la Fase 4).
// Uso (sin leer .env; todo por variables de entorno):
//   OLLAMA_MODEL=qwen2.5:7b RUNS=5 CTXS=4096,2048 node bench.mjs
// El archivo de resultados se reescribe después de CADA medición: si el proceso se detiene, lo medido hasta ahí queda guardado.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MODEL, OLLAMA_HOST, RESULTS_DIR, chat, environmentInfo, loadedInfo, median, percentile, safeName, stamp, startRamSampler, systemPrompt, unload } from './common.mjs'
import { TOOLS, runStubTool } from './tools.mjs'

const RUNS = Number(process.env.RUNS ?? 5)
const CTXS = (process.env.CTXS ?? '4096,2048').split(',').map(Number)
const COLD_RUNS = Number(process.env.COLD_RUNS ?? 3)
const MAX_LOOPS = 4

/** Diez turnos de historial (9 previos + el nuevo) para el peor caso de contexto. */
function longHistory() {
  const pairs = [
    ['Hola, busco una camioneta para mi familia', 'Con gusto. ¿Qué presupuesto tienes en mente?'],
    ['Unos 150 millones', 'Perfecto, puedo buscarte opciones de ese rango. ¿Prefieres nuevo o usado?'],
    ['Usado está bien', 'Entendido. ¿Algún combustible en particular?'],
    ['Híbrida si se puede', 'Voy a revisar el catálogo con esos filtros.'],
    ['¿Qué tal el Kia Sportage?', 'Es una buena opción familiar; si quieres te muestro su ficha.'],
    ['Sí, muéstrame la ficha', 'Aquí tienes la ficha del Kia Sportage 2022 con sus datos principales.'],
    ['¿Y cómo sería el crédito?', 'Puedo simularlo: necesito la cuota inicial y el plazo en meses.'],
    ['Con 30 millones de inicial', 'Listo, ¿a cuántos meses lo quieres? Va de 12 a 84.'],
    ['A 60 meses', 'Ya tengo los datos para simularlo; dame un momento.'],
  ]
  return pairs.flatMap(([user, assistant]) => [{ role: 'user', content: user }, { role: 'assistant', content: assistant }])
}

const CASES = [
  { id: 'a_saludo', label: 'Saludo sin tool', history: [], question: 'Hola, buenas tardes' },
  { id: 'b_una_tool', label: 'Una tool y respuesta', history: [], question: '¿Cuánto cuesta una Mazda CX-5?' },
  { id: 'c_dos_tools', label: 'Dos tools encadenadas', history: [], question: 'Busca SUV de gasolina de menos de 150 millones y dame el detalle del más barato' },
  { id: 'd_respuesta_larga', label: 'Respuesta larga (5 vehículos)', history: [], question: 'Muéstrame todas las camionetas que tengan y compáralas en una lista' },
  { id: 'e_diez_turnos', label: 'Conversación de 10 turnos', history: longHistory(), question: 'Entonces simula el crédito del Kia Sportage con 30 millones de inicial a 60 meses' },
]

/** Un turno completo: el modelo pide tools, se simulan, y se repite hasta que responde con texto. */
async function runTurn(testCase, numCtx) {
  const messages = [{ role: 'system', content: systemPrompt() }, ...testCase.history, { role: 'user', content: testCase.question }]
  const totals = { wallMs: 0, loadMs: 0, promptMs: 0, evalMs: 0, evalTokens: 0, maxPromptTokens: 0, llmCalls: 0, toolCalls: 0 }
  const started = performance.now()
  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    const result = await chat({ messages, tools: TOOLS, numCtx })
    totals.llmCalls++
    totals.loadMs += result.loadMs
    totals.promptMs += result.promptMs
    totals.evalMs += result.evalMs
    totals.evalTokens += result.evalTokens
    totals.maxPromptTokens = Math.max(totals.maxPromptTokens, result.promptTokens)
    messages.push(result.message)
    const calls = result.message.tool_calls ?? []
    if (calls.length === 0) break
    for (const call of calls) {
      totals.toolCalls++
      messages.push({ role: 'tool', content: runStubTool(call.function.name, call.function.arguments ?? {}), tool_name: call.function.name })
    }
  }
  totals.wallMs = performance.now() - started
  totals.tokensPerSecond = totals.evalMs > 0 ? totals.evalTokens / (totals.evalMs / 1000) : 0
  // Tiempo hasta el primer token aproximado: carga + procesar el prompt (sumado sobre las llamadas del turno).
  totals.ttftApproxMs = totals.loadMs + totals.promptMs
  return totals
}

const sec = (ms) => +(ms / 1000).toFixed(1)
const environment = await environmentInfo()
const results = { model: MODEL, host: OLLAMA_HOST, startedAt: new Date().toISOString(), finished: false, runs: RUNS, environment, cells: [], cold: [] }
mkdirSync(RESULTS_DIR, { recursive: true })
const file = join(RESULTS_DIR, `bench-${safeName(MODEL)}-${safeName(environment.host)}-${stamp()}.json`)
const save = () => writeFileSync(file, JSON.stringify(results, null, 2))

const sampler = startRamSampler()
try {
  console.log(`Equipo: ${environment.platform}, ${environment.cpu}, ${environment.totalRamGB} GB de RAM, Ollama ${environment.ollamaVersion}`)
  await new Promise((resolve) => setTimeout(resolve, 2500)) // primer muestreo de RAM
  results.baseline = sampler.snapshot()
  console.log(`Base: RAM disponible ${results.baseline.minAvailableMB} MB, libre estricta ${results.baseline.minFreeMB} MB`)
  save()

  for (const numCtx of CTXS) {
    // Arranque en frío: descargar el modelo y medir la primera respuesta (caso b).
    for (let i = 0; i < COLD_RUNS; i++) {
      await unload()
      sampler.reset()
      const turn = await runTurn(CASES[1], numCtx)
      const info = await loadedInfo()
      results.cold.push({ numCtx, ...turn, ...sampler.snapshot(), loaded: info })
      console.log(`[frío ctx=${numCtx}] total ${sec(turn.wallMs)} s, carga ${sec(turn.loadMs)} s, RAM disp. mín ${sampler.snapshot().minAvailableMB} MB`)
      save()
    }
    for (const testCase of CASES) {
      await runTurn(testCase, numCtx) // calentamiento descartado
      const measured = []
      for (let i = 0; i < RUNS; i++) {
        sampler.reset()
        const turn = await runTurn(testCase, numCtx)
        measured.push({ ...turn, ...sampler.snapshot() })
      }
      const info = await loadedInfo()
      const cell = {
        numCtx,
        case: testCase.id,
        label: testCase.label,
        n: measured.length,
        totalS: { median: sec(median(measured.map((m) => m.wallMs))), p90: sec(percentile(measured.map((m) => m.wallMs), 90)) },
        ttftS: { median: sec(median(measured.map((m) => m.ttftApproxMs))), p90: sec(percentile(measured.map((m) => m.ttftApproxMs), 90)) },
        tokensPerSecond: +median(measured.map((m) => m.tokensPerSecond)).toFixed(1),
        llmCalls: median(measured.map((m) => m.llmCalls)),
        toolCalls: median(measured.map((m) => m.toolCalls)),
        promptTokens: Math.max(...measured.map((m) => m.maxPromptTokens)),
        minAvailableMB: Math.min(...measured.map((m) => m.minAvailableMB ?? Infinity)),
        minFreeMB: Math.min(...measured.map((m) => m.minFreeMB)),
        modelGB: info?.sizeGB ?? null,
        modelVramGB: info?.vramGB ?? null,
        raw: measured,
      }
      results.cells.push(cell)
      console.log(`[ctx=${numCtx}] ${testCase.label}: total ${cell.totalS.median}/${cell.totalS.p90} s (mediana/p90), ${cell.tokensPerSecond} tok/s, RAM disp. mín ${cell.minAvailableMB} MB, modelo ${cell.modelGB} GB`)
      save()
    }
  }
  results.finished = true
  results.finishedAt = new Date().toISOString()
  save()
} finally {
  sampler.stop()
}
console.log(`Resultados: ${file}`)
