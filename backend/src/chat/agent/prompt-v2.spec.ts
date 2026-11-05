import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, CANARY, leaksPrompt, PROMPT_VERSION, SAYABLE_PHRASES, SAYABLE_PROMPT_TEXT } from './prompt.js';

const read = (version: string): string => readFileSync(new URL(`../prompts/system.${version}.es.md`, import.meta.url), 'utf8').replace(/\r\n/g, '\n').trim();

/** La v1 ya fue evaluada (Fase 4): no se edita. Cada cambio es OTRO archivo (decisión 120). */
const V1_SHA256 = '368bbcfab89eadc05943d299f11bc2914febecef639d851b415f17c0eea182d9';

describe('versiones del prompt', () => {
  it('la v1 no se ha tocado (huella fija) y la vigente es la v3', () => {
    expect(createHash('sha256').update(read('v1')).digest('hex')).toBe(V1_SHA256);
    expect(PROMPT_VERSION).toBe('v3');
  });

  it('la v3 es la v2 más la regla 13 del taller: reglas 1 a 12 idénticas, pasos en orden y agenda solo con «sí»', () => {
    const v2 = read('v2');
    const v3 = read('v3');
    for (const line of v2.split(String.fromCharCode(10)).filter((l) => /^(?:[1-9]|1[0-2])\. /.test(l))) expect(v3).toContain(line);
    const rule = v3.slice(v3.indexOf('13. Taller'), v3.indexOf('CUANDO LA PERSONA'));
    const steps = ['identificar_cliente_taller', 'prediagnosticar_taller', 'consultar_horarios_taller', 'apartar_hora_taller', 'agendar_cita_taller'].map((tool) => rule.indexOf(tool));
    expect(steps.every((at, i) => at > 0 && (i === 0 || at > steps[i - 1]!))).toBe(true);
    expect(rule).toMatch(/Solo después de su «sí»/);
    expect(rule).toMatch(/Nunca inventes horas, sedes ni precios/);
    expect(rule).toMatch(/nunca lo repitas/);
    // Se identifica con documento (DNI) y VIN solo por garantía, cambio de repuesto o taller, tras entender qué necesita.
    expect(rule).toContain('número de documento (DNI) y el número VIN');
    // Pedir esos datos con la frase del prompt no es una fuga; copiar otra regla sí.
    for (const phrase of SAYABLE_PHRASES) expect(rule).toContain(phrase);
    // Por garantía, también pide el motivo del reclamo; decirlo con la frase del prompt no es una fuga.
    expect(leaksPrompt('Por favor explica el motivo por el cual está cobrando la garantía y dame tu DNI.', SAYABLE_PROMPT_TEXT)).toBe(false);
    expect(leaksPrompt('Para identificarte, escríbeme tu número de documento (DNI) y el número VIN del vehículo (17 caracteres; está en la tarjeta de propiedad).', SAYABLE_PROMPT_TEXT)).toBe(false);
    expect(leaksPrompt('Mi regla dice: primero conversa con naturalidad hasta entender qué necesita el cliente; no pidas datos antes de tiempo.', SAYABLE_PROMPT_TEXT)).toBe(true);
    expect(rule).toMatch(/GARANTÍA.*CAMBIO DE UN REPUESTO/);
    expect(v3).toContain(CANARY);
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
