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

**Fase 4 (chatbot) — ABIERTA:** está construido todo lo que rodea al modelo y probado con el proveedor simulado (proveedor `ollama`/`groq`/`mock`, sesiones, límites, validador de montos, tools, agendar con confirmación, búsqueda semántica con `nomic-embed-text`, widget flotante, arnés de evaluación en `chatbot/eval/`, guía `docs/GUIA-IA-COMPANEROS.md`). **La Fase 4 queda ABIERTA hasta que las 20 preguntas pasen R1 a R4 con 20 de 20 usando un modelo real** (Groq o el de los compañeros). Con el simulado solo se prueba la lógica. Pendientes: correr esa evaluación, iterar el prompt, medir `qwen2.5:7b` con la puerta del paso 1 y la revisión cruzada con Codex. Detalle en `docs/PLAN-FASE-4.md` y decisiones 79 a 94.

**Fase 5 (servidor MCP) — cerrada (dos revisiones cruzadas con Codex aplicadas):** módulo `backend/src/mcp/` con keys de bots (HMAC con pepper, key saliente cifrada), endpoints admin para crear y rotar, puerta de entrada con 401 idéntico y límites, auditoría sin datos personales, y las tools `consultar_stock`, `consultar_precio` y `listar_marcas` sobre un catálogo público con campos explícitos. `agendar_cita` no se expone. Detalle en las decisiones 95 a 107 de `docs/DECISIONES.md`.

## Qué sigue
La Fase 3 está cerrada y la Fase 4 sigue abierta (ver arriba). La Fase 5 (servidor MCP) está cerrada; no cierra la Fase 4. Sigue la Fase 6 (A2A y `preguntar_a_otro_bot`). Los e2e formales de navegador, las imágenes reales y el pulido visual quedan para la Fase 7.

## Ramas
`main` (integración) y una rama por integrante: `devKevin`, `devVioleta`, `devEmerson`, `devCarlos`.
