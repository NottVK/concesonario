/**
 * Validador de montos SOLO PARA PESOS. Extrae únicamente cantidades que se leen como pesos colombianos
 * (con `$`, `COP`, «pesos», «millones», «mil pesos», palabras como «noventa y cinco millones» o con
 * separadores de miles como 95.000.000) y las compara con las que devolvieron las tools.
 * NO toca años, kilometraje, plazos en meses, cifras de stock ni ids.
 */

export interface PesoAmount {
  /** Valor en pesos. */
  value: number;
  /** Unidad de redondeo con la que se escribió (1 = exacto; 1.000.000 para «96 millones»). */
  unit: number;
  /** Texto original, para mensajes de corrección. */
  raw: string;
}

const NUM = String.raw`\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;

const WORD_VALUES: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24,
  veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40,
  cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200,
  trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800,
  novecientos: 900,
};
const WORD = Object.keys(WORD_VALUES).join('|');
const WORDS_BEFORE_MILLIONS = new RegExp(String.raw`(?<![\p{L}])((?:(?:${WORD})\s+(?:y\s+)?)*(?:${WORD}))\s+mill(?:ón|on|ones)(?![\p{L}])`, 'giu');

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function wordsToNumber(words: string): number {
  return stripAccents(words.toLowerCase())
    .split(/\s+/)
    .reduce((sum, token) => sum + (WORD_VALUES[token] ?? 0), 0);
}

/** «95.000.000», «1.973.872,13», «95,5», «2000000» → número. Un solo grupo «45.000» es miles. */
export function parseColombianNumber(text: string): number {
  const clean = text.replace(/\s/g, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(clean)) return Number(clean.replace(/[.,]/g, ''));
  const withDecimals = /^(\d{1,3}(?:[.,]\d{3})+)[.,](\d{1,2})$/.exec(clean);
  if (withDecimals) return Number(`${withDecimals[1]!.replace(/[.,]/g, '')}.${withDecimals[2]}`);
  return Number(clean.replace(',', '.'));
}

interface Range { start: number; end: number }

/** Decimales escritos antes de «millones»: 95 → 1.000.000, 95,5 → 100.000, 95,55 → 10.000. */
function millionsUnit(numberText: string): number {
  const decimals = /[.,](\d+)$/.exec(numberText)?.[1]?.length ?? 0;
  return decimals === 0 ? 1_000_000 : decimals === 1 ? 100_000 : 10_000;
}

export function extractPesoAmounts(text: string): PesoAmount[] {
  const found: PesoAmount[] = [];
  const taken: Range[] = [];
  const free = (start: number, end: number): boolean => !taken.some((r) => start < r.end && end > r.start);
  const add = (start: number, end: number, value: number, unit: number): void => {
    if (!free(start, end) || !Number.isFinite(value)) return;
    taken.push({ start, end });
    found.push({ value, unit, raw: text.slice(start, end).trim() });
  };

  // 1) «95 millones», «95,5 millones», «95M», «un millón».
  for (const m of text.matchAll(new RegExp(String.raw`(?<!\d)(${NUM})\s*(?:millones|mill[oó]n|mill\b|M\b)`, 'gi'))) {
    const n = m[1]!;
    const asDecimal = n.replace(',', '.');
    add(m.index, m.index + m[0].length, Number(asDecimal) * 1_000_000, millionsUnit(n));
  }
  // 2) Millones en palabras.
  for (const m of text.matchAll(WORDS_BEFORE_MILLIONS)) {
    add(m.index, m.index + m[0].length, wordsToNumber(m[1]!) * 1_000_000, 1_000_000);
  }
  // 3) «$ 150 mil» y «150 mil pesos».
  for (const m of text.matchAll(new RegExp(String.raw`(?:\$|COP)\s*(${NUM})\s*mil\b|(?<!\d)(${NUM})\s*mil\s+(?:pesos|COP)\b`, 'gi'))) {
    add(m.index, m.index + m[0].length, parseColombianNumber((m[1] ?? m[2])!) * 1000, 1000);
  }
  // 4) Con símbolo o moneda: «$95.000.000», «COP 95000000».
  for (const m of text.matchAll(new RegExp(String.raw`(?:COL\s?\$|COP|\$)\s*(${NUM})`, 'gi'))) {
    add(m.index, m.index + m[0].length, parseColombianNumber(m[1]!), 1);
  }
  // 5) «95.000.000 pesos».
  for (const m of text.matchAll(new RegExp(String.raw`(?<![\d.,])(${NUM})\s*(?:pesos|COP)\b`, 'gi'))) {
    add(m.index, m.index + m[0].length, parseColombianNumber(m[1]!), 1);
  }
  // 6) Sin símbolo pero con varios grupos de miles («95.000.000»); no es un monto si es kilometraje.
  for (const m of text.matchAll(/(?<![\d.,])\d{1,3}(?:[.,]\d{3}){2,}(?:[.,]\d{1,2})?(?![\d]|[.,]\d)(?!\s*(?:km|kil[oó]metros?))/gi)) {
    add(m.index, m.index + m[0].length, parseColombianNumber(m[0]), 1);
  }
  return found;
}

function matches(amount: PesoAmount, allowed: number): boolean {
  if (Math.abs(amount.value - allowed) <= 1) return true;
  // «96 millones» para 95.900.000: se acepta el redondeo a la unidad con la que se escribió.
  return amount.unit > 1 && Math.abs(Math.round(allowed / amount.unit) * amount.unit - amount.value) <= 1;
}

/** Montos del texto que no corresponden a ninguno de los permitidos (tools de ese turno y lo que escribió el usuario). */
export function findUnbackedAmounts(text: string, allowed: Iterable<number>): PesoAmount[] {
  const list = [...allowed];
  return extractPesoAmounts(text).filter((amount) => !list.some((value) => matches(amount, value)));
}

const STOCK_NOUN = String.raw`(?:unidades|unidad|veh[ií]culos|carros|autos|camionetas|opciones|modelos|disponibles)`;

/** Cantidades de stock afirmadas («tenemos 5 Mazda», «3 unidades»); se validan aparte contra el `total` de la tool. */
export function extractStockClaims(text: string): number[] {
  const pattern = new RegExp(String.raw`(?<![\d.,$])\b(\d{1,4})\s+(?:[A-Za-zÁ-ú0-9-]+\s+){0,2}${STOCK_NOUN}`, 'gi');
  return [...text.matchAll(pattern)].map((m) => Number(m[1]));
}
