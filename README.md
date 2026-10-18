# AutoMax — Concesionario con IA

Plataforma de concesionario con API, base de datos y un chatbot local (Ollama). Detalle funcional en `docs/PRD.md`, reglas del proyecto en `CLAUDE.md`, decisiones en `docs/DECISIONES.md`.

## Estado
- Fase 0 y 1 listas: Docker + PostgreSQL 16 con pgvector, backend NestJS, entidades, migraciones y seeds (10 marcas, 60 vehículos).

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

## Comandos del backend
| Comando | Qué hace |
|---|---|
| `npm run build` | Compila TypeScript a `dist/` |
| `npm run test` | Pruebas unitarias (Vitest) |
| `npm run migration:run` / `migration:revert` | Aplica / revierte migraciones |
| `npm run migration:generate` | Genera una migración a partir de las entidades |
| `npm run seed` | Carga datos de ejemplo (idempotente) |

Usuarios demo: `admin@automax.co` y `vendedor@automax.co`, contraseña = `SEED_DEMO_PASSWORD` del `.env`.
