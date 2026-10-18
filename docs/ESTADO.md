# Estado del proyecto

## Qué se hizo (Fase 1: base de datos)
- **Infraestructura:** `docker-compose.yml` con PostgreSQL 16 (+ pgvector).
- **Backend:** proyecto NestJS + TypeScript estricto + TypeORM, con `synchronize: false`.
- **Entidades:** vehículos, marcas, clientes, ventas, citas, usuarios y chat/A2A.
- **Migraciones:** esquema versionado con TypeORM.
- **Seeds:** las 10 marcas semilla con sus vehículos.
- **Revisión cruzada:** se aplicaron las correcciones que encontró Codex.

## Qué sigue
Fase 2: APIs REST con pruebas (Vitest + Supertest).

## Ramas
`main` (integración) y una rama por integrante: `devKevin`, `devVioleta`, `devEmerson`, `devCarlos`.
