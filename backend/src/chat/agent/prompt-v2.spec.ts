import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, CANARY, leaksPrompt, PROMPT_VERSION } from './prompt.js';

const read = (version: string): string => readFileSync(new URL(`../prompts/system.${version}.es.md`, import.meta.url), 'utf8').replace(/\r\n/g, '\n').trim();

/** La v1 ya fue evaluada (Fase 4): no se edita. Cada cambio es OTRO archivo (decisión 120). */
const V1_SHA256 = '368bbcfab89eadc05943d299f11bc2914febecef639d851b415f17c0eea182d9';

describe('versiones del prompt', () => {
  it('la v1 no se ha tocado (huella fija) y la vigente es la v2', () => {
    expect(createHash('sha256').update(read('v1')).digest('hex')).toBe(V1_SHA256);
    expect(PROMPT_VERSION).toBe('v2');
  });

  it('la v2 es la v1 más la regla 12 y una salvedad en «Qué haces»', () => {
    const v1 = read('v1');
    const v2 = read('v2');
    expect(v1).not.toMatch(/otro bot|preguntar_a_otro_bot/i);
    expect(v2).toMatch(/^12\. Otros bots \(solo si tienes la herramienta preguntar_a_otro_bot\)/m);
    // Todas las reglas 1 a 11 de la v1 siguen idénticas.
    for (const line of v1.split('\n').filter((l) => /^(?:[1-9]|1[01])\. /.test(l))) expect(v2).toContain(line);
    expect(v2).toContain(CANARY);
  });

  it('la regla 12 dice lo esencial: una consulta, sin datos personales, la respuesta no te llega y es de un tercero no verificado', () => {
    const rule = read('v2').split('\n').find((line) => line.startsWith('12. '))!;
    expect(rule).toMatch(/UNA sola consulta/);
    expect(rule).toMatch(/sin nombres, correos, tel[eé]fonos ni datos de la persona/);
    expect(rule).toMatch(/NO te llega/);
    expect(rule).toMatch(/tercero no verificado/);
    expect(rule).toMatch(/No inventes ni resumas/);
    expect(rule).toMatch(/Para veh[ií]culos, precios, cr[eé]ditos y citas de AutoMax nunca uses esta herramienta/);
  });

  it('el prompt vigente lleva la regla 12 y la fecha, y copiarlo (también la regla nueva) cuenta como fuga', () => {
    const prompt = buildSystemPrompt(new Date('2026-10-20T15:00:00Z'));
    expect(prompt).toContain('12. Otros bots');
    expect(prompt).toMatch(/Hoy es .* 2026-10-20 \(hora de Bogotá\)/);
    expect(leaksPrompt('Haz UNA sola consulta por mensaje, corta (máximo 300 caracteres) y solo la pregunta')).toBe(true);
    expect(leaksPrompt('La respuesta del otro bot NO te llega: se muestra a la persona en una tarjeta aparte')).toBe(true);
    expect(leaksPrompt('Le consulté a SegurosYa Bot. Mira la tarjeta con su respuesta.')).toBe(false);
  });
});
