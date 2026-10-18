# Decisiones de arquitectura

## 2026-10-18 — Fases 0 y 1

1. **Pruebas del backend con Vitest (no Jest).** El scaffold de NestJS 12 ya trae Vitest y módulos ESM. Se mantiene Supertest para e2e. CLAUDE.md, PRD y los agentes se actualizaron.
2. **Backend en ESM.** Los imports llevan extensión `.js`. En las relaciones entre entidades se usa `Relation<T>` para evitar problemas de referencias circulares con `emitDecoratorMetadata`.
3. **Migraciones sobre `dist/`.** El CLI de TypeORM corre contra el código compilado (`npm run build` + `typeorm -d dist/database/data-source.js`), así no hace falta un ejecutor de TypeScript. Los scripts `migration:*` y `seed` compilan primero.
4. **Entidades en lista explícita** (`database/entities.ts`), sin globs, porque los globs fallan con ESM.
5. **Embedding `vector(768)`** (modelo `nomic-embed-text` de Ollama), columna nullable y `select: false`. Se llenará en la fase del chatbot; cambiar la dimensión exige una migración.
6. **Dinero:** `numeric(12,2)` en BD y `string` en código, moneda COP.
7. **Citas:** índice único parcial `(vehiculo_id, fecha_hora)` donde `estado <> 'cancelada'` evita choques de horario (RF4) a nivel de BD.
8. **Ventas:** `vehiculo_id` único; un vehículo se vende una sola vez.
9. **Secretos sensibles fuera de las respuestas:** `usuarios.hash`, `bots_externos.api_key` y `vehiculos.embedding` usan `select: false`.
10. **Seeds idempotentes** con `upsert` (marcas por nombre; vehículos por marca+modelo+año+versión). 10 marcas, 60 vehículos, 2 usuarios demo (`admin@automax.co`, `vendedor@automax.co`) con la contraseña de `SEED_DEMO_PASSWORD`.
11. **Ruta de seeds:** `backend/src/database/seeds/` (corregida en CLAUDE.md §4).
12. **`mcp.json`** sigue con ese nombre; CLAUDE.md menciona `.mcp.json`. Pendiente de decidir si se renombra.

## Pendientes registrados
- Imágenes WebP en `frontend/public/autos/` (Fase 3); los seeds ya apuntan a `/autos/<marca>-<modelo>.webp`.
- Logos de marcas en `/autos/marcas/<marca>.svg` (Fase 3).
