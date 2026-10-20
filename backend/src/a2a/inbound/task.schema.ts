import { z } from 'zod';
import { MONEY_REGEX } from '../../common/money.js';
import { MAX_MONTHS, MIN_MONTHS } from '../../financiacion/dto/simulate-financing.dto.js';
import { normalizeText } from '../audit/redact.js';
import { A2A_DEFAULTS, A2A_SKILLS } from '../a2a.config.js';

/**
 * Tarea que manda otro bot. TODO es dato no confiable: objeto estricto (un campo de más es error), tipos exactos,
 * texto normalizado y corto. `from` es solo informativo (la identidad sale de la key) y no se guarda ni se devuelve.
 */
export const taskSchema = z
  .strictObject({
    from: z.string().max(80).optional(),
    message: z
      .string()
      .max(2_000)
      .transform(normalizeText)
      .pipe(z.string().max(A2A_DEFAULTS.maxMessageChars))
      .optional(),
    skill: z.enum(A2A_SKILLS).optional(),
    params: z.record(z.string().max(40), z.unknown()).optional(),
  })
  // Hace falta algo que responder: un mensaje con texto o una habilidad explícita.
  .refine((task) => (task.message !== undefined && task.message.length > 0) || task.skill !== undefined);

export type Task = z.output<typeof taskSchema>;

/** Dinero: texto «85000000» o «85000000.50», o un entero positivo (se pasa a texto). */
const money = z.union([z.string().regex(MONEY_REGEX), z.number().int().min(0).max(9_999_999_999).transform(String)]);

/** Parámetros de la habilidad `financiacion`. La tasa no se acepta: se usa siempre la del concesionario. */
export const financingParamsSchema = z.strictObject({
  amount: money,
  downPayment: money,
  months: z.number().int().min(MIN_MONTHS).max(MAX_MONTHS),
});
