import { makeToken } from '@/test/auth'
import { decodeJwt, subjectOf } from './jwt'

describe('decodeJwt', () => {
  it('lee id, rol y vencimiento de un token válido', () => {
    const token = makeToken({ sub: 7, role: 'admin', exp: 1_900_000_000 })
    expect(decodeJwt(token)).toEqual({ sub: 7, role: 'admin', exp: 1_900_000_000 })
    expect(subjectOf(token)).toBe(7)
  })

  it('tolera el relleno omitido y los caracteres base64url', () => {
    // Un payload cuyo base64 lleva "-" y "_" tras convertirse.
    const payload = btoa(JSON.stringify({ sub: 1, role: 'vendedor', exp: 2_000_000_000, n: '???>>>' }))
      .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
    expect(decodeJwt(`x.${payload}.y`)?.sub).toBe(1)
  })

  it.each([
    ['null', null], ['undefined', undefined], ['vacío', ''], ['sin puntos', 'abc'], ['dos partes', 'a.b'],
    ['cuatro partes', 'a.b.c.d'], ['payload no base64', 'a.@@@.c'], ['payload no JSON', `a.${btoa('hola')}.c`],
    ['payload array', `a.${btoa('[1,2]')}.c`], ['payload null', `a.${btoa('null')}.c`],
  ])('devuelve null con %s', (_label, token) => {
    expect(decodeJwt(token as string | null | undefined)).toBeNull()
  })

  it.each([
    ['sub texto', { sub: '1', role: 'admin', exp: 1 }],
    ['sub decimal', { sub: 1.5, role: 'admin', exp: 1 }],
    ['sub cero', { sub: 0, role: 'admin', exp: 1 }],
    ['sub negativo', { sub: -1, role: 'admin', exp: 1 }],
    ['rol desconocido', { sub: 1, role: 'root', exp: 1 }],
    ['rol ausente', { sub: 1, exp: 1 }],
    ['exp texto', { sub: 1, role: 'admin', exp: '9' }],
    ['exp infinito', { sub: 1, role: 'admin', exp: null }],
  ])('rechaza un payload con %s', (_label, payload) => {
    expect(decodeJwt(`a.${btoa(JSON.stringify(payload))}.c`)).toBeNull()
  })

  it('no verifica la firma: solo sirve para leer, nunca para decidir permisos', () => {
    const token = makeToken({ sub: 5, role: 'admin' }).replace(/\.[^.]*$/, '.firma-falsa')
    expect(decodeJwt(token)?.role).toBe('admin')
  })
})
