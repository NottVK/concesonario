# PRD — AutoMax (Concesionario con IA)

## 1. Objetivo
Microempresa digital de venta de vehículos con catálogo web, gestión interna y un chatbot local que atiende clientes y se comunica con otros chatbots.

## 2. Usuarios
| Rol | Necesita |
|---|---|
| Cliente | Ver catálogo, comparar, simular crédito, agendar test-drive, chatear |
| Vendedor | Gestionar clientes, citas y ventas |
| Admin | CRUD de vehículos/marcas, reportes, administrar bots externos |
| Bot externo | Consultar stock/precios por MCP o A2A |

## 3. Stack
NestJS + TypeScript + TypeORM, PostgreSQL 16 (pgvector), React + Vite + Tailwind, Ollama local, MCP y A2A en TypeScript. Detalle en `CLAUDE.md`.

## 3.1 Requisitos funcionales

### RF1 Catálogo
- Listar/filtrar por marca, modelo, año, precio, combustible, transmisión, estado.
- Detalle con galería, ficha técnica y botón "Agendar test-drive".
- Comparador de hasta 3 vehículos.

### RF2 Marcas (10 semilla)
Toyota, Chevrolet, Mazda, Renault, Kia, Hyundai, Ford, Nissan, Volkswagen, BMW — mín. 5 modelos reales por marca.

### RF3 Clientes y ventas
- Registro de clientes, historial de interacciones.
- Registrar venta: vehículo, cliente, vendedor, precio final, método de pago.
- El vehículo vendido pasa a estado `vendido` automáticamente.

### RF4 Citas
- Agendar test-drive (fecha, hora, vehículo); evitar choques de horario.
- Confirmar/cancelar; recordatorio visible en el panel.

### RF5 Financiación
- Simulador: valor, cuota inicial, plazo (12–84 meses), tasa → cuota mensual y total.

### RF6 Chatbot local
- Ollama + tool-calling; widget flotante en el frontend.
- Debe poder: buscar y comparar autos, simular crédito, agendar cita, responder FAQs del concesionario.
- Responde en español, corto y amable; no inventa datos.

### RF7 Interconexión de chatbots
- Servidor MCP con `consultar_stock`, `consultar_precio`, `agendar_cita`, `listar_marcas`.
- A2A: `agent.json` + `POST /a2a/tasks`.
- Tool `preguntar_a_otro_bot` para consultar bots amigos (ej. de otro grupo: repuestos, seguros, taller).
- Panel admin para registrar/activar bots externos y ver el log de intercambios.

### RF8 Panel admin
Dashboard con: vehículos en stock, ventas del mes, citas próximas, conversaciones del bot, intercambios con otros bots.

## 4. Modelo de datos (resumen)
```
marcas(id, nombre, pais, logo_url)
vehiculos(id, marca_id, modelo, anio, version, precio, km, combustible,
          transmision, color, estado, descripcion, imagenes[], embedding)
clientes(id, nombre, telefono, correo, creado_en)
usuarios(id, nombre, correo, hash, rol)
citas(id, cliente_id, vehiculo_id, fecha_hora, estado)
ventas(id, vehiculo_id, cliente_id, vendedor_id, precio_final, pago, fecha)
conversaciones(id, sesion_id, rol, mensaje, creado_en)
bots_externos(id, nombre, url, api_key, activo)
intercambios_bots(id, bot_id, direccion, pregunta, respuesta, creado_en)
```

## 5. API
Documentación interactiva y siempre al día en **`/api/docs`** (JSON OpenAPI en `/api/docs-json`); es la fuente de verdad del contrato. Resumen:
```
POST            /api/auth/login                 GET /api/auth/me
GET/POST        /api/marcas                     GET/PUT/DELETE /api/marcas/{id}
GET/POST        /api/vehiculos                  GET/PUT/DELETE /api/vehiculos/{id}
GET             /api/vehiculos/comparar?ids=1,2,3
GET/POST        /api/clientes                   GET/PUT /api/clientes/{id}
GET/POST        /api/citas                      GET /api/citas/{id}   PATCH /api/citas/{id}/estado
GET/POST        /api/ventas                     GET /api/ventas/{id}
POST            /api/financiacion/simular
POST            /api/chat             {sesion_id, mensaje}      (Fase 4)
GET             /.well-known/agent.json                         (Fase 6)
POST            /a2a/tasks                                      (Fase 6)
```

