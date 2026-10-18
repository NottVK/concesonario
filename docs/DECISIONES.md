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
4. **Contrato de la API:** el cuerpo y las respuestas de recursos usan los nombres de las entidades (inglés: `price`, `brandId`…), pero los parámetros de filtro y el simulador usan los nombres del PRD en español (`marca`, `precioMax`, `valor`, `plazoMeses`…). Es una excepción deliberada a "nombres en inglés" y queda pendiente unificarla antes de que el frontend consuma la API (Fase 3).
5. **Citas, duración y solapes** (cierra el pendiente de Fase 1): columna `duracion_min` (60 fijo, CHECK 15–240) y dos restricciones `EXCLUDE USING gist` (`ex_citas_vehiculo_solape`, `ex_citas_cliente_solape`) sobre `citas_rango(fecha_hora, duracion_min)`, solo para citas no canceladas. Reemplazan al índice único por hora exacta. El `down` restaura ese índice y **no** borra `btree_gist`.
6. **`citas_rango` es una función SQL `IMMUTABLE`:** PostgreSQL no admite `timestamptz + interval` (es `STABLE`) dentro de una restricción de exclusión. Sumar solo minutos no depende de zona horaria ni DST, así que marcarla inmutable es correcto.
7. **Horario:** lunes a sábado, 8:00–18:00 en `America/Bogota`, la cita completa debe terminar antes del cierre. `scheduledAt` exige zona horaria explícita (ISO 8601 con `Z` u offset) y se guarda como `timestamptz`. No se contemplan festivos.
8. **`POST /citas` público recibe los datos del cliente**, no un `customerId`: así un anónimo no puede agendar a nombre de un cliente ajeno adivinando ids. Si el correo ya existe se reutiliza el cliente **sin modificar sus datos**, y la respuesta pública no incluye ningún dato del cliente. Limitación conocida: quien conozca el correo de otra persona puede ocuparle franjas; mitigado con rate limit.
9. **`POST /clientes` público** devuelve solo `{ id }`; con correo repetido responde 409 (revela que el correo existe; aceptado, con rate limit). Los correos se guardan en minúsculas. La búsqueda `q` distingue acentos (no hay `unaccent`).
10. **Ventas** (cierra el pendiente de Fase 1): transacción con `SELECT … FOR UPDATE` sobre el vehículo, 409 si ya está `vendido`, vendedor tomado del token, y cancelación de las citas abiertas del vehículo. El índice único `ventas.vehiculo_id` queda como respaldo.
11. **Catálogo:** los vehículos `vendido` no aparecen en `GET /vehiculos`; el estado `vendido` solo lo fija una venta (el DTO solo acepta nuevo/usado) y un vehículo vendido no se edita.
12. **Dinero en el simulador:** centavos con `BigInt`; la tasa mensual se calcula con `Number` y la cuota se redondea hacia arriba al centavo (nunca se cobra de menos). Sin tabla de amortización por ahora.
13. **Pruebas e2e contra BD real** `concesionario_test` (creada y migrada por `test/global-setup.ts`); sin mocks de BD. Dependencias nuevas: `@nestjs/jwt`, `@nestjs/throttler` y `@types/pg` (solo desarrollo).

## Revisión cruzada con Codex (Fase 2)
Codex no pudo leer el repositorio (su `exec_command` está bloqueado por política en este entorno), así que se le pasó el diff completo en el prompt (`--prompt-file`). Cuando se repita la revisión, hay que hacerlo igual.

**Corregido:**
- `updateStatus` de citas ahora hace `UPDATE … WHERE estado = <leído>` y responde 409 si otra petición lo cambió (antes dos PATCH simultáneos pasaban ambos).
- `THROTTLE_PUBLIC_LIMIT` solo se respeta con `NODE_ENV=test`; en producción no puede desactivar el límite.
- Pruebas nuevas: la de ventas bloquea el vehículo desde otra transacción para probar que `FOR UPDATE` decide (verificado quitando el bloqueo: solo esa prueba falla; las de ráfaga pasaban igual gracias al índice único), carrera de un mismo cliente en dos vehículos y dos cambios de estado simultáneos.

**Descartado, con motivo:** la cuota fija con `total = cuota × n` es deliberada (sin ajustar la última cuota) y `Number` no pierde precisión hasta 10¹² centavos; la columna interpolada en el pre-chequeo de solape sale de un tipo cerrado (`'vehicleId' | 'customerId'`); no hay correos históricos con mayúsculas porque todo pasa por el servicio que los normaliza.

## Pendientes registrados
- **Gestión de usuarios (cuando exista):** el JWT confía en `sub` y `role` hasta que expira (1 h). Al agregar desactivar usuarios o cambiar roles hay que validar el usuario en cada petición o añadir revocación/versión de sesión.
- **Despliegue:** no hay `trust proxy` configurado; detrás de un proxy inverso todas las peticiones compartirían IP en el rate limit. Configurarlo al desplegar.
- **Correos:** valorar un índice único sobre `lower(correo)` y búsqueda sin acentos (`unaccent`).
- **Fase 6 (A2A):** `bots_externos.api_key` está en texto plano; cifrarla con una clave fuera de la BD o guardar solo su hash.
- **`mcp.json`:** contiene la contraseña de desarrollo de la BD; mover a variable de entorno.
- Imágenes WebP en `frontend/public/autos/` (Fase 3); los seeds ya apuntan a `/autos/<marca>-<modelo>.webp`.
- Logos de marcas en `/autos/marcas/<marca>.svg` (Fase 3).
