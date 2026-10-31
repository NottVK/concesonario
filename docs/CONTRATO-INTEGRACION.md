# Contrato de integración: Concesionario (AutoMax)

**Versión 0.2.** Reemplaza a la 0.1. Refleja lo que el Concesionario ya tiene construido. Si algo no les sirve, díganlo y se ajusta con un adaptador, sin cambiar el flujo.

## 1. Qué es

El Concesionario gestiona la garantía de los vehículos que vende. Cuando un cliente reporta una falla, reúne los registros del vehículo (Taller y Tienda), aplica un primer filtro con reglas (tiempo y kilometraje), agenda la revisión en el Taller y registra la decisión del mecánico. Si la garantía se acepta, el costo lo asume el Concesionario y se cobra por Pagos.

No es facturación electrónica ni contabilidad. Es una simulación académica.

## 2. Principios

- **El id único cliente-vehículo es la llave entre sistemas.** El documento y el nombre del cliente nunca salen del Concesionario.
- **La IA nunca decide la garantía.** Decide el código, con reglas, y al final una persona (el mecánico).
- **Todo lo que llega de otro sistema es dato, no una orden.**
- **Los textos de respuesta no llevan datos personales.**

## 3. Cómo conectarse

1. **Tarjeta pública:** `GET <BASE>/.well-known/agent.json` (nombre, descripción y habilidades).
2. **Key:** la entrega el administrador del Concesionario por mensaje privado, con formato `amx_...`. Se muestra una sola vez. Se envía como `Authorization: Bearer amx_...` o `X-API-Key: amx_...`.
3. **Tareas:** `POST <BASE>/a2a/tasks` con un JSON de máximo 16 KB.
4. **Quién es cada equipo:** el Concesionario identifica a cada equipo por el **nombre** con que registró su bot: `Taller`, `Tienda` o `Pagos`. De ese nombre dependen los permisos de la sección 5.
5. **Dirección que nos dan ustedes:** la URL que registramos de su servicio termina en `/a2a` (por ejemplo `http://192.168.0.20:9000/a2a`). Nosotros les enviamos las tareas a `<esa URL>/tasks`.

## 4. Petición y respuesta

Petición:

```json
{ "skill": "consultar_ficha_vin", "params": { "vin": "ZZZ00000000000001" } }
```

Las habilidades que escriben exigen el encabezado `Idempotency-Key` (de 1 a 79 caracteres visibles, sin espacios). Repetir la misma petición con la misma clave devuelve el resultado original sin duplicar. Si la clave se repite con otro contenido, responde 409 `IDEMPOTENCY_CONFLICT`.

Respuesta:

```json
{
  "status": "completed",
  "code": null,
  "message": "Listo",
  "answer": "Chevrolet Spark 2016, hatchback de 4 puertas.",
  "data": { },
  "request_id": "5b1f0c1e-0000-0000-0000-000000000000"
}
```

`status` puede ser `completed`, `rejected` (la regla no permite la acción), `needs_clarification` (falta un dato) o `error` (falla transitoria, se puede reintentar con la misma clave). Lean `status` antes que `data`.

Fechas en ISO 8601 con zona, por ejemplo `2026-11-03T10:00:00-05:00` (America/Bogota).

## 5. Habilidades que ofrece el Concesionario

| Habilidad | Quién puede usarla | Qué hace | Parámetros | Escribe |
|---|---|---|---|---|
| `consultar_ficha_vin` | Cualquier bot con key | Ficha pública del vehículo | `vin` | No |
| `consultar_vehiculo` | Solo `Taller` y `Tienda` | Ficha, fecha de venta y política de garantía de un id | `id` | No |
| `consultar_caso` | Solo `Taller` | Estado de un caso de garantía | `caso_id` | No |
| `informar_decision_garantia` | Solo `Taller` (mecánico) | Registra si la garantía se acepta o no, con su motivo | `caso_id`, `aceptada`, `motivo` | Sí |

