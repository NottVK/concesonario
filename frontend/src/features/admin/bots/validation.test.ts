import type { Bot } from './api'
import { buildCreateBody, buildUpdateBody, EMPTY_FORM, originOf, toForm, validateBotForm, willDropKey } from './validation'

const bot = (over: Partial<Bot> = {}): Bot => ({
  id: 1,
  name: 'SegurosYa',
  url: 'https://seguros.example.com/a2a',
  active: true,
  keyPrefix: '1a2b3c4d',
  hasKey: true,
  hasOutboundKey: true,
  lastUsedAt: null,
  keyRotatedAt: null,
  limitPerMinute: 30,
  limitPerDay: 2000,
  outboundAuth: 'bearer',
  outboundLimitPerMinute: 10,
  createdAt: '2026-10-01T00:00:00.000Z',
  ...over,
})

const filled = { ...EMPTY_FORM, name: 'Bot Amigo', url: 'https://bot.example.com/a2a' }

describe('validateBotForm', () => {
  it('un formulario correcto no tiene errores', () => {
    expect(validateBotForm(filled, null)).toEqual({})
    expect(validateBotForm({ ...filled, url: '', outboundApiKey: '' }, null)).toEqual({}) // la URL es opcional
  })

  it('el nombre: de 2 a 80 caracteres simples', () => {
    for (const name of ['', ' ', 'A', '-bot', 'x'.repeat(81), 'Bot<script>', 'Bot/otro']) expect(validateBotForm({ ...filled, name }, null).name, name).toBeDefined()
    for (const name of ['Bo', 'Bot Amigo 2', 'Concesionario Ñandú', 'a.b_c-d']) expect(validateBotForm({ ...filled, name }, null).name, name).toBeUndefined()
  })

  it('la URL tiene que ser completa; la política de seguridad la aplica el servidor', () => {
    for (const url of ['bot.example.com', 'ftp://x.com', 'https://', 'https://a b.com', `https://${'a'.repeat(300)}.com`]) expect(validateBotForm({ ...filled, url }, null).url, url).toBeDefined()
    for (const url of ['https://bot.example.com/a2a', 'HTTP://127.0.0.1:8100/a2a']) expect(validateBotForm({ ...filled, url }, null).url, url).toBeUndefined()
  })

  it('la key saliente: de 8 a 200 caracteres sin espacios, y exige la dirección del bot', () => {
    for (const outboundApiKey of ['corta', 'con espacio en medio', 'x'.repeat(201), 'ñandú-ñandú']) {
      expect(validateBotForm({ ...filled, outboundApiKey }, null).outboundApiKey, outboundApiKey).toBeDefined()
    }
    expect(validateBotForm({ ...filled, outboundApiKey: 'clave-buena-123' }, null).outboundApiKey).toBeUndefined()
    expect(validateBotForm({ ...filled, url: '', outboundApiKey: 'clave-buena-123' }, null).url).toMatch(/atada a la dirección/)
  })

  it('los límites son enteros dentro de su rango', () => {
    const bad = (key: 'outboundLimitPerMinute' | 'limitPerMinute' | 'limitPerDay', values: string[]) => {
      for (const value of values) expect(validateBotForm({ ...filled, [key]: value }, null)[key], `${key}=${value}`).toBeDefined()
    }
    bad('outboundLimitPerMinute', ['0', '61', '1.5', '', 'diez', '-1'])
    bad('limitPerMinute', ['0', '601', '1e2'])
    bad('limitPerDay', ['0', '100001', '2.000'])
    expect(validateBotForm({ ...filled, outboundLimitPerMinute: '60', limitPerMinute: '600', limitPerDay: '100000' }, null)).toEqual({})
  })

  it('al editar, no se puede dejar una key guardada sin dirección salvo que se quite la key', () => {
    const existing = bot()
    expect(validateBotForm({ ...toForm(existing), url: '' }, existing).url).toMatch(/Sin dirección/)
    expect(validateBotForm({ ...toForm(existing), url: '', removeKey: true }, existing)).toEqual({})
    expect(validateBotForm({ ...toForm(bot({ hasOutboundKey: false })), url: '' }, bot({ hasOutboundKey: false }))).toEqual({})
  })
})

