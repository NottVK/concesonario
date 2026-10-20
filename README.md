# AutoMax — Concesionario con IA

Plataforma de concesionario con API, base de datos y un chatbot local (Ollama). Detalle funcional en `docs/PRD.md`, reglas del proyecto en `CLAUDE.md`, decisiones en `docs/DECISIONES.md`.

## Estado
- Fase 0 y 1 listas: Docker + PostgreSQL 16 con pgvector, backend NestJS, entidades, migraciones y seeds (10 marcas, 60 vehículos).

- Fase 2 lista: API REST con JWT, pruebas e2e y Swagger en `/api/docs`.
- Backend del panel listo: disponibilidad de test-drive, métricas y listado admin (ver Swagger en `/api/docs`).
- Fase 3 lista: frontend completo. Catálogo con filtros, detalle con simulador de crédito y agendar test-drive (horas ocupadas, hora de Bogotá), home y comparador. Panel con login y sesión: citas, clientes, registrar venta y, solo admin, métricas, inventario (control de ediciones simultáneas) e historial de ventas. Pruebas: 560 de frontend, 171 unitarias y 238 e2e de backend, y un smoke de Playwright. Detalle en `docs/DECISIONES.md`.

## Arranque rápido
```bash
cp .env.example .env            # y ajusta las claves
docker compose up -d            # base de datos
cd backend
npm install
npm run migration:run           # crea las tablas
npm run seed                    # carga marcas, vehículos y usuarios demo
npm run start:dev               # API en http://localhost:8000/api
```

## Smoke de navegador (Playwright)
Tres flujos: catálogo → detalle → agendar cita; login admin → confirmar la cita; login vendedor → registrar una venta. Corre contra una API y un Vite ya encendidos sobre una **base temporal** (no la de desarrollo) y no lee `.env`: la contraseña demo se pasa en el comando.
```bash
# 1) base temporal y API (sintaxis bash; DB_NAME y la contraseña van en el comando)
DB_NAME=tmp_smoke SEED_DEMO_PASSWORD=<clave-temporal> npm --prefix backend run migration:run
DB_NAME=tmp_smoke SEED_DEMO_PASSWORD=<clave-temporal> npm --prefix backend run seed
DB_NAME=tmp_smoke PORT=8010 FRONTEND_URL=http://localhost:5174 node backend/dist/main.js
# 2) Vite apuntando a esa API, y el smoke
cd frontend && VITE_API_TARGET=http://localhost:8010 npx vite --port 5174 --strictPort
E2E_PASSWORD=<clave-temporal> E2E_BASE_URL=http://localhost:5174 npm run e2e:smoke
# 3) al terminar, borra la base temporal (DROP DATABASE tmp_smoke)
```
Los e2e formales completos llegan en la Fase 7.

## Recrear la base de desarrollo (cuando cambia el seed)
El seed es idempotente: en una base que ya tiene vehículos **actualiza** datos de catálogo pero **no renumera los ids**. Por eso un cambio en el orden de inserción (por ejemplo el intercalado de marcas, que reparte entre marcas los "más recientes" que muestra la Home) solo se ve en una base nueva:
```bash
docker compose down -v          # ¡borra el volumen pgdata: TODA la base de desarrollo!
docker compose up -d
cd backend
npm run migration:run
npm run seed
npm run embeddings:sync         # vuelve a calcular los vectores de la búsqueda inteligente (ver abajo)
```
**`down -v` también borra los vectores** de la búsqueda inteligente (viven en `vehiculos.embedding`). Tras recrear la base hay que correr `migration:run`, `seed` y luego `embeddings:sync`; el seed no falla si Ollama está apagado (avisa en una línea y sigue), pero sin vectores `GET /vehiculos/buscar` no devuelve resultados hasta que corras `embeddings:sync`. El catálogo con filtros no se afecta.

`down -v` también elimina la base de pruebas (`concesionario_test`); se vuelve a crear sola al correr `npm run test:e2e`. Si tienes datos que quieres conservar, no lo hagas.

## Búsqueda inteligente y embeddings
`GET /api/vehiculos/buscar?q=camioneta para familia` ordena por parecido de significado (10 por minuto; solo vehículos no vendidos). Usa el modelo `nomic-embed-text` de Ollama (`ollama pull nomic-embed-text`, ~270 MB; se descarga de la memoria al terminar, `keep_alive: 0`, para no competir con el modelo de chat).
- Los vectores se **recalculan solos** al crear o editar un vehículo (si cambia algo del texto: marca, modelo, versión, año, combustible, transmisión, estado, color o descripción; el precio y el kilometraje no entran). Si Ollama no responde, la operación del administrador no falla: el vehículo queda en el catálogo y fuera de la búsqueda inteligente hasta el siguiente `npm run embeddings:sync`.
- `npm run embeddings:sync` calcula lo que falta o cambió (idempotente: la segunda corrida no calcula nada). Usa `OLLAMA_HOST` y `OLLAMA_EMBED_MODEL`.
- Evaluación: con la API encendida, `node chatbot/eval/busqueda.mjs` corre 10 consultas en lenguaje natural (aprueba con 8 de 10).
- Detalle de la medición y de por qué se usan los embeddings **sin prefijos** en `docs/DECISIONES.md`.

## Comandos del backend
| Comando | Qué hace |
|---|---|
| `npm run build` | Compila TypeScript a `dist/` |
| `npm run test` | Pruebas unitarias (Vitest) |
| `npm run migration:run` / `migration:revert` | Aplica / revierte migraciones |
| `npm run migration:generate` | Genera una migración a partir de las entidades |
| `npm run seed` | Carga datos de ejemplo (idempotente; ver abajo cómo recrear la base) y, si Ollama responde, sus vectores |
| `npm run embeddings:sync` | Calcula los vectores de búsqueda que faltan o cambiaron (idempotente) |
| `npm run chat:purge` | Borra conversaciones del chat con más de 7 días sin actividad |
| `npm run clean` | Borra `dist/` con `rimraf` (funciona igual en Windows, macOS y Linux) |

Usuarios demo: `admin@automax.co` y `vendedor@automax.co`, contraseña = `SEED_DEMO_PASSWORD` del `.env`.

## Frontend (`frontend/`)
```bash
cd frontend
npm install
npm run dev          # http://localhost:5173 (el proxy envía /api a http://localhost:8000)
```
| Comando | Qué hace |
|---|---|
| `npm run api:types` | Regenera `src/api/schema.d.ts` desde `/api/docs-json` (la API debe estar encendida). Ejecútalo cada vez que cambie el contrato. |
| `npm run test` | Pruebas (Vitest + Testing Library) |
| `npm run build` | Typecheck y build de producción |
| `npm run clean` | Borra `dist/` y la caché de TypeScript con `rimraf` |

Si la API corre en otro puerto, define `VITE_API_TARGET` (ver `frontend/.env.example`).
Mientras no haya fotos reales, los autos sin `.webp` en `frontend/public/autos/` muestran `placeholder.svg`.
