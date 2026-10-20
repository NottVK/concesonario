// Aplica la puerta de calidad del paso 1 de la Fase 4 a los resultados del benchmark y la mini-prueba de tool-calling.
// Uso: OLLAMA_MODEL=qwen2.5:7b node gate.mjs      (opcional: NUM_CTX=4096 para elegir qué contexto se evalúa)
// Escribe results/GATE-<modelo>-<equipo>-<fecha>.md: ese es el archivo que se copia de vuelta.
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { MODEL, RESULTS_DIR, latestResult, safeName, stamp } from './common.mjs'

/** Umbrales aprobados por el usuario. */
export const GATE = { typicalMedianSeconds: 20, minAvailableMB: 1024, toolcallPercent: 90 }

/** Evalúa la puerta. `numCtx` es el contexto con el que se corrió la mini-prueba (y con el que se compara el benchmark). */
export function evaluateGate(bench, toolcall, numCtx) {
  const cells = (bench?.cells ?? []).filter((c) => c.numCtx === numCtx)
  const cold = (bench?.cold ?? []).filter((c) => c.numCtx === numCtx)
  const typical = cells.find((c) => c.case === 'b_una_tool')
  const ramValues = [...cells.map((c) => c.minAvailableMB), ...cold.map((c) => c.minAvailableMB)].filter((v) => Number.isFinite(v))
  const minRam = ramValues.length ? Math.min(...ramValues) : null

  const criteria = [
    {
      name: `Respuesta típica < ${GATE.typicalMedianSeconds} s (una tool + respuesta, modelo tibio, mediana)`,
      value: typical ? `${typical.totalS.median} s (p90 ${typical.totalS.p90} s)` : 'sin datos',
      pass: typical ? typical.totalS.median < GATE.typicalMedianSeconds : null,
    },
    {
      name: `RAM disponible en el pico > ${GATE.minAvailableMB / 1024} GB (mínimo de todas las mediciones, incluido el arranque en frío)`,
      value: minRam === null ? 'sin datos' : `${minRam} MB`,
      pass: minRam === null ? null : minRam > GATE.minAvailableMB,
    },
    {
      name: `Acierto de tool-calling ≥ ${GATE.toolcallPercent} %`,
      value: toolcall ? `${toolcall.passed}/${toolcall.total} = ${toolcall.accuracy} %` : 'sin datos',
      pass: toolcall ? toolcall.accuracy >= GATE.toolcallPercent : null,
    },
  ]
  const incomplete = !bench || bench.finished !== true
  let verdict
  if (criteria.some((c) => c.pass === null)) verdict = 'NO CONCLUYENTE (faltan datos)'
  else if (criteria.every((c) => c.pass)) verdict = incomplete ? 'SUPERA LA PUERTA (pero el benchmark quedó incompleto: repítelo para confirmar)' : 'SUPERA LA PUERTA'
  else verdict = 'NO SUPERA LA PUERTA'
  return { criteria, verdict, incomplete, cells, cold }
}

const mark = (pass) => (pass === null ? '❔' : pass ? '✅' : '❌')

export function renderReport({ bench, toolcall, numCtx, result, benchFile, toolcallFile }) {
  const env = bench?.environment ?? toolcall?.environment
  const lines = []
  lines.push(`# Puerta del paso 1 — ${bench?.model ?? toolcall?.model ?? MODEL}`, '')
  lines.push(`**Veredicto: ${result.verdict}**`, '')
  if (env) lines.push(`Equipo: ${env.host} (${env.platform}), ${env.cpu}, ${env.cores} núcleos, ${env.totalRamGB} GB de RAM. Ollama ${env.ollamaVersion}. Node ${env.node}.`, '')
  lines.push(`Contexto evaluado: \`num_ctx\` ${numCtx}. Archivos: \`${benchFile ? basename(benchFile) : 'sin benchmark'}\`, \`${toolcallFile ? basename(toolcallFile) : 'sin mini-prueba'}\`.`, '')
  lines.push('| Criterio | Resultado | ¿Cumple? |', '|---|---|---|')
  for (const c of result.criteria) lines.push(`| ${c.name} | ${c.value} | ${mark(c.pass)} |`)
  lines.push('')
  if (result.incomplete) lines.push('> El benchmark no terminó (o no existe): los números son parciales.', '')
  if (result.cells.length) {
    lines.push('## Detalle por caso (modelo tibio)', '', '| Caso | Total mediana / p90 (s) | tokens/s | RAM disponible mínima (MB) | Modelo en memoria (GB) |', '|---|---|---|---|---|')
    for (const c of result.cells) lines.push(`| ${c.label} | ${c.totalS.median} / ${c.totalS.p90} | ${c.tokensPerSecond} | ${c.minAvailableMB} | ${c.modelGB ?? '?'} |`)
    lines.push('')
  }
  if (result.cold.length) {
    lines.push('## Arranque en frío (caso típico)', '', '| Total (s) | Carga del modelo (s) | RAM disponible mínima (MB) |', '|---|---|---|')
    for (const c of result.cold) lines.push(`| ${(c.wallMs / 1000).toFixed(1)} | ${(c.loadMs / 1000).toFixed(1)} | ${c.minAvailableMB} |`)
    lines.push('')
  }
  if (toolcall) {
    const failed = toolcall.rows.filter((r) => !r.ok)
    lines.push(`## Mini-prueba de tool-calling: ${toolcall.passed}/${toolcall.total}`, '')
    if (failed.length === 0) lines.push('Todos los casos correctos.', '')
    else for (const r of failed) lines.push(`- ❌ «${r.question}» → ${r.reason}`)
    lines.push('')
  }
  if (env?.memoryPressure) lines.push('## `memory_pressure` al inicio', '', '```', env.memoryPressure, '```', '')
  lines.push('Notas: la RAM «disponible» es libre + inactiva + especulativa en macOS (`vm_stat`), `MemAvailable` en Linux y `AvailableMBytes` en Windows, muestreada cada segundo durante cada medición. El tiempo hasta el primer token es aproximado.')
  return lines.join('\n')
}

// Solo se ejecuta como programa (no al importarlo desde una prueba).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const prefix = safeName(MODEL)
  const benchFile = latestResult(`bench-${prefix}-`)
  const toolcallFile = latestResult(`toolcall-${prefix}-`)
  if (!benchFile && !toolcallFile) {
    console.error(`No hay resultados de ${MODEL} en ${RESULTS_DIR}. Corre primero toolcall.mjs y bench.mjs.`)
    process.exit(1)
  }
  const bench = benchFile ? JSON.parse(readFileSync(benchFile, 'utf8')) : null
  const toolcall = toolcallFile ? JSON.parse(readFileSync(toolcallFile, 'utf8')) : null
  const numCtx = Number(process.env.NUM_CTX ?? toolcall?.numCtx ?? 4096)
  const result = evaluateGate(bench, toolcall, numCtx)
  const report = renderReport({ bench, toolcall, numCtx, result, benchFile, toolcallFile })
  const host = safeName((bench ?? toolcall).environment?.host ?? 'equipo')
  const out = join(RESULTS_DIR, `GATE-${prefix}-${host}-${stamp()}.md`)
  writeFileSync(out, report)
  console.log(report)
  console.log(`\nArchivo para copiar de vuelta: ${out}`)
}