describe('originOf y willDropKey', () => {
  it('compara esquema, host y puerto; la ruta no cuenta', () => {
    expect(originOf('https://BOT.example.com/a2a/')).toBe('https://bot.example.com')
    expect(originOf('https://bot.example.com:8443/x')).toBe('https://bot.example.com:8443')
    expect(originOf('esto no es una url')).toBeNull()
  })

  it('avisa cuando cambiar la URL borrará la key saliente', () => {
    const existing = bot()
    const edit = (patch: Partial<ReturnType<typeof toForm>>) => willDropKey({ ...toForm(existing), ...patch }, existing)
    expect(edit({})).toBe(false)
    expect(edit({ url: 'https://seguros.example.com/otra/ruta' })).toBe(false)
    expect(edit({ url: 'https://otro.example.com/a2a' })).toBe(true)
    expect(edit({ url: 'http://seguros.example.com/a2a' })).toBe(true)
    expect(edit({ url: 'https://seguros.example.com:8443/a2a' })).toBe(true)
    expect(edit({ url: 'https://otro.example.com/a2a', outboundApiKey: 'clave-nueva-123' })).toBe(false) // con key nueva no se pierde
    expect(edit({ url: 'https://otro.example.com/a2a', removeKey: true })).toBe(false)
    expect(willDropKey({ ...toForm(bot({ hasOutboundKey: false })), url: 'https://otro.example.com/a2a' }, bot({ hasOutboundKey: false }))).toBe(false)
  })
})

describe('cuerpos que se envían', () => {
  it('crear: nombre, dirección y key solo si hay, y los números como números', () => {
    expect(buildCreateBody({ ...filled, name: ' Bot Amigo ', outboundApiKey: 'clave-buena-123', outboundAuth: 'x_api_key', outboundLimitPerMinute: '5' })).toEqual({
      name: 'Bot Amigo',
      url: 'https://bot.example.com/a2a',
      outboundApiKey: 'clave-buena-123',
      outboundAuth: 'x_api_key',
      outboundLimitPerMinute: 5,
      limitPerMinute: 30,
      limitPerDay: 2000,
    })
    const bare = buildCreateBody({ ...EMPTY_FORM, name: 'Solo Nombre' })
    expect(bare).not.toHaveProperty('url')
    expect(bare).not.toHaveProperty('outboundApiKey')
  })

  it('editar: solo lo que cambió', () => {
    const existing = bot()
    expect(buildUpdateBody(existing, toForm(existing))).toEqual({})
    expect(buildUpdateBody(existing, { ...toForm(existing), limitPerDay: '500' })).toEqual({ limitPerDay: 500 })
    expect(buildUpdateBody(existing, { ...toForm(existing), outboundAuth: 'x_api_key', outboundLimitPerMinute: '3' })).toEqual({ outboundAuth: 'x_api_key', outboundLimitPerMinute: 3 })
    expect(buildUpdateBody(existing, { ...toForm(existing), url: ' https://otro.example.com/a2a ' })).toEqual({ url: 'https://otro.example.com/a2a' })
  })

  it('editar: una key nueva se envía; «quitar» manda null; vacío no toca la guardada', () => {
    const existing = bot()
    expect(buildUpdateBody(existing, { ...toForm(existing), outboundApiKey: 'clave-nueva-123' })).toEqual({ outboundApiKey: 'clave-nueva-123' })
    expect(buildUpdateBody(existing, { ...toForm(existing), removeKey: true })).toEqual({ outboundApiKey: null })
    expect(buildUpdateBody(existing, toForm(existing))).not.toHaveProperty('outboundApiKey')
  })

  it('editar: vaciar la dirección manda null', () => {
    const existing = bot({ hasOutboundKey: false })
    expect(buildUpdateBody(existing, { ...toForm(existing), url: '' })).toEqual({ url: null })
  })
})