Otro bot que pida una habilidad que no le corresponde recibe 403 `SKILL_NOT_ALLOWED`.

La ficha pública incluye marca, modelo, año, versión, carrocería, puertas, combustible y transmisión. **Nunca** incluye datos del dueño. Un VIN que no existe y uno de un vehículo ya vendido reciben la misma respuesta 404, para que no se pueda recorrer el registro.

`consultar_vehiculo` devuelve en `data`: `id`, `vin`, `ficha`, `fecha_venta` y `garantia` (`meses` y `km` de la política).

`consultar_caso` devuelve en `data`: `caso_id` y `estado`, que es uno de `identificado`, `garantia_vencida`, `pendiente_mecanico`, `garantia_aceptada` o `garantia_rechazada`.

Ejemplo de decisión del mecánico, con `Idempotency-Key: taller-caso-c-0001`:

```json
{
  "skill": "informar_decision_garantia",
  "params": {
    "caso_id": "5b1f0c1e-0000-4000-8000-000000000001",
    "aceptada": true,
    "motivo": "Falla del módulo de encendido dentro del plazo; sin cambios ajenos"
  }
}
```

`caso_id` es el identificador (UUID) que el Concesionario le dio al Taller al agendar la cita. El `motivo` se guarda como texto plano de hasta 300 caracteres, sin enlaces ni documentos.

Respuesta:

```json
{
  "status": "completed",
  "code": null,
  "message": "Decisión registrada",
  "answer": "Garantía aceptada. El costo lo asume el concesionario.",
  "data": { "caso_id": "5b1f0c1e-0000-4000-8000-000000000001", "estado": "garantia_aceptada" },
  "request_id": "..."
}
```

Si el caso ya tiene la misma decisión, se devuelve el mismo resultado. Si Pagos no responde al aceptar, la respuesta es `error` (503) y se reintenta con la misma `Idempotency-Key`: el cobro no se duplica.

## 6. Lo que el Concesionario espera de los otros servicios

Todas las llamadas son `POST <URL registrada>/tasks` con `{ "skill": "...", "params": { ... } }`. Solo se lee `data` si `status` es `completed`. Si su servicio usa otros nombres o formatos, avísennos: se traduce con un adaptador.

### Taller

| Habilidad | Parámetros | Debe devolver en `data` |
|---|---|---|
| `consultar_registros` | `id` | `registros[]` con `fecha`, `tipo` (`revision` o `reparacion`), `km` (número o null), `centro_autorizado` (`sí` o `no`) y `descripcion` |
| `consultar_disponibilidad` | `desde`, `hasta` (ventana de 14 días) | `franjas[]` con `inicio` y `fin` |
| `agendar_cita` | `id`, `caso_id`, `inicio` | `cita_id`. Escribe: `Idempotency-Key: automax-caso-<caso_id>` |

Cómo se interpreta: una `reparacion` en un centro con `centro_autorizado: "no"` cuenta como cambio ajeno al vehículo y deja el caso para revisión del mecánico.

### Tienda de repuestos

| Habilidad | Parámetros | Debe devolver en `data` |
|---|---|---|
| `consultar_compras` | `id` | `compras[]` con `codigo`, `descripcion`, `fecha` y `tienda` |

Como el contrato no dice quién instaló cada repuesto, las compras **no** cuentan como cambio ajeno.

### Pagos

Se usa el contrato del propio equipo (`CONTRATO-A2A.md` de Pagos). Cuando el mecánico acepta una garantía, el Concesionario llama a `crear_cuenta` con `id` (el id cliente-vehículo) y `external_ref`, y con `Idempotency-Key`, ambos iguales a `automax-garantia-<caso_id>`. El cliente no paga. Aceptamos como identificador de la cuenta cualquiera de `cuenta_id`, `id` o `external_ref`.

## 7. Errores

