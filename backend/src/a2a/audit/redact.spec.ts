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

describe('redactForAudit: dominios sueltos y esquemas sin host', () => {
  it('tapa dominios con TLD frecuente, con o sin ruta, y esquemas sin nada detrás', () => {
    expect(redactForAudit('entra a bit.ly/oferta-carro hoy')).toBe('entra a [enlace] hoy');
    expect(redactForAudit('mira automax-promo.example/pagar ya')).toBe('mira [enlace] ya');
    expect(redactForAudit('en oferta.com y en sub.dominio.co.uk/x')).toBe('en [enlace] y en [enlace]');
    expect(redactForAudit('http:// o www. sueltos')).toBe('[enlace] o [enlace] sueltos');
    expect(redactForAudit('escribe a tienda.automax.com.co/ofertas o a mi.tienda.com.mx')).toBe('escribe a [enlace] o a [enlace]');
  });

  it('no toca texto normal con puntos', () => {
    expect(redactForAudit('Mazda 3 2024 a $ 85.000.000, versión 2.0 S.A.')).toBe('Mazda 3 2024 a $ 85.000.000, versión 2.0 S.A.');
    expect(redactForAudit('Sr. Pérez, ver pág. 3.')).toBe('Sr. Pérez, ver pág. 3.');
  });
});

describe('redactForAudit: formas ofuscadas (revisión con Codex)', () => {
  it('tapa correos escritos con [at]/(arroba) y [dot]/punto', () => {
    expect(redactForAudit('escribe a ana [at] correo [dot] com hoy')).toBe('escribe a [correo] hoy');
    expect(redactForAudit('ana(at)correo.com y luis {arroba} correo [punto] co')).toBe('[correo] y [correo]');
    expect(redactForAudit('mi correo: ana arroba correo punto com')).toBe('mi correo: [correo]');
  });

  it('tapa cifras dichas con palabras (siete o más seguidas) y números con separadores largos', () => {
    expect(redactForAudit('llámame al tres cero cero uno dos tres cuatro cinco seis siete')).toBe('llámame al [número]');
    expect(redactForAudit('mi número es 3 -- 0 .. 0 1 2 3 4 5 6 7')).toBe('mi número es [número]');
  });

  it('no toca palabras sueltas ni cifras escritas en pocas palabras', () => {
    expect(redactForAudit('uno dos tres, tengo tres carros y dos motos')).toBe('uno dos tres, tengo tres carros y dos motos');
    expect(redactForAudit('hay un arroba de arroz y 25 arrobas de café')).toBe('hay un arroba de arroz y 25 arrobas de café');
  });

  it('el precio se respeta aunque antes haya un enlace o un correo que cambió los largos del texto', () => {
    expect(redactForAudit('mira https://x.example/a/b/c/d/e/f y el precio es $ 85.000.000')).toBe('mira [enlace] y el precio es $ 85.000.000');
    expect(redactForAudit('ana@correo.com pregunta por 120.000.000 COP')).toBe('[correo] pregunta por 120.000.000 COP');
  });

  it('las expresiones nuevas no se vuelven lentas con entradas patológicas', () => {
    const nasty = ['a'.repeat(5_000) + ' [at] ', '[at] '.repeat(1_000), 'x arroba '.repeat(1_000), 'uno '.repeat(2_000), '1 '.repeat(3_000), ('a [at] b [dot] ').repeat(500), '(' .repeat(4_000)];
    for (const input of nasty) {
      const started = performance.now();
      redactForAudit(input);
      expect(performance.now() - started, input.slice(0, 20)).toBeLessThan(250);
    }
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
