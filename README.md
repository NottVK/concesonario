# AutoMax — Concesionario de carros con IA

Plataforma de concesionario con catálogo, panel de administración, API REST, un **asistente de chat con IA** y la capacidad de **conversar con otros chatbots** (protocolos A2A y MCP) sin dejar de proteger los datos de los clientes.

| Capa | Tecnología |
|---|---|
| Backend | NestJS 12 + TypeScript estricto + TypeORM |
| Base de datos | PostgreSQL 16 con pgvector (búsqueda por significado) |
| Frontend | React + Vite + TypeScript + Tailwind |
| Chatbot | Ollama (local), Groq (externo, solo para evaluar) o un simulado para pruebas |
| Conexión entre bots | Servidor MCP (solo lectura) y A2A (tarjeta + tareas, entrante y saliente) |
| Pruebas | Vitest, Supertest y Playwright (smoke) |

Documentación: reglas del proyecto en [`CLAUDE.md`](CLAUDE.md), requisitos en [`docs/PRD.md`](docs/PRD.md), **estado y pendientes en [`docs/ESTADO.md`](docs/ESTADO.md)**, decisiones de diseño en [`docs/DECISIONES.md`](docs/DECISIONES.md), guion de la demo en [`docs/DEMO.md`](docs/DEMO.md) y cómo correr el modelo de IA en otra máquina en [`docs/GUIA-IA-COMPANEROS.md`](docs/GUIA-IA-COMPANEROS.md).

## Qué incluye

- **Catálogo** de 60 vehículos reales de ejemplo (10 marcas) con filtros, búsqueda por significado, detalle con **simulador de crédito**, **test-drive** con horas ocupadas (hora de Bogotá) y **comparador** de hasta 3 autos.
- **Panel de administración** (`/admin`): citas, clientes, registrar venta y, solo para el admin, métricas, inventario con control de ediciones simultáneas, historial de ventas y **bots externos**.
- **Asistente de chat**: responde con datos reales del catálogo (nunca inventa precios), simula créditos y **prepara** citas que la persona debe confirmar ella misma. Puede **consultar a otros bots** y muestra su respuesta aparte, como "tercero no verificado".
- **MCP y A2A**: otros bots consultan el catálogo público con su propia key; AutoMax puede preguntarle a bots amigos con una política estricta contra llamadas a redes internas. Nunca se comparten datos de clientes.

## Qué falta (resumen)

Fase 4 (calidad del chat con un modelo real) abierta, contrato A2A con el otro grupo por acordar, revisión final de la Fase 6 con Codex, modo claro, fotos reales y pruebas de navegador formales. El detalle está en [`docs/ESTADO.md`](docs/ESTADO.md).

## Levantar el proyecto desde cero

