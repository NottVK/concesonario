# Estado del proyecto

## Qué se hizo
**Fase 1 (base de datos):** Docker con PostgreSQL 16 + pgvector, backend NestJS estricto con TypeORM, entidades, migraciones, seeds (10 marcas, 60 vehículos) y correcciones de la revisión cruzada con Codex.

**Fase 2 (APIs REST):**
- Auth JWT con roles (`admin`, `vendedor`), rate limit global y por ruta, DTOs validados en toda entrada.
- Marcas y vehículos (filtros, orden, paginación y comparador de hasta 3).
- Clientes y citas: 60 min, lunes a sábado 8:00–18:00 en hora de Bogotá, sin solapes por vehículo ni por cliente (restricciones de exclusión en PostgreSQL).
- Ventas en una transacción con bloqueo de fila; cancelan las citas del vehículo vendido.
- Simulador de financiación en centavos.
- Contrato de la API unificado en inglés y documentado con Swagger en `/api/docs`.
- Pruebas: unitarias y e2e (Supertest) contra BD real, incluida una que fija el contrato OpenAPI; detalle en `backend/README.md`.

## Qué sigue
La revisión cruzada con Codex de la Fase 2 ya se aplicó (detalle en `docs/DECISIONES.md`). Sigue la Fase 3 (frontend), que consumirá el contrato de `/api/docs`.

## Ramas
`main` (integración) y una rama por integrante: `devKevin`, `devVioleta`, `devEmerson`, `devCarlos`.
