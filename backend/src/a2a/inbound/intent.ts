/**
 * Intención de un mensaje en texto libre, SIN modelo de lenguaje (decisión 108): palabras clave, las marcas del
 * catálogo, un año y el estado. Es una función pura: misma entrada, misma salida, y no hace ninguna llamada.
 */

export type Intent =
  | { skill: 'citas' }
  | { skill: 'financiacion' }
  | { skill: 'stock' | 'precios'; marca?: string; tokens: string[]; anio?: number; estado?: 'nuevo' | 'usado' }
  | { skill: 'ninguna' };

const BOOKING = /\b(cita|citas|test ?drive|prueba de manejo|agendar|agenda|agendarme)\b/;
const FINANCING = /\b(financ\w*|credito|cuotas?|prestamo|mensualidad|mensual)\b/;
const PRICE_WORDS = /\b(precio|precios|cuesta|cuanto|vale|valor|costo)\b/;
const VEHICLE_WORDS = /\b(stock|disponible|disponibles|tienen|tiene|hay|inventario|carro|carros|auto|autos|vehiculo|vehiculos)\b/;
const NEW_WORDS = /\b(nuevo|nueva|nuevos|nuevas|0 ?km|cero kilometros)\b/;
const USED_WORDS = /\b(usado|usada|usados|usadas|segunda mano)\b/;
const YEAR = /\b(19[9]\d|20\d{2})\b/;

const STOPWORDS = new Set(
  ('hola buenas buenos dias tardes noches tienen tiene hay disponible disponibles disponibilidad cual cuales cuanto cuesta vale valor costo ' +
    'precio precios de del la el los las un una unos unas que por para favor me mi en y o con sin modelo modelos carro carros auto autos ' +
    'vehiculo vehiculos stock informacion info quiero quisiera saber busco necesito algun alguna ano anos nuevo nueva nuevos nuevas usado ' +
    'usada usados usadas km cero kilometros segunda mano es son ahora hoy tambien gracias consultar consulto consulta se si no').split(' '),
);

/** Minúsculas, sin tildes ni signos: «¿Tienen Mazda 3 2024?» → «tienen mazda 3 2024». */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findBrand(folded: string, brands: string[]): string | undefined {
  const matches = brands.filter((brand) => {
    const name = foldText(brand);
    return name.length > 0 && new RegExp(`(^| )${name.replace(/[^a-z0-9 ]/g, '.')}( |$)`).test(folded);
  });
  // Si el mensaje nombra dos, gana la más larga (el orden de la lista no decide).
  return matches.sort((a, b) => b.length - a.length)[0];
}

/**
 * Palabras que sobran al quitar marca, año, estado y palabras vacías: hasta 4. NO son un modelo: solo sirven para
 * quedarse, entre los vehículos reales del catálogo, con los que las nombran. Nunca se devuelven ni se muestran.
 */
function leftoverWords(folded: string, brand: string | undefined, year: string | undefined): string[] {
  const brandWords = new Set(brand ? foldText(brand).split(' ') : []);
  return folded
    .replace(NEW_WORDS, ' ')
    .replace(USED_WORDS, ' ')
    .split(' ')
    .filter((word) => word !== year && !brandWords.has(word) && !STOPWORDS.has(word) && /^[a-z0-9][a-z0-9-]{0,19}$/.test(word))
    .slice(0, 4);
}

export function detectIntent(message: string, brands: string[]): Intent {
  const folded = foldText(message);
  if (BOOKING.test(folded)) return { skill: 'citas' };
  if (FINANCING.test(folded)) return { skill: 'financiacion' };
  const brand = findBrand(folded, brands);
  const year = YEAR.exec(folded)?.[1];
  const tokens = leftoverWords(folded, brand, year);
  if (!brand && tokens.length === 0) return { skill: 'ninguna' };
  // Sin marca, un mensaje que solo trae palabras sueltas («hola gracias») no es una consulta de vehículos.
  if (!brand && !VEHICLE_WORDS.test(folded) && !PRICE_WORDS.test(folded)) return { skill: 'ninguna' };
  const estado = NEW_WORDS.test(folded) ? 'nuevo' : USED_WORDS.test(folded) ? 'usado' : undefined;
  return {
    skill: PRICE_WORDS.test(folded) ? 'precios' : 'stock',
    ...(brand ? { marca: brand } : {}),
    tokens,
    ...(year ? { anio: Number(year) } : {}),
    ...(estado ? { estado } : {}),
  };
}
