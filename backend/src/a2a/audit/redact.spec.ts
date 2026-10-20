import { describe, expect, it } from 'vitest';
import { auditText, redactForAudit } from './redact.js';

describe('redactForAudit', () => {
  it('tapa correos, enlaces y números largos (teléfonos y cédulas) con marcas', () => {
    expect(redactForAudit('Escríbeme a juan.perez@correo.com')).toBe('Escríbeme a [correo]');
    expect(redactForAudit('Mira https://malo.example/phishing?x=1 y www.otro.co/a')).toBe('Mira [enlace] y [enlace]');
    expect(redactForAudit('Mi celular es 300 123 4567')).toBe('Mi celular es [número]');
    expect(redactForAudit('llámame al +57 (300) 123-4567 ya')).toBe('llámame al [número] ya');
    expect(redactForAudit('cédula 1.020.304.050')).toBe('cédula [número]');
    expect(redactForAudit('contacto 6012345')).toBe('contacto [número]');
  });

  it('deja pasar los precios, años y cifras cortas del catálogo', () => {
    expect(redactForAudit('Mazda 3 2024 a $ 85.000.000')).toBe('Mazda 3 2024 a $ 85.000.000');
    expect(redactForAudit('cuesta 120.000.000 COP')).toBe('cuesta 120.000.000 COP');
    expect(redactForAudit('tiene 35000 km y 2 dueños')).toBe('tiene 35000 km y 2 dueños');
  });

  it('quita caracteres de control, invisibles y de dirección de texto, y colapsa espacios', () => {
    expect(redactForAudit('hola‮mundo​  \n\t\u0000fin')).toBe('hola mundo fin');
    expect(redactForAudit(' línea ')).toBe('línea');
  });

  it('normaliza con NFKC (letras de ancho completo y ligaduras)', () => {
    expect(redactForAudit('ＭＡＺＤＡ ﬁn')).toBe('MAZDA fin');
    expect(redactForAudit('ｊｕａｎ＠ｃｏｒｒｅｏ．ｃｏｍ')).toBe('[correo]');
  });

  it('no deja pasar un correo ni un número escondido con caracteres invisibles', () => {
    expect(redactForAudit('3​0​0​1​2​3​4​5​6​7')).not.toMatch(/\d{7}/);
  });
});

describe('auditText', () => {
  it('recorta al máximo y el hash es el del texto redactado COMPLETO', () => {
    const long = `${'a'.repeat(250)} contacto 3001234567`;
    const result = auditText(long, 200);
    expect(result.text).toHaveLength(200);
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(auditText(`${'a'.repeat(250)} contacto 3109999999`, 200).hash).toBe(result.hash); // mismo texto redactado
    expect(auditText(`${'a'.repeat(250)} otra cosa`, 200).hash).not.toBe(result.hash);
  });

  it('no parte un carácter de dos unidades al recortar', () => {
    const result = auditText('🚗'.repeat(10), 3);
    expect(result.text).toBe('🚗🚗🚗');
  });

  it('un texto vacío o solo de controles queda vacío pero con hash', () => {
    const result = auditText('\u0000\u0007', 200);
    expect(result.text).toBe('');
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
