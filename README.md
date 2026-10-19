# AutoMax — Concesionario con IA

Plataforma de concesionario con API, base de datos y un chatbot local (Ollama). Detalle funcional en `docs/PRD.md`, reglas del proyecto en `CLAUDE.md`, decisiones en `docs/DECISIONES.md`.

## Estado
- Fase 0 y 1 listas: Docker + PostgreSQL 16 con pgvector, backend NestJS, entidades, migraciones y seeds (10 marcas, 60 vehículos).

- Fase 2 lista: API REST con JWT, pruebas e2e y Swagger en `/api/docs`.
- Backend del panel listo: disponibilidad de test-drive, métricas y listado admin (ver Swagger en `/api/docs`).
- Fase 3 en curso: frontend (listos: base, tema, cliente API tipado y Catálogo con filtros y Detalle con simulador de crédito y agendar test-drive con horas ocupadas y Home).

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

## Recrear la base de desarrollo (cuando cambia el seed)
El seed es idempotente: en una base que ya tiene vehículos **actualiza** datos de catálogo pero **no renumera los ids**. Por eso un cambio en el orden de inserción (por ejemplo el intercalado de marcas, que reparte entre marcas los "más recientes" que muestra la Home) solo se ve en una base nueva:
```bash
docker compose down -v          # ¡borra el volumen pgdata: TODA la base de desarrollo!
docker compose up -d
cd backend
npm run migration:run
npm run seed
```
`down -v` también elimina la base de pruebas (`concesionario_test`); se vuelve a crear sola al correr `npm run test:e2e`. Si tienes datos que quieres conservar, no lo hagas.

## Comandos del backend
| Comando | Qué hace |
|---|---|
| `npm run build` | Compila TypeScript a `dist/` |
| `npm run test` | Pruebas unitarias (Vitest) |
| `npm run migration:run` / `migration:revert` | Aplica / revierte migraciones |
| `npm run migration:generate` | Genera una migración a partir de las entidades |
| `npm run seed` | Carga datos de ejemplo (idempotente; ver abajo cómo recrear la base) |
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
