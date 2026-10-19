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

## Revisión cruzada con Codex (Fase 1)
Corregido: el seed ya no pisa `precio`, `km` ni `estado` al repetirse; los usuarios demo no se cargan con `NODE_ENV=production` ni se reemplazan si existen; el `down` de la extensión `vector` es no-op; migración `AddConstraints` con CHECK (precio > 0, km >= 0, año 1990–2100, precio_final > 0) declarados también en las entidades; `intercambios_bots.bot_id` pasa a `ON DELETE RESTRICT` para conservar la auditoría.

## 2026-10-18 — Fase 2 (APIs REST)

1. **JWT con guard propio** (`@nestjs/jwt`), sin Passport. `JwtAuthGuard`, `RolesGuard` y `ThrottlerGuard` son globales; las rutas son privadas salvo `@Public()`. Token de 1 h; `JWT_SECRET` obligatorio (≥ 16 caracteres) o la app no arranca.
2. **Login sin enumeración de usuarios:** se compara contra un hash falso cuando el correo no existe y el mensaje es el mismo.
3. **Rate limit con `@nestjs/throttler`** desde esta fase: 100/min global, login 5/min (fijo, sin override por entorno), POST públicos 10/min y simulador 30/min. Estos últimos se pueden subir con `THROTTLE_PUBLIC_LIMIT` (lo usan las pruebas e2e).
4. **Contrato de la API (unificado en inglés, ver el punto 14):** inicialmente los filtros y el simulador usaban nombres en español; se unificaron antes de la Fase 3.
5. **Citas, duración y solapes** (cierra el pendiente de Fase 1): columna `duracion_min` (60 fijo, CHECK 15–240) y dos restricciones `EXCLUDE USING gist` (`ex_citas_vehiculo_solape`, `ex_citas_cliente_solape`) sobre `citas_rango(fecha_hora, duracion_min)`, solo para citas no canceladas. Reemplazan al índice único por hora exacta. El `down` restaura ese índice y **no** borra `btree_gist`.
6. **`citas_rango` es una función SQL `IMMUTABLE`:** PostgreSQL no admite `timestamptz + interval` (es `STABLE`) dentro de una restricción de exclusión. Sumar solo minutos no depende de zona horaria ni DST, así que marcarla inmutable es correcto.
7. **Horario:** lunes a sábado, 8:00–18:00 en `America/Bogota`, la cita completa debe terminar antes del cierre. `scheduledAt` exige zona horaria explícita (ISO 8601 con `Z` u offset) y se guarda como `timestamptz`. No se contemplan festivos.
8. **`POST /citas` público recibe los datos del cliente**, no un `customerId`: así un anónimo no puede agendar a nombre de un cliente ajeno adivinando ids. Si el correo ya existe se reutiliza el cliente **sin modificar sus datos**, y la respuesta pública no incluye ningún dato del cliente. Limitación conocida: quien conozca el correo de otra persona puede ocuparle franjas; mitigado con rate limit.
9. **`POST /clientes` público** devuelve solo `{ id }`; con correo repetido responde 409 (revela que el correo existe; aceptado, con rate limit). Los correos se guardan en minúsculas. La búsqueda `q` distingue acentos (no hay `unaccent`).
10. **Ventas** (cierra el pendiente de Fase 1): transacción con `SELECT … FOR UPDATE` sobre el vehículo, 409 si ya está `vendido`, vendedor tomado del token, y cancelación de las citas abiertas del vehículo. El índice único `ventas.vehiculo_id` queda como respaldo.
11. **Catálogo:** los vehículos `vendido` no aparecen en `GET /vehiculos`; el estado `vendido` solo lo fija una venta (el DTO solo acepta nuevo/usado) y un vehículo vendido no se edita.
12. **Dinero en el simulador:** centavos con `BigInt`; la tasa mensual se calcula con `Number` y la cuota se redondea hacia arriba al centavo (nunca se cobra de menos). Sin tabla de amortización por ahora.
13. **Pruebas e2e contra BD real** `concesionario_test` (creada y migrada por `test/global-setup.ts`); sin mocks de BD. Dependencias nuevas: `@nestjs/jwt`, `@nestjs/throttler` y `@types/pg` (solo desarrollo).

