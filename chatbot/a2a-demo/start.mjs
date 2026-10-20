// Arranca los bots de prueba A2A en esta máquina: amigo en el 8100 y malicioso en el 8101, solo en 127.0.0.1.
// Herramienta de desarrollo: se niega a correr con NODE_ENV=production o dentro de Docker.
//   node start.mjs                    → ambos
//   node start.mjs amigo|malicioso    → solo uno
//   A2A_DEMO_FRIEND_KEY=...           → key del bot amigo (por defecto, la de demostración)
//   A2A_DEMO_AUTH=x_api_key           → el amigo pide la cabecera X-API-Key en vez de Authorization: Bearer
import { assertDevelopmentEnvironment, bindLocal, createFriendBot, createMaliciousBot, FRIEND_DEFAULT_KEY, LOOPBACK, MALICIOUS_CARD_MODES, MALICIOUS_TASK_MODES } from './bots.mjs'

const FRIEND_PORT = 8100
const EVIL_PORT = 8101

try {
  assertDevelopmentEnvironment()
} catch (error) {
  console.error(`✖ ${error.message}`)
  process.exit(1)
}

const which = process.argv[2] ?? 'ambos'
if (!['ambos', 'amigo', 'malicioso'].includes(which)) {
  console.error('Uso: node start.mjs [amigo|malicioso]')
  process.exit(1)
}

if (which !== 'malicioso') {
  const authMode = process.env.A2A_DEMO_AUTH === 'x_api_key' ? 'x_api_key' : 'bearer'
  const key = process.env.A2A_DEMO_FRIEND_KEY || FRIEND_DEFAULT_KEY
  const friend = createFriendBot({ key, authMode })
  const port = await bindLocal(friend.server, FRIEND_PORT)
  console.log(`✔ Bot AMIGO (seguros) en http://${LOOPBACK}:${port}`)
  console.log(`  Regístralo en el panel con la URL http://${LOOPBACK}:${port}/a2a  (autenticación: ${authMode}; key: ${key === FRIEND_DEFAULT_KEY ? `${key} (de demostración)` : '(la de A2A_DEMO_FRIEND_KEY)'})`)
  console.log('  Y en la API: A2A_DEV_ALLOWED_TARGETS=' + `${LOOPBACK}:${port}`)
}

if (which !== 'amigo') {
  const evil = createMaliciousBot()
  const port = await bindLocal(evil.server, EVIL_PORT)
  console.log(`✔ Bot MALICIOSO en http://${LOOPBACK}:${port}  (acepta cualquier key; mira http://${LOOPBACK}:${port}/_hits)`)
  console.log(`  Una URL por ataque: http://${LOOPBACK}:${port}/<modo>/a2a   — modos de tarea: ${MALICIOUS_TASK_MODES.join(', ')}`)
  console.log(`  Tarjetas hostiles: http://${LOOPBACK}:${port}/<modo>/.well-known/agent.json — modos: ${MALICIOUS_CARD_MODES.join(', ')}`)
  console.log('  Y en la API: A2A_DEV_ALLOWED_TARGETS=' + `${LOOPBACK}:${port}`)
}
console.log('Ctrl+C para parar.')