### 1. Requisitos
- **Node.js 20 o superior** (probado con 24) y npm.
- **Docker Desktop** (para PostgreSQL con pgvector).
- **Git**.
- Para el chat con un modelo real: [Ollama](https://ollama.com/download) (opcional; sin él, usa `CHAT_PROVIDER=mock`).

### 2. Descargar e instalar
```bash
git clone <URL-del-repositorio> concesionario
cd concesionario
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### 3. Variables de entorno
```bash
cp .env.example .env
```
Edita `.env` (nunca se sube a git). Lo mínimo que debes cambiar:

| Variable | Qué poner |
|---|---|
| `DB_PASSWORD` | Una clave para la base de datos |
| `JWT_SECRET` | Aleatorio, mínimo 16 caracteres: `openssl rand -hex 32` |
| `MCP_KEY_PEPPER` | Aleatorio, mínimo 32 caracteres: `openssl rand -hex 32`. **La API no arranca sin él** |
| `BOT_KEY_ENCRYPTION_KEY` | 64 caracteres hexadecimales: `openssl rand -hex 32`. **La API no arranca sin ella** |
| `SEED_DEMO_PASSWORD` | Contraseña de los usuarios demo |
| `CHAT_PROVIDER` | `ollama` (modelo local), `groq` (externo; pide `GROQ_API_KEY`) o `mock` (simulado, sin modelo) |

Las demás variables tienen valores por defecto y están comentadas en `.env.example` (límites, modelo de Ollama, búsqueda, MCP y A2A). Para los bots de demostración de esta máquina añade además `A2A_DEV_ALLOWED_TARGETS=127.0.0.1:8100,127.0.0.1:8101` (**solo desarrollo**: la API no arranca con ella si `NODE_ENV=production`).

### 4. Base de datos
```bash
docker compose up -d                 # PostgreSQL 16 + pgvector en el puerto 5432
cd backend
npm run migration:run                # crea las tablas (10 migraciones)
npm run seed                         # 10 marcas, 60 vehículos y los usuarios demo
```

### 5. Modelo de IA (opcional)
```bash
ollama pull qwen2.5:3b               # chat en un PC de 8 GB (usa qwen2.5:7b con 16 GB y pon OLLAMA_MODEL en .env)
ollama pull nomic-embed-text         # búsqueda por significado (~270 MB)
cd backend && npm run embeddings:sync
```
Sin Ollama todo funciona menos la búsqueda por significado; el catálogo con filtros no se afecta. Si no tienes un equipo potente, otra máquina puede servir el modelo (`OLLAMA_HOST`): ver [`docs/GUIA-IA-COMPANEROS.md`](docs/GUIA-IA-COMPANEROS.md).

### 6. Encender
```bash
# Terminal 1 — API (http://localhost:8000/api; documentación interactiva en /api/docs)
cd backend && npm run start:dev
# Terminal 2 — frontend (http://localhost:5173)
cd frontend && npm run dev
```
Comprueba: `http://localhost:5173` muestra la portada con autos; `http://localhost:8000/.well-known/agent.json` devuelve la tarjeta del bot.

### 7. Entrar
| Qué | Dónde |
|---|---|
| Sitio público | http://localhost:5173 |
| Panel | http://localhost:5173/admin/login |
| Usuarios demo | `admin@automax.co` y `vendedor@automax.co`, con la contraseña de `SEED_DEMO_PASSWORD` |
| Documentación de la API | http://localhost:8000/api/docs |

Para ver la conexión entre chatbots, los bots de prueba y el recorrido completo, sigue [`docs/DEMO.md`](docs/DEMO.md).

## Pruebas
| Comando | Qué prueba | Resultado actual |
|---|---|---|
| `cd backend && npm run test` | Unitarias (Vitest) | 794 |
| `cd backend && npm run test:e2e` | API completa con Supertest contra una base propia (`concesionario_test`, se crea sola) | 538 |
| `cd frontend && npm run test` | Interfaz (Vitest + Testing Library) | 649 |
| `cd frontend && npm run lint` / `npm run build` | Lint y typecheck + build de producción | — |

Las pruebas usan su propia base (`concesionario_test`, nunca la de desarrollo) y sus propios secretos de prueba para MCP y el cifrado de keys; solo toman del `.env` la conexión a PostgreSQL. Las pruebas de la conexión entre bots levantan los bots de `chatbot/a2a-demo/` en puertos libres.

### Smoke de navegador (Playwright)
Tres flujos: catálogo → detalle → agendar cita; login admin → confirmar la cita; login vendedor → registrar una venta. Corre contra una API y un Vite ya encendidos sobre una **base temporal** (no la de desarrollo); la contraseña demo se pasa en el comando.
```bash
# 1) base temporal y API (sintaxis bash)
DB_NAME=tmp_smoke SEED_DEMO_PASSWORD=<clave-temporal> npm --prefix backend run migration:run
DB_NAME=tmp_smoke SEED_DEMO_PASSWORD=<clave-temporal> npm --prefix backend run seed
npm --prefix backend run build
DB_NAME=tmp_smoke PORT=8010 FRONTEND_URL=http://localhost:5174 node backend/dist/main.js
# 2) Vite apuntando a esa API, y el smoke
cd frontend && VITE_API_TARGET=http://localhost:8010 npx vite --port 5174 --strictPort
E2E_PASSWORD=<clave-temporal> E2E_BASE_URL=http://localhost:5174 npm run e2e:smoke
# 3) al terminar, borra la base temporal (DROP DATABASE tmp_smoke)
```
`frontend/e2e/chat.spec.ts` y `frontend/e2e/portada.spec.ts` se ejecutan igual (la segunda mide el desborde horizontal de la portada en móvil; está escrita pero aún no se ha corrido). Los e2e formales completos quedan para la Fase 7.

## Comandos
**Backend** (`cd backend`)

| Comando | Qué hace |
|---|---|
| `npm run start:dev` | API en modo desarrollo (recarga al guardar) |
| `npm run build` / `npm run start:prod` | Compila a `dist/` / arranca lo compilado |
| `npm run migration:run` / `migration:revert` | Aplica / revierte migraciones |
| `npm run migration:generate` | Genera una migración a partir de las entidades |
| `npm run seed` | Carga datos de ejemplo (idempotente) y, si Ollama responde, sus vectores |
| `npm run embeddings:sync` | Calcula los vectores de búsqueda que faltan o cambiaron |
| `npm run chat:purge` | Borra conversaciones del chat con más de 7 días sin actividad |
| `npm run lint` | Análisis estático (oxlint con tipos) |

**Frontend** (`cd frontend`)

| Comando | Qué hace |
|---|---|
| `npm run dev` | Sitio en http://localhost:5173 (el proxy envía `/api` a `VITE_API_TARGET`, por defecto el puerto 8000) |
| `npm run api:types` | Regenera `src/api/schema.d.ts` desde la API encendida. **Solo así se actualiza; nunca a mano.** Ejecútalo cada vez que cambie el contrato |
| `npm run build` | Typecheck y build de producción |

**Bots de demostración** (`cd chatbot/a2a-demo`): `node start.mjs` enciende un bot amigo de seguros (puerto 8100) y uno malicioso (8101), solo en `127.0.0.1`. Se niegan a arrancar con `NODE_ENV=production` o dentro de Docker.

## Estructura
```
concesionario/
├── backend/src/      auth, vehiculos, marcas, clientes, citas, ventas, financiacion, metricas, usuarios
│                     chat/ (asistente: agente, tools, proveedores de modelo, seguridad)
│                     embeddings/ (búsqueda por significado)   catalogo/ (catálogo público para terceros)
│                     mcp/ (servidor MCP y administración de bots)   a2a/ (tarjeta, tareas entrantes y cliente saliente)
├── backend/test/     pruebas e2e (Supertest) y los bots de prueba para ellas
├── frontend/src/     pages, features (catálogo, detalle, chat, panel…), components, api
├── chatbot/          herramientas de desarrollo: bench/ (medir el modelo), eval/ (las 20 preguntas), a2a-demo/ (bots de prueba)
├── docs/             PRD, ESTADO, DECISIONES, DEMO, planes y guías
└── docker-compose.yml
```

## El chat y la conexión entre bots

- **Proveedor del modelo**: `CHAT_PROVIDER` = `ollama`, `groq` o `mock`. Con `groq` el texto de la persona sale de la máquina y el widget lo avisa. El simulado solo prueba la lógica del chat, no la calidad.
- **Seguridad del chat**: el prompt es fijo y versionado (hoy `v2`); lo que escribe el usuario y lo que devuelven las herramientas se tratan como datos, nunca como instrucciones; los montos en pesos se validan contra lo que devolvieron las herramientas; las citas solo se crean con la confirmación de la persona en una tarjeta; los datos de contacto nunca llegan al modelo.
- **MCP** (`POST /api/mcp`, JSON-RPC sin estado, `Authorization: Bearer <key>`): herramientas de **solo lectura** `consultar_stock`, `consultar_precio` y `listar_marcas`. `agendar_cita` no se expone.
- **A2A**: `GET /.well-known/agent.json` (tarjeta pública) y `POST /a2a/tasks` (habilidades `stock`, `precios`, `citas` —solo informativa— y `financiacion`), deterministas y sin modelo de lenguaje. Mismo 401 idéntico y misma cuota diaria que MCP.
- **Registrar un bot** (panel → **Bots**): se crea con su key, que se muestra **una sola vez** (si se pierde, se rota); tiene límites propios y se puede desactivar. Para que AutoMax le pregunte a un bot hay que darle su dirección (https y un nombre público) y, si la pide, una key saliente que se guarda cifrada.
- **Lo que viene de otro bot es un dato no confiable**: se convierte en texto plano (sin HTML, enlaces, correos ni teléfonos), se muestra en una tarjeta aparte y el modelo nunca lo ve.
- **Protección contra llamadas a redes internas (SSRF)**: https obligatorio, se resuelve el DNS y se fija la IP validada, sin redirecciones ni proxy, tope de tamaño y de tiempo, límites y circuit breaker. `A2A_DEV_ALLOWED_TARGETS` (IP:puerto exactos, solo desarrollo) es la única excepción.
- **A2A en producción**: define `A2A_PUBLIC_BASE_URL` (https). Para recibir llamadas con un nombre de host propio, ese host se acepta solo; otros nombres van en `MCP_ALLOWED_HOSTS`.
- Detalle y justificación: decisiones 95 a 123 de `docs/DECISIONES.md`.

## Mantenimiento

**Recrear la base de desarrollo** (cuando cambia el seed). El seed actualiza datos de catálogo pero no renumera los ids, así que un cambio en el orden de inserción solo se ve en una base nueva:
```bash
docker compose down -v          # ¡borra el volumen: TODA la base de desarrollo y la de pruebas!
docker compose up -d
cd backend && npm run migration:run && npm run seed && npm run embeddings:sync
```
`down -v` también borra los vectores de la búsqueda; sin `embeddings:sync` el catálogo con filtros funciona pero `GET /api/vehiculos/buscar` no devuelve resultados. La base de pruebas se vuelve a crear sola con `npm run test:e2e`.

**Rotar el pepper de las keys**: sube `MCP_KEY_PEPPER_VERSION` y deja el anterior en `MCP_KEY_PEPPER_PREVIOUS` hasta que cada bot haya llamado una vez (su hash se recalcula solo).

**Al desplegar**: el bloqueo por IP de los canales de bots (10 fallos de autenticación en 5 minutos bloquean la IP 15 minutos) usa `req.ip`, así que depende de `trust proxy`, que **todavía no está configurado** (ver `docs/ESTADO.md`): sin él, detrás de un proxy inverso todos comparten una IP. Los contadores viven en el proceso (una sola réplica).

## Problemas frecuentes

| Síntoma | Qué revisar |
|---|---|
| La API no arranca y nombra una variable | Falta o es inválida: `MCP_KEY_PEPPER`, `BOT_KEY_ENCRYPTION_KEY`, `JWT_SECRET` o `A2A_DEV_ALLOWED_TARGETS` (IP:puerto exactos) |
| Error por una columna que no existe | No corriste `npm run migration:run` tras actualizar |
| El chat dice que no está disponible | El modelo no responde: revisa `CHAT_PROVIDER` y que Ollama esté encendido, o usa `mock` |
| La búsqueda inteligente no devuelve nada | Falta `ollama pull nomic-embed-text` y `npm run embeddings:sync` |
| El frontend no encuentra la API | Define `VITE_API_TARGET` si la API no está en el puerto 8000 |
| Los autos salen sin foto | Aún no hay fotos reales: se muestra `placeholder.svg` |
| "Ese destino no está permitido" al probar un bot | Es la protección SSRF: para bots de esta máquina agrega su IP:puerto a `A2A_DEV_ALLOWED_TARGETS` y reinicia la API |

## Ramas
`main` (integración) y una rama por integrante: `devKevin`, `devVioleta`, `devEmerson`, `devCarlos`. Commits pequeños (`feat(vehiculos): agrega filtro por marca`); cada fase termina con pruebas en verde, README actualizado y commit.