14. **Contrato unificado en inglés** (antes de que el frontend lo consuma). Rutas en español (`/vehiculos`, `/citas`), pero todos los parámetros y campos JSON en inglés `camelCase`; los valores de los enums y los mensajes de error siguen en español. Renombres: `marca→brandId` (ahora filtra por **id**, no por nombre), `modelo→model`, `anioMin/Max→yearMin/Max`, `precioMin/Max→priceMin/Max`, `combustible→fuel`, `transmision→transmission`, `estado→status`, `orden→sort` (`recientes→newest`, `precio_asc→price_asc`, `precio_desc→price_desc`, `anio_desc→year_desc`, `anio_asc→year_asc`); en citas `estado→status`, `vehiculoId→vehicleId`, `desde/hasta→from/to`; simulador `valor→amount`, `cuotaInicial→downPayment`, `plazoMeses→months`, `tasaEA→annualRate` y en la respuesta `financiado→financed`, `tasaMensual→monthlyRate`, `cuotaMensual→monthlyPayment`, `totalPagar→totalPayment`, `totalIntereses→totalInterest`. Los nombres antiguos ahora dan 400 (`forbidNonWhitelisted`), y hay pruebas que lo exigen. Es un cambio incompatible, aceptable porque aún no hay clientes de la API.
15. **Swagger/OpenAPI** con `@nestjs/swagger` en `/api/docs` (JSON en `/api/docs-json`), público como el resto del contrato. Se anotan los DTOs y entidades **explícitamente** con `@ApiProperty` y no con el plugin del CLI: funciona igual bajo Vitest y `nest start`, no depende de rutas `require` en ESM y permite probarlo. `embedding` y `passwordHash` no se anotan, así que nunca aparecen. Una prueba e2e (`test/docs.e2e-spec.ts`) fija las 25 operaciones, los nombres de parámetros y campos, qué rutas son privadas y que no reaparezcan los nombres en español. Si se agrega un endpoint sin documentarlo, esa prueba falla.

## Revisión cruzada con Codex (Fase 2)
Codex no pudo leer el repositorio (su `exec_command` está bloqueado por política en este entorno), así que se le pasó el diff completo en el prompt (`--prompt-file`). Cuando se repita la revisión, hay que hacerlo igual.

**Corregido:**
- `updateStatus` de citas ahora hace `UPDATE … WHERE estado = <leído>` y responde 409 si otra petición lo cambió (antes dos PATCH simultáneos pasaban ambos).
- `THROTTLE_PUBLIC_LIMIT` solo se respeta con `NODE_ENV=test`; en producción no puede desactivar el límite.
- Pruebas nuevas: la de ventas bloquea el vehículo desde otra transacción para probar que `FOR UPDATE` decide (verificado quitando el bloqueo: solo esa prueba falla; las de ráfaga pasaban igual gracias al índice único), carrera de un mismo cliente en dos vehículos y dos cambios de estado simultáneos.

**Bug propio hallado después, al unificar el contrato:** `sort=newest` (antes `orden=recientes`, el valor por defecto) devolvía el catálogo del más viejo al más nuevo. El desempate `addOrderBy('v.id', 'ASC')` usa la misma clave que el orden principal por `v.id` y TypeORM guarda los órdenes en un mapa por columna, así que lo sobrescribía. Corregido (el desempate solo se agrega si no se ordena ya por id) y cubierto por una prueba que compara contra la BD.

**Descartado, con motivo:** la cuota fija con `total = cuota × n` es deliberada (sin ajustar la última cuota) y `Number` no pierde precisión hasta 10¹² centavos; la columna interpolada en el pre-chequeo de solape sale de un tipo cerrado (`'vehicleId' | 'customerId'`); no hay correos históricos con mayúsculas porque todo pasa por el servicio que los normaliza.

## 2026-10-18 — Fase 3 (frontend)

