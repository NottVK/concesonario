# Medir `qwen2.5:7b` en la MacBook (plan B de la Fase 4)

Objetivo: correr en la Mac la misma medición que en el PC con `qwen2.5:3b` y aplicar la **misma puerta de calidad**. Al final obtienes **un archivo `GATE-….md`** (más dos `.json`) para copiar de vuelta al PC. Contexto y números del PC: `docs/DECISIONES.md`, decisión 78.

## La puerta (los tres criterios deben cumplirse)

| Criterio | Umbral | Cómo se mide |
|---|---|---|
| Respuesta típica | **mediana < 20 s** | Caso «una tool + respuesta» (`¿Cuánto cuesta una Mazda CX-5?`), modelo ya cargado, 5 medidas, `num_ctx` 4096 |
| RAM libre en el pico | **> 1 GB** | Mínimo de memoria disponible durante *todas* las mediciones (incluido el arranque en frío). En macOS: libre + inactiva + especulativa de `vm_stat`, muestreada cada segundo |
| Acierto de tool-calling | **≥ 90 %** (18 de 20) | Mini-prueba de 20 mensajes: la herramienta correcta con los argumentos correctos, o ninguna cuando no corresponde |

Referencia del PC con `qwen2.5:3b`: mediana 18,2 s (p90 20,6 s), RAM mínima 242 MB, acierto 90 %. No superó la puerta.

## Antes de empezar

- **Requisitos:** Node 20 o superior (`node --version`; si falta: `brew install node`), git, y Ollama (`ollama --version`).
- **Ollama debe estar corriendo** (la app de la barra de menú, o en otra terminal `ollama serve`).
- **Condiciones de la medición:** conecta la Mac a la corriente y desactiva el modo de bajo consumo. Déjala con lo que normalmente tendrías abierto mientras trabajas (navegador, editor): la puerta mide el escenario real. **No abras otro modelo ni juegos.** Si usas Docker en la Mac, déjalo como lo tendrías para desarrollar.
- **No necesitas** `.env`, base de datos, ni nada del proyecto aparte de la carpeta `chatbot/bench`.

## Pasos

### 0. En el PC (una vez): subir el banco de medición
Cuando yo te lo diga, en el PC: `git push origin main:devKevin`. Así queda disponible en la rama `devKevin`.

### 1. Clonar e instalar (Mac)
```bash
git clone --depth 1 --branch devKevin https://github.com/NottVK/concesonario.git
cd concesonario/chatbot/bench
npm install
```
Tarda menos de un minuto: solo instala `axios`.

### 2. Descargar el modelo (unos 4,7 GB; depende de tu conexión)
```bash
ollama pull qwen2.5:7b
```

### 3. Variables comunes
```bash
export OLLAMA_MODEL=qwen2.5:7b
export BENCH_HOST_LABEL=macbook      # así no queda el nombre real de tu Mac en los archivos
```

### 4. Mini-prueba de tool-calling (≈ 2 a 5 minutos)
```bash
NUM_CTX=4096 REPS=1 caffeinate -i node toolcall.mjs
```
Imprime una línea por caso (`OK` / `FALLA`) y al final `Acierto: N/20`. `caffeinate -i` evita que la Mac se duerma durante la prueba.

### 5. Benchmark de tiempo y memoria (≈ 15 a 40 minutos)
```bash
RUNS=5 CTXS=4096,2048 COLD_RUNS=3 caffeinate -i node bench.mjs
```
- Hace 3 arranques en frío y, por cada tamaño de contexto (4096 y 2048), 5 casos con 1 calentamiento descartado y 5 medidas.
- Imprime una línea por cada resultado. **El archivo se guarda después de cada medición**: si lo interrumpes (Ctrl+C) o el sistema lo detiene, lo medido hasta ahí queda guardado, y el informe lo marcará como incompleto.
- Si tras 10 minutos no ha terminado ni los 3 arranques en frío y el primer caso, la Mac es demasiado lenta para este modelo (típico de una Mac con Intel): detén con Ctrl+C y ve al paso 6; el informe saldrá «incompleto» y eso ya es un dato.

### 6. Aplicar la puerta
```bash
node gate.mjs
```
Imprime el informe y escribe `results/GATE-qwen2.5_7b-macbook-<fecha>.md`. El veredicto es uno de: **SUPERA LA PUERTA**, **NO SUPERA LA PUERTA** o **NO CONCLUYENTE** (faltan datos). Evalúa `num_ctx` 4096; para evaluar el 2048 con los datos que ya tienes: `NUM_CTX=2048 node gate.mjs`.

### 7. Anota a mano (en un mensaje o al inicio del `.md`)
- Modelo de la Mac y chip (el informe ya trae chip y RAM total).
- Si estaba con corriente o con batería.
- Qué tenías abierto (navegador, editor, Docker…).

### 8. Copiar de vuelta al PC
Copia estos archivos de `chatbot/bench/results/` de la Mac a la misma carpeta en el PC (`D:\clases de sabado\trabajo grupal concesionario\chatbot\bench\results\`), por AirDrop, USB, nube o `scp`:

```bash
cd results
ls *qwen2.5_7b*                        # deben salir 3 archivos: GATE-….md, bench-….json y toolcall-….json
zip ../resultados-mac.zip *qwen2.5_7b* # opcional, para pasarlos de una vez
```

Luego avísame y yo los registro en `docs/DECISIONES.md` y sigo con el paso 2.

## Cómo leer el resultado

- **SUPERA LA PUERTA:** `qwen2.5:7b` en la Mac es el modelo del bot. Se configura con `OLLAMA_HOST` (y `OLLAMA_MODEL=qwen2.5:7b`).
- **NO SUPERA LA PUERTA:** el informe dice qué criterio falló. No cambio de plan por mi cuenta: lo hablamos (por ejemplo, otro contexto, otra cuantización o aceptar la latencia con el indicador «escribiendo…»).
- **Tiempo hasta el primer token:** aproximado (carga + procesamiento del prompt); no entra en la puerta.
- **Estimaciones de tiempo:** son orientativas. En Apple Silicon deberían estar en los rangos de arriba; no conozco tu chip ni tu RAM, así que el informe los registrará.

## Problemas frecuentes

| Síntoma | Qué hacer |
|---|---|
| `No encuentro axios` | Ejecuta `npm install` dentro de `chatbot/bench`. |
| `ECONNREFUSED` o «no responde» | Ollama no está corriendo: abre la app o `ollama serve`. |
| `model "qwen2.5:7b" not found` | Falta el paso 2 (`ollama pull qwen2.5:7b`). |
| La Mac se pone muy lenta o aparece un aviso de memoria | Cierra aplicaciones pesadas y repite; el sistema puede detener el proceso, y el archivo parcial se conserva. |
| `memory_pressure` / `vm_stat` no encontrados | Deben existir en macOS; si no, avísame y lo reviso. |
