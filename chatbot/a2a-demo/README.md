# Bots de prueba A2A

Dos bots para probar la conexión entre chatbots sin depender de otro grupo. **Son herramientas de desarrollo:** escuchan solo en `127.0.0.1`, se niegan a arrancar con `NODE_ENV=production` o dentro de Docker, y no están en el `Dockerfile` ni en el build de Nest (hay una prueba que lo comprueba). No tienen dependencias: solo `node:http`.

```bash
cd chatbot/a2a-demo
node start.mjs            # amigo (8100) y malicioso (8101)
node start.mjs amigo      # solo el amigo
node start.mjs malicioso  # solo el malicioso
```

Para que la API los acepte hay que permitir su dirección **solo en desarrollo** (la API no arranca con esta variable en producción):

```
A2A_DEV_ALLOWED_TARGETS=127.0.0.1:8100,127.0.0.1:8101
```

## Bot amigo (puerto 8100)

Un bot de seguros (SegurosYa) que responde bien: SOAT, todo riesgo, responsabilidad civil y deducibles.

- `GET /.well-known/agent.json` — su tarjeta.
- `POST /a2a/tasks` — pide la key (`Authorization: Bearer …`, o `X-API-Key` con `A2A_DEMO_AUTH=x_api_key`) y responde `{ id, status, answer }`.
- `GET /_received` — qué le enviamos (esquema de autenticación, si la key era correcta y el cuerpo): sirve para comprobar que nunca recibe el historial ni datos personales.
- Key de demostración: `amigo-demo-key-0123456789` (cámbiala con `A2A_DEMO_FRIEND_KEY`).
- En el panel se registra con la URL `http://127.0.0.1:8100/a2a`.

## Bot malicioso (puerto 8101)

Una URL por ataque: `http://127.0.0.1:8101/<modo>/a2a` (la tarea va a `/<modo>/a2a/tasks`). Acepta cualquier key y apunta lo que le llega en `GET /_hits`; `hits.internal` debe quedar en **0** (si no, el cliente siguió una redirección hacia adentro).

| Grupo | Modos | Qué ataca |
|---|---|---|
| Contenido hostil | `injection`, `exfiltration`, `deceptive`, `phishing`, `unicode`, `html`, `html-page` | Que el texto del otro bot llegue al modelo, al usuario como si fuera nuestro, o se ejecute en el navegador |
| Contrato roto | `wrong-content-type`, `broken-json`, `not-json`, `empty`, `no-content`, `array`, `wrong-type`, `error-500`, `error-401` | Que el cliente falle mal, filtre detalles o confíe en una forma inesperada |
| Tamaño | `huge` (2 MB), `endless` (sin fin), `gzip-bomb` (64 MB comprimidos en unos 64 KB) | Memoria y disco |
| Tiempo | `slow-start` (12 s), `trickle` (un byte por segundo), `hang` (nunca responde) | Que el turno del chat quede colgado |
| Redirecciones | `redirect-internal`, `redirect-metadata`, `redirect-loop` | SSRF por redirección |

Tarjetas hostiles (`/<modo>/.well-known/agent.json`): `card-other-origin`, `card-injection`, `card-huge`, `card-broken`, `card-slow`, `card-redirect`.

La tarjeta de la **raíz** (`/.well-known/agent.json`, la que lee «Probar conexión» del panel) arranca en `card-ok` y se cambia con `curl -X POST http://127.0.0.1:8101/_card-mode/<modo>` (cualquiera de los modos de tarjeta o `card-ok`).

## En las pruebas automáticas

`backend/test/fixtures/fake-bots.ts` usa **el mismo código** de `bots.mjs` con puertos efímeros, así que los e2e prueban exactamente los comportamientos de la demo.