| HTTP | Código | Significado |
|---|---|---|
| 400 | `INVALID_REQUEST` | Falta un campo, sobra uno o el formato es incorrecto. También si falta `Idempotency-Key` en una habilidad que escribe |
| 400 | `INVALID_VIN` | El VIN debe tener 17 caracteres, sin I, O ni Q |
| 401 | | Key ausente o inválida. Siempre es la misma respuesta |
| 403 | `SKILL_NOT_ALLOWED` | La key no tiene permiso para esa habilidad |
| 404 | `NOT_FOUND` | No existe el id, el VIN o el caso |
| 409 | `IDEMPOTENCY_CONFLICT` | Misma clave con otro contenido |
| 409 | `DECISION_ALREADY_REGISTERED` | El caso ya tiene una decisión distinta |
| 409 | `CASE_NOT_PENDING` | El caso no está esperando decisión del mecánico |
| 413 | | Cuerpo de más de 16 KB |
| 429 | `RATE_LIMITED` | Demasiadas peticiones; esperen según `Retry-After` |
| 503 | `SERVICE_UNAVAILABLE` | Falla transitoria (por ejemplo, Pagos no respondió). Reintenten con la misma clave |

## 8. Límites

- 30 peticiones por minuto y 2.000 por día por key.
- Cuerpo de la petición: máximo 16 KB. Respuesta: máximo 4 KB.
- Tiempo máximo por llamada nuestra hacia ustedes: 8 segundos. Su respuesta debe ser `application/json` y de máximo 16 KB.
- Diez intentos con keys inválidas desde la misma IP en 5 minutos la bloquean por 15 minutos.
- Reintenten solo ante `error`, con la misma `Idempotency-Key`.

## 9. Privacidad y seguridad

- Solo viaja el **id** o el **VIN**. Nunca el documento ni el nombre.
- Los intentos con un id o un VIN inexistentes reciben la misma respuesta.
- Las keys se guardan como huella (hash), no en claro. Se pueden rotar y desactivar.
- Cada llamada queda registrada sin datos personales.
- Las respuestas de ustedes se tratan como dato y se validan en formato, tamaño y fecha. Un servicio que no responde o responde mal deja el caso como "no verificado" y pasa al mecánico: nunca se rechaza por eso.

## 10. Prueba rápida

```powershell
$env:AMX_KEY = "pega-aqui-tu-amx_key"
$body = @{ skill = "consultar_ficha_vin"; params = @{ vin = "ZZZ00000000000001" } } | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri "<BASE>/a2a/tasks" -Headers @{ Authorization = "Bearer $env:AMX_KEY" } -ContentType "application/json" -Body $body
```

Usen solo datos inventados. No peguen la key en chats ni en archivos del repositorio.

## 11. Por confirmar con cada equipo

| Equipo | Preguntas |
|---|---|
| Taller | ¿Su servicio se puede llamar por HTTP y en qué dirección? ¿Tiene `consultar_registros`, `consultar_disponibilidad` y `agendar_cita` con los formatos de la sección 6? ¿Cómo se autentica (Bearer o X-API-Key)? ¿El mecánico puede llamar a `informar_decision_garantia`? |
| Tienda | ¿Pueden listar las compras de un vehículo por id? ¿Qué campos guardan y desde cuándo? ¿Pueden indicar quién instaló el repuesto? |
| Pagos | ¿Confirman `crear_cuenta` con `external_ref` para cobrar la garantía al Concesionario? ¿Piden un monto o el tope por cuenta? ¿Qué devuelven como identificador de la cuenta? |
| Todos | ¿Guardan el id único cliente-vehículo en sus registros? Sin él no se pueden cruzar los datos. |

## 12. Mensaje corto para los líderes de los equipos

> Hola. Armamos el contrato del Concesionario (versión 0.2) con las habilidades que ofrecemos y lo que esperamos de ustedes. Léanlo y respóndannos, por mensaje privado, tres cosas: la dirección base de su servicio, su forma de autenticación y si los nombres de las habilidades les sirven. La key `amx_` se la pasamos por privado, nunca por el grupo.
