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

**Fase 3 (frontend):** catálogo, detalle con simulador y test-drive, home, comparador y panel completo (login/sesión, citas, clientes, registrar venta, y solo admin: métricas, inventario con control de ediciones simultáneas e historial de ventas). Dos revisiones cruzadas con Codex aplicadas; smoke de Playwright con tres flujos. Detalle y cierre en `docs/DECISIONES.md`.

## Qué sigue
La Fase 3 está cerrada. Sigue la Fase 4: el chatbot local con Ollama y sus tools, que llamarán a la API (nunca a la base directamente). Los e2e formales de navegador, las imágenes reales y el pulido visual quedan para la Fase 7.

## Ramas
`main` (integración) y una rama por integrante: `devKevin`, `devVioleta`, `devEmerson`, `devCarlos`.