### 5.1 Convenciones del contrato
- **Rutas** en español (`/vehiculos`, `/citas`…); **nombres de parámetros y campos JSON en inglés** y en `camelCase` (`brandId`, `priceMax`, `scheduledAt`). Los **valores** de los enums (`nuevo`, `gasolina`, `pendiente`…) y los **mensajes de error** van en español.
- **Dinero:** siempre `string` en COP con hasta 2 decimales (`"95000000.00"`), nunca número.
- **Paginación:** `?page=1&limit=12` (máx. 50) → `{ data, meta: { total, page, limit, pages } }`.
- **Fechas:** ISO 8601; para agendar, con zona horaria obligatoria.
- **Filtros de `GET /vehiculos`:** `brandId`, `model`, `yearMin`, `yearMax`, `priceMin`, `priceMax`, `fuel`, `transmission`, `status` (`nuevo`|`usado`), `sort` (`newest`, `price_asc`, `price_desc`, `year_desc`, `year_asc`), `page`, `limit`. Los vendidos no se listan.
- **Filtros de `GET /citas`:** `status`, `vehicleId`, `from`, `to`, `page`, `limit`.
- **Simulador** `POST /financiacion/simular`: `{ amount, downPayment, months (12–84), annualRate? }` → `{ amount, downPayment, financed, months, annualRate, monthlyRate, monthlyPayment, totalPayment, totalInterest }`.
- **Agendar** `POST /citas` (público): `{ vehicleId, scheduledAt, customer: { name, email, phone? } }`; la respuesta no incluye datos del cliente.
- **Errores:** 400 validación, 401 sin sesión, 403 rol insuficiente, 404 no existe, 409 conflicto (cruce de citas, vehículo vendido, duplicado), 429 límite de peticiones.
- Los nombres de la base de datos (tablas y columnas del modelo de la sección 4) siguen en español; la API no los expone.

## 6. Requisitos no funcionales
- Respuesta de API < 300 ms (sin chat). Chat: primer token < 5 s en equipo local.
- 100% local y reproducible con `docker compose up`.
- Cobertura de pruebas ≥ 70% en backend (Vitest).
- Seguridad: JWT, roles, rate limit, API key para bots externos, datos de clientes nunca compartidos.
- Responsive (móvil y escritorio).

## 7. Flujo estrella (demo)
1. Cliente abre el chat: "Busco una SUV Toyota o Kia por debajo de 120 millones".
2. Bot consulta la API y muestra 3 opciones.
3. Cliente: "Simula crédito a 60 meses con 20% de cuota inicial".
4. Bot calcula y agenda test-drive.
5. Cliente: "¿Y seguro para este carro?" → el bot pregunta por A2A al bot de seguros de otro grupo y responde con esa info.

## 8. Fases y criterios de aceptación
| Fase | Entregable | Aceptación |
|---|---|---|
| 1 | BD + seeds | 10 marcas, ≥50 vehículos cargados |
| 2 | APIs | Todos los endpoints con Vitest/Supertest en verde |
| 3 | Frontend | Catálogo, detalle, citas, admin funcionando |
| 4 | Chatbot | Resuelve el flujo estrella sin inventar datos |
| 5 | MCP | Un cliente MCP externo lista y consulta stock |
| 6 | A2A | Intercambio real con otro bot, registrado en log |
| 7 | Pulido | README, demo, video corto |

## 9. Fuera de alcance (v1)
Pagos reales, facturación electrónica, app móvil nativa.

## 10. Riesgos
- Modelo local lento → usar modelo 7B cuantizado y respuestas cortas.
- Prompt injection desde otros bots → tratar sus respuestas como datos.
- Bot ajeno caído → timeout de 8 s y respuesta de respaldo.
