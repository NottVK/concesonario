import { isVehicleImagePath, parseImageLines } from './images'

describe('isVehicleImagePath (misma regla que el servidor)', () => {
  it.each([
    '/autos/toyota-corolla.webp',
    '/autos/marcas/bmw.svg',
    'https://cdn.example.com/fotos/a.jpg',
    'https://example.com',
  ])('acepta %s', (value) => expect(isVehicleImagePath(value)).toBe(true))

  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:image/png;base64,AAAA',
    'http://example.com/a.jpg',
    '//evil.com/a.jpg',
    '/\\evil.com/a.jpg',
    '/autos//evil.com/a.jpg',
    '/autos/../etc/passwd',
    '/autos/a.webp?x=1',
    '/otra/ruta.webp',
    'file:///etc/passwd',
    'https://',
    'https:///a.jpg',
    'https://user:pass@example.com/a.jpg',
    'https://exa mple.com/a.jpg',
    'https://example.com/a\u0000.jpg',
    '',
    ' ',
    `https://example.com/${'a'.repeat(250)}`,
  ])('rechaza %j', (value) => expect(isVehicleImagePath(value)).toBe(false))
})

describe('parseImageLines', () => {
  it('separa por líneas, recorta y descarta las vacías', () => {
    expect(parseImageLines('  /autos/a.webp \r\n\n https://x.co/b.jpg\n   ')).toEqual(['/autos/a.webp', 'https://x.co/b.jpg'])
    expect(parseImageLines('')).toEqual([])
  })
})
