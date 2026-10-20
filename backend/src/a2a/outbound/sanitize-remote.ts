import { maskContacts, normalizeText } from '../audit/redact.js';
import type { MaskKind } from '../audit/redact.js';
import { OUTBOUND_DEFAULTS } from './outbound.config.js';

/**
 * Saneado de lo que contesta OTRO bot. Es un dato no confiable (decisión 114): se convierte en texto plano corto, sin
 * HTML, markdown, enlaces, correos ni teléfonos, y se muestra en una tarjeta aparte que el modelo NUNCA ve. Este
 * saneado no pretende que el texto sea «seguro de obedecer» (nada que venga de afuera lo es): pretende que no pueda
 * ejecutarse, enlazar ni suplantar formato en la pantalla.
 */

export type RemoteFlag = 'html' | 'markdown' | 'correo' | 'enlace' | 'numero' | 'invisible' | 'recortado' | 'dice-ser-automax';

export interface SanitizedRemote {
  /** Texto plano de hasta 600 caracteres (puede quedar vacío). */
  text: string;
  /** Qué se quitó o tapó (nombres, nunca contenido): para la auditoría y para que la tarjeta avise. */
  flags: RemoteFlag[];
}

/** Lo único que se procesa del texto ajeno: el resto se descarta antes de aplicar cualquier regla. */
const MAX_INPUT_CHARS = 4_000;

/** Se eliminan (no se cambian por un espacio): «<scr\u200Bipt>» tiene que volver a ser «<script>» para que se reconozca. */
const FORMAT_CHARS = /\p{Cf}/gu;
/** Controles y separadores de línea o párrafo: un espacio. */
const CONTROL_CHARS = /[\p{Cc}\p{Zl}\p{Zp}]/gu;
// Como el navegador: una etiqueta empieza con «<» seguido DIRECTAMENTE de una letra, «/», «!» o «?» (con «< b» no hay etiqueta).
const BLOCK_TAGS = /<(script|style|iframe|object|embed|svg|math|template|noscript)\b[\s\S]*?(?:<\/\1\s*>|$)/gi;
const COMMENTS = /<!--[\s\S]*?(?:-->|$)/g;
// El «>» final es opcional: una etiqueta sin cerrar también se va (con sus atributos), hasta el siguiente «<» o «>».
const TAGS = /<\/?[a-z!?][^<>]{0,200}>?/gi;
const ENTITIES = /&(?:#x?[0-9a-f]{1,8}|[a-z][a-z0-9]{1,31});/gi;
// Los paréntesis del destino pueden anidar un nivel: «![x](javascript:alert(1))».
const MD_TARGET = String.raw`\((?:[^()]|\([^()]{0,200}\)){0,500}\)`;
const MD_IMAGE = new RegExp(String.raw`!\[[^\]]{0,200}\]${MD_TARGET}`, 'g');
const MD_LINK = new RegExp(String.raw`\[([^\]]{0,200})\]${MD_TARGET}`, 'g');
const MD_MARKS = /[*~`]+/g;
const MD_LINE_MARKS = /(^|\s)(?:#{1,6}|>+)(?=\s|$)/g;
const MARK_RUNS = /(\p{M}{2})\p{M}+/gu;
const CLAIMS_AUTOMAX = /automax|mensaje oficial|somos el concesionario/i;

/** Texto plano apto para pintarse como texto (nunca como HTML) en la tarjeta de «tercero no verificado». */
export function sanitizeRemoteText(input: unknown, maxChars: number = OUTBOUND_DEFAULTS.maxAnswerChars): SanitizedRemote {
  if (typeof input !== 'string') return { text: '', flags: [] };
  const flags = new Set<RemoteFlag>();
  const raw = input.slice(0, MAX_INPUT_CHARS);
  // 1) Normalizar PRIMERO: «＜script＞» (ancho completo) pasa a «<script>» y así lo ve el quitador de etiquetas.
  const normalized = raw.normalize('NFKC');
  const flat = normalized.replace(FORMAT_CHARS, '').replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().normalize('NFKC');
  if (flat !== normalized.replace(/\s+/g, ' ').trim()) flags.add('invisible');
  // 2) HTML fuera (los bloques como <script> con su contenido), y las entidades también: no se decodifican.
  const noHtml = flat.replace(BLOCK_TAGS, ' ').replace(COMMENTS, ' ').replace(TAGS, ' ').replace(ENTITIES, ' ').replace(/[<>]/g, ' ');
  if (noHtml !== flat) flags.add('html');
  // 3) Markdown fuera: de un enlace queda su texto, de una imagen nada.
  const noMarkdown = noHtml.replace(MD_IMAGE, ' ').replace(MD_LINK, '$1').replace(MD_MARKS, '').replace(MD_LINE_MARKS, '$1').replace(MARK_RUNS, '$1');
  if (noMarkdown !== noHtml) flags.add('markdown');
  // 4) Enlaces, correos y números largos tapados.
  const masked = maskContacts(noMarkdown, (kind: MaskKind) => flags.add(kind));
  const clean = masked.replace(/\s+/g, ' ').trim().normalize('NFKC');
  if (CLAIMS_AUTOMAX.test(clean)) flags.add('dice-ser-automax');
  const chars = Array.from(clean);
  if (chars.length > maxChars) flags.add('recortado');
  const text = chars.length > maxChars ? `${chars.slice(0, maxChars - 1).join('').trimEnd()}…` : clean;
  return { text, flags: [...flags] };
}

export interface PreparedQuestion {
  ok: true;
  /** La pregunta ya redactada (sin correos, enlaces ni números largos): lo ÚNICO que sale hacia el otro bot. */
  text: string;
}

export type QuestionCheck = PreparedQuestion | { ok: false; reason: 'tipo' | 'corta' | 'larga' };

/**
 * Pregunta que se enviará a otro bot (decisión 115): 5 a 300 caracteres, normalizada y SIN datos de contacto. Nunca se
 * envía el historial ni nada del cliente: solo este texto. Una pregunta demasiado larga se rechaza (no se recorta: un
 * recorte a la mitad cambiaría lo que se pregunta).
 */
export function prepareQuestion(input: unknown): QuestionCheck {
  if (typeof input !== 'string') return { ok: false, reason: 'tipo' };
  // Un texto desmesurado ni se procesa (y nunca se recorta en silencio hasta que «quepa»).
  if (input.length > OUTBOUND_DEFAULTS.maxQuestionChars * 10) return { ok: false, reason: 'larga' };
  const text = maskContacts(normalizeText(input)).replace(/\s+/g, ' ').trim();
  const length = Array.from(text).length;
  if (length < OUTBOUND_DEFAULTS.minQuestionChars) return { ok: false, reason: 'corta' };
  if (length > OUTBOUND_DEFAULTS.maxQuestionChars) return { ok: false, reason: 'larga' };
  return { ok: true, text };
}
