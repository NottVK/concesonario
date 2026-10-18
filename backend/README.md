# AutoMax — Backend (NestJS)

API REST del concesionario: NestJS + TypeScript estricto + TypeORM + PostgreSQL 16. Todas las rutas llevan el prefijo `/api`.

## Puesta en marcha

```bash
docker compose up -d          # desde la raíz: PostgreSQL 16 + pgvector
cp ../.env.example ../.env    # y cambia JWT_SECRET, DB_PASSWORD, SEED_DEMO_PASSWORD
npm install
npm run migration:run         # esquema
npm run seed                  # 10 marcas, 60 vehículos, usuarios demo
npm run start:dev             # http://localhost:8000/api
```

`JWT_SECRET` es obligatorio (mínimo 16 caracteres); sin él la API no arranca. Genera uno con `openssl rand -hex 32`.

## Autenticación y roles

- `POST /api/auth/login` → `{ accessToken, user }`. El token dura `JWT_EXPIRES_IN` (1 h por defecto). Se envía como `Authorization: Bearer <token>`.
- Roles: `admin` y `vendedor`. Las rutas son privadas por defecto; las abiertas llevan `@Public()`.
- Usuarios demo (del seed): `admin@automax.co` y `vendedor@automax.co`, con la contraseña de `SEED_DEMO_PASSWORD`.

## Endpoints

| Ruta | Quién |
|---|---|
| `POST /auth/login` | público (5 intentos/min) |
| `GET /auth/me` | autenticado |
| `GET /marcas`, `GET /marcas/:id` | público |
| `POST/PUT/DELETE /marcas` | admin |
| `GET /vehiculos` (filtros + paginación), `GET /vehiculos/:id`, `GET /vehiculos/comparar?ids=1,2,3` | público |
| `POST/PUT/DELETE /vehiculos` | admin |
| `POST /clientes` | público (solo devuelve `{ id }`) |
| `GET /clientes`, `GET /clientes/:id`, `PUT /clientes/:id` | vendedor, admin |
| `POST /citas` | público (no devuelve datos del cliente) |
| `GET /citas`, `GET /citas/:id`, `PATCH /citas/:id/estado` | vendedor, admin |
| `POST /ventas`, `GET /ventas`, `GET /ventas/:id` | vendedor, admin |
| `POST /financiacion/simular` | público |

**Filtros de `GET /vehiculos`:** `marca`, `modelo`, `anioMin`, `anioMax`, `precioMin`, `precioMax`, `combustible`, `transmision`, `estado` (nuevo/usado), `orden` (`recientes`, `precio_asc`, `precio_desc`, `anio_desc`, `anio_asc`), `page`, `limit` (máx. 50). Los vendidos nunca salen en el catálogo. Respuesta: `{ data, meta: { total, page, limit, pages } }`.

**Agendar una cita** (`POST /citas`): `{ "vehicleId": 1, "scheduledAt": "2026-11-03T10:00:00-05:00", "customer": { "name": "Ana", "email": "ana@correo.co" } }`.
- La fecha debe llevar zona horaria. Dura 60 min, de lunes a sábado entre 8:00 y 18:00 (hora de Bogotá) y debe terminar antes del cierre.
- Un vehículo y un cliente no pueden tener dos citas activas que se crucen (409). Lo garantiza PostgreSQL con restricciones de exclusión, no solo el código.
- Estados: `pendiente → confirmada | cancelada`, `confirmada → cancelada`. Una cancelada no se reactiva y libera el horario.

**Registrar una venta** (`POST /ventas`): `{ "vehicleId", "customerId", "finalPrice": "115000000.50", "payment": "contado|credito|leasing" }`. El vendedor sale del token. En una sola transacción se bloquea el vehículo (`FOR UPDATE`), se registra la venta, se marca `vendido` y se cancelan sus citas abiertas. Venderlo dos veces da 409.

**Simulador** (`POST /financiacion/simular`): `{ "valor": "100000000", "cuotaInicial": "20000000", "plazoMeses": 60, "tasaEA": 0.18 }`. Plazo de 12 a 84 meses; `tasaEA` es opcional (usa `FINANCING_DEFAULT_RATE_EA`). La cuota se redondea hacia arriba al centavo.

Dinero: siempre `string` con hasta 2 decimales, en COP.

## Límites de peticiones

100 por minuto por IP en general (`THROTTLE_LIMIT`); login 5/min; `POST /clientes`, `POST /citas` 10/min; simulador 30/min.

## Pruebas

```bash
npm test            # unitarias (Vitest)
npm run test:e2e    # e2e (Supertest) contra la BD concesionario_test
npm run lint
```

Las pruebas e2e crean `concesionario_test` solas (con las migraciones) en el mismo PostgreSQL de Docker y usan la base real: no hay mocks de BD, porque lo que se prueba son transacciones, bloqueos y restricciones.

## Migraciones

```bash
npm run migration:run
npm run migration:revert
```

Las decisiones de arquitectura están en `../docs/DECISIONES.md`.
