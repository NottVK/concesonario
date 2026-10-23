# Estado del proyecto

Última actualización: 2026-10-20 (Fase 6 hasta la subfase 6.7). Pruebas: 794 unitarias y 538 e2e de backend, 649 de frontend. Cómo levantarlo: `README.md`. Cómo mostrarlo: `docs/DEMO.md`.

## Pendientes

Ordenados por lo que bloquea. «Dónde» indica dónde está el detalle.

| # | Pendiente | Por qué sigue abierto | Qué falta hacer | Dónde |
|---|---|---|---|---|
| 1 | **Fase 4 abierta** (calidad del chat) | Todo lo que rodea al modelo está construido y probado con el simulado, que solo prueba la lógica. Se cierra únicamente con un modelo real | Correr las 20 preguntas con **20 de 20 en R1 a R4** usando **`gpt-oss:20b`** (modelo local desde la decisión 124) o Groq, y **con el prompt v2**; sumar los casos extra 22 y 23 de la tool del otro bot (`EVAL_OTHER_BOT`, aún sin ejecutar); iterar el prompt si falla; revisión cruzada con Codex | `PLAN-FASE-4.md` §7, `GUIA-IA-COMPANEROS.md`, decisiones 79 a 94 y 120 |
| 2 | **Contrato A2A con el otro grupo** | Hoy el contrato es el simplificado de `CLAUDE.md` y se probó solo con los bots propios | Acordar con el otro grupo el formato de tarea y respuesta, la cabecera de autenticación (cada bot puede usar `Authorization: Bearer` o `X-API-Key`), su URL base A2A y que acepten nuestro nombre; hacer **un intercambio real**. Si no están listos, dejarlo pendiente con fecha. El parser ya tolera `answer`, `message`, `response`, `text` y `result.parts[0].text` | decisiones 113, 115 y 121 |
| 3 | **Revisión final de la Fase 6 con Codex (subfase 6.8)** | Pospuesta hasta que se renueve la cuota | Revisión con los archivos **completos** y lista de bypass de SSRF actualizada, esta vez sobre todo lo nuevo (tarjeta y tareas entrantes, tool del chat, panel); aplicar lo real; revisar `CLAUDE.md` §3, §6 y §7 y `DECISIONES.md`; ensayar la demo. El sandbox de Codex no lee el repositorio en esta máquina: hay que pasarle el código por entrada estándar, como en la 6.5 | decisión 121, bloque «Revisión de Codex de la 6.5» |
| 4 | **Modo claro** | `CLAUDE.md` lo pide opcional. Hay variables de color claras en `index.css`, pero el `<html>` está fijo en `class="dark"` y no hay conmutador | Conmutador (y recordar la elección), revisar contraste y todas las pantallas en claro | `frontend/src/index.css`, `index.html` |
| 5 | **E2E formales de navegador** | Solo existen el smoke de 3 flujos, `chat.spec.ts` y `portada.spec.ts` | Playwright completo (catálogo, detalle, comparador, panel, chat, bots). **`frontend/e2e/portada.spec.ts` está escrito y nunca se ha ejecutado**: es la única forma de confirmar que la portada ya no desborda en móvil | README «Smoke de navegador», decisión 123 |
| 6 | **Logos reales** | Las 60 fotos ya están (Wikimedia Commons, WebP; créditos en `frontend/public/autos/CREDITOS.md`, decisión 126). La carpeta `marcas/` sigue vacía; los seeds apuntan a `/autos/marcas/<marca>.svg` | Logos SVG de las 10 marcas | `CLAUDE.md` §12 |
| 7 | **`trust proxy`** | La API no lo configura. Tras un proxy inverso todas las peticiones comparten IP: el límite por IP se vuelve global y 10 keys falsas en 5 minutos bloquean 15 minutos a **todos** los bots de MCP y A2A | Variable validada con el número de saltos (`app.set('trust proxy', n)`) y prueba con `X-Forwarded-For` **antes de desplegar** | `DECISIONES.md` → Pendientes |
| 8 | **Revalidar el rol del token** | El JWT confía en `sub` y `role` hasta que expira (1 h) y los guards solo leen el rol del token | Revalidar rol y que el usuario siga activo contra la base en cada petición protegida, o añadir revocación. **Requisito antes de construir gestión de usuarios** (un admin degradado conservaría su permiso hasta 1 h) | `DECISIONES.md` → Pendientes |