1. **Filtro `brand`** en `GET /vehiculos`: nombre exacto de la marca, sin distinguir mayúsculas ni espacios en los bordes. Complementa a `brandId` (se combinan con AND).
2. **Tipos desde el contrato real:** `openapi-typescript` genera `src/api/schema.d.ts` desde `/api/docs-json` (`npm run api:types`) y el archivo se versiona. `src/api/types.ts` expone alias legibles; no se escriben tipos de respuesta a mano.
3. **TypeScript 5.9 en el frontend** (la plantilla de Vite trae 6.0): `openapi-typescript` 7 exige TS 5 como peer. Se subirá cuando lo soporte.
4. **Proxy de Vite:** `/api` → `VITE_API_TARGET` (por defecto `http://localhost:8000`). Axios usa `baseURL: '/api'`, sin CORS en desarrollo. En producción hará falta un proxy inverso (ver pendiente de `trust proxy`).
5. **Token de login en memoria + `sessionStorage`**, no `localStorage`: se borra al cerrar la pestaña y sobrevive a recargar. Un 401 con sesión activa la limpia. El guard de rutas del cliente solo mejora la experiencia; los roles los verifica el backend. Sin `dangerouslySetInnerHTML` en todo el frontend.
6. **Imagen de reemplazo:** `CarImage` cambia una sola vez a `/autos/placeholder.svg` si el `.webp` falla; `BrandLogo` cae a la inicial de la marca. Placeholders hasta tener fotos reales.
7. **Componentes tipo shadcn escritos a mano** (`Button`, `Skeleton`) con `class-variance-authority`, `clsx` y `tailwind-merge`, en vez de ejecutar el CLI interactivo. Se agregan más componentes del mismo estilo cuando haga falta.
8. **Pruebas del frontend:** Vitest + Testing Library + `msw` (dependencias de desarrollo; `msw` se usará para simular la API en las pantallas). Playwright queda para el cierre.
9. **Modo claro:** los tokens existen (`:root`), pero el interruptor aún no; la app arranca en oscuro.

10. **Catálogo (pantalla 1):** los filtros viven en la URL (`useSearchParams`) para compartir y recargar; todo valor de la URL se valida y se descarta si es inválido. Selects aplican al instante; los rangos de precio y año al salir del campo o con Enter, y un rango invertido se intercambia en el cliente (la API respondería 400 con años invertidos). La paginación usa `keepPreviousData` para no parpadear.
11. **`VehicleWithBrand`:** el spec marca `brand` como opcional porque la entidad se reutiliza en otras respuestas; en listados, detalle y comparador siempre viene, así que el frontend lo tipa como obligatorio en esas rutas.
12. **Home (pantalla 4):** los "destacados" serán `sort=newest` con límite pequeño, sin campo `featured`.
13. **Métricas del admin:** se crearán en el backend, solo para rol admin y con pruebas, antes de la pantalla 6.
14. **Playwright** (`@playwright/test` + Chromium) se instaló para revisar el aspecto en navegador real; los e2e formales llegan en el cierre de la fase.
15. **`msw` 3:** la opción para peticiones sin manejar se llama `onUnhandledFrame` (antes `onUnhandledRequest`); las pruebas la usan en `'error'` para que ninguna petición real se cuele.

### Pendientes de la Fase 3
- **Cookie `httpOnly` + `SameSite` en lugar de `sessionStorage`:** más resistente a XSS, pero exige cambiar el backend (emitir cookie, protección CSRF). Revisar antes de producción.
- **Endpoints que faltan para el panel admin (pantalla 6):** no existe ninguna métrica agregada. Hay que crear en el backend, con pruebas, antes de esa pantalla: totales (vehículos en stock, citas pendientes, ventas y monto del mes), ventas por mes, stock por marca, y un listado admin de vehículos que incluya los `vendido` (`GET /vehiculos` los oculta).

## Pendientes registrados
- **Gestión de usuarios (cuando exista):** el JWT confía en `sub` y `role` hasta que expira (1 h). Al agregar desactivar usuarios o cambiar roles hay que validar el usuario en cada petición o añadir revocación/versión de sesión.
- **Despliegue:** no hay `trust proxy` configurado; detrás de un proxy inverso todas las peticiones compartirían IP en el rate limit. Configurarlo al desplegar.
- **Correos:** valorar un índice único sobre `lower(correo)` y búsqueda sin acentos (`unaccent`).
- **Fase 6 (A2A):** `bots_externos.api_key` está en texto plano; cifrarla con una clave fuera de la BD o guardar solo su hash.
- **`mcp.json`:** contiene la contraseña de desarrollo de la BD; mover a variable de entorno.
- Imágenes WebP en `frontend/public/autos/` (Fase 3); los seeds ya apuntan a `/autos/<marca>-<modelo>.webp`.
- Logos de marcas en `/autos/marcas/<marca>.svg` (Fase 3).
