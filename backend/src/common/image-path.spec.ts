import { describe, expect, it } from 'vitest';
import { isVehicleImagePath } from './image-path.js';

describe('isVehicleImagePath', () => {
  it.each([
    '/autos/toyota-corolla.webp',
    '/autos/marcas/bmw.svg',
    '/autos/a_b-c.1.webp',
    'https://cdn.example.com/fotos/a.jpg',
    'https://example.com',
    'https://example.com/a.jpg?x=1',
  ])('acepta %s', (value) => expect(isVehicleImagePath(value)).toBe(true));

  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:image/png;base64,AAAA',
    'data:text/html,<script>1</script>',
    'http://example.com/a.jpg',
    '//evil.com/a.jpg',
    '/\\evil.com/a.jpg',
    '/autos//evil.com/a.jpg',
    '/autos/../etc/passwd',
    '/autos/a/../b.webp',
    '/autos/',
    '/autos',
    '/autos/a b.webp',
    '/autos/a.webp?x=1',
    '/otra/ruta.webp',
    'autos/a.webp',
    'file:///etc/passwd',
    'ftp://example.com/a.jpg',
    'https://',
    'https:///a.jpg',
    'https://user:pass@example.com/a.jpg',
    'https://exa mple.com/a.jpg',
    'https://example.com/a\u0000.jpg',
    'https://example.com\\@evil.com/a.jpg',
    ' https://example.com/a.jpg',
    '',
    ' ',
    `https://example.com/${'a'.repeat(250)}`,
  ])('rechaza %j', (value) => expect(isVehicleImagePath(value)).toBe(false));

  it.each([null, undefined, 1, {}, [], true])('rechaza lo que no es texto: %j', (value) =>
    expect(isVehicleImagePath(value)).toBe(false),
  );
});