### Otros pendientes menores
- **La base de desarrollo no tiene aplicada la migración 009** (se probó solo en bases temporales): correr `cd backend && npm run migration:run` antes de usar la API con ella.
- **Portada en móvil:** corregida por clases y con pruebas de Vitest, pero sin medir en un navegador (ver el punto 5).
- **Correos de clientes:** valorar un índice único sobre `lower(correo)` y búsqueda sin acentos (`unaccent`).
- **`mcp.json`** contiene la contraseña de desarrollo de la base: moverla a una variable de entorno.
- **Sondeo de vehículos vendidos:** por A2A y MCP se distingue "vendido" de "no existe" por `vehiculo_id`, igual que ya hace la API pública. Si al negocio le importa la velocidad de ventas, se decide en la REST y se alinean los tres canales a la vez (decisión de la revisión de la 6.3).
- **Despliegue:** los contadores de límites viven en el proceso (una sola réplica).

## Qué se hizo

**Fase 1 (base de datos):** Docker con PostgreSQL 16 + pgvector, backend NestJS estricto con TypeORM, entidades, migraciones, seeds (10 marcas, 60 vehículos) y correcciones de la revisión cruzada con Codex.

**Fase 2 (APIs REST):** auth JWT con roles (`admin`, `vendedor`), rate limit global y por ruta, DTOs validados en toda entrada; marcas y vehículos (filtros, orden, paginación, comparador de hasta 3); clientes y citas de 60 min (lunes a sábado, 8:00 a 18:00 hora de Bogotá, sin solapes por restricciones de exclusión en PostgreSQL); ventas en una transacción con bloqueo de fila; simulador de financiación en centavos; contrato documentado en Swagger (`/api/docs`).

**Fase 3 (frontend):** catálogo, detalle con simulador y test-drive, portada, comparador y panel completo (login y sesión, citas, clientes, registrar venta y, solo admin, métricas, inventario con control de ediciones simultáneas e historial de ventas). Dos revisiones cruzadas con Codex aplicadas; smoke de Playwright con tres flujos.

**Fase 4 (chatbot) — ABIERTA, ver pendiente 1:** proveedor `ollama`/`groq`/`mock`, sesiones, límites, validador de montos, tools (`buscar_vehiculos`, `detalle_vehiculo`, `comparar_vehiculos`, `simular_credito`, `agendar_cita`), agendar con confirmación, búsqueda semántica con `nomic-embed-text`, widget flotante, arnés de evaluación en `chatbot/eval/` y guía `GUIA-IA-COMPANEROS.md`.

**Fase 5 (servidor MCP) — cerrada** con dos revisiones cruzadas con Codex: keys de bots (HMAC con pepper, key saliente cifrada), puerta de entrada con 401 idéntico y límites, auditoría sin datos personales, y `consultar_stock`, `consultar_precio` y `listar_marcas` sobre un catálogo público de campos explícitos. `agendar_cita` no se expone.

**Fase 6 (A2A y conexión con otro bot) — hecha hasta la 6.7, falta la 6.8:**

| Subfase | Qué es | Commit |
|---|---|---|
| 6.0 | Diseño, decisiones 108 a 122 y `CLAUDE.md` §3, §6 y §7 | `6b30a1b` |
| 6.1 | Puerta de entrada compartida entre MCP y A2A | `a612d00` |
| 6.2 | Migración 009, key saliente `enc:v2` con AAD y auditoría A2A | `4281318` |
| 6.3 | Tarjeta `agent.json` y `POST /a2a/tasks` deterministas, con revisión del arquitecto | `161ec82` |
| 6.4 | Bots de prueba, amigo y malicioso (`chatbot/a2a-demo/`) | `8bc4950` |
| 6.5 | Cliente saliente: protección SSRF, saneador, circuit breaker y límites; revisión con Codex | `76eeb3f`, `a057054` |
| 6.6 | Tool `preguntar_a_otro_bot`, prompt v2 y tarjeta «tercero no verificado» | `df55e34` |
| 6.7 | Panel de bots: registrar, activar, probar conexión e intercambios; política de URL al registrar | `4e38ee5` |
| 6.8 | Revisión final con Codex, correcciones, `CLAUDE.md` y demo | **pendiente** (punto 3) |

Después de la 6.7 se hicieron además: la corrección de la portada en móvil (`d2215da`), el guion de la demo (`838853e`) y el README final (`4c7d2cd`).

## Qué sigue
1. Cuando se renueve la cuota: la **6.8** (pendiente 3).
2. Acordar el contrato con el otro grupo (pendiente 2) y, con un modelo real, evaluar las 20 preguntas con el prompt v2 para cerrar la Fase 4 (pendiente 1).
3. Fase 7: pulido, modo claro, fotos y logos, y e2e formales (pendientes 4 a 6), más `trust proxy` y la revalidación del rol (7 y 8) antes de cualquier despliegue o de gestionar usuarios.

## Ramas
`main` (integración) y una rama por integrante: `devKevin`, `devVioleta`, `devEmerson`, `devCarlos`.
