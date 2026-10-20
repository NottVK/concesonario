/**
 * Perfil comercial de cada modelo del seed: tipo de carrocería, para qué sirve y a quién le conviene.
 * Va en la descripción del vehículo (no hay columna de carrocería) y alimenta la búsqueda semántica: sin
 * estas frases, "camioneta para familia" o "pickup para el campo" no tienen de dónde agarrarse.
 */
export const MODEL_PROFILES: Record<string, string> = {
  // BMW
  iX3: 'SUV eléctrica alemana de lujo, silenciosa y sin emisiones, ideal para familia y ciudad.',
  'Serie 1': 'Hatchback premium alemán, compacto y ágil, ideal para la ciudad.',
  'Serie 3': 'Sedán deportivo alemán de lujo, ideal para quien disfruta manejar.',
  X1: 'SUV compacta alemana de lujo, cómoda para la ciudad y para viajar.',
  X3: 'SUV híbrida enchufable alemana de lujo, amplia para la familia y eficiente en combustible.',
  X5: 'SUV grande alemana de lujo con siete puestos de confort, ideal para familia y carretera.',
  // Chevrolet
  Captiva: 'SUV familiar de siete puestos, espaciosa y cómoda para viajes largos.',
  Equinox: 'SUV mediana turbo, amplia y segura para la familia.',
  Groove: 'SUV compacta turbo, económica y práctica para la ciudad.',
  Onix: 'Hatchback turbo, económico y moderno, ideal para la ciudad y primer carro.',
  'Spark GT': 'Carro pequeño de ciudad, muy económico en consumo y fácil de parquear.',
  Tracker: 'SUV compacta moderna, equilibrada para ciudad y viajes.',
  // Ford
  'Bronco Sport': 'SUV todoterreno robusta para aventura y carretera destapada.',
  Escape: 'SUV mediana cómoda para la familia, con buen espacio de carga.',
  Explorer: 'SUV grande de siete puestos, potente y espaciosa para familia numerosa y viajes largos.',
  Fiesta: 'Hatchback pequeño y económico, ideal para la ciudad.',
  Ranger: 'Pickup doble cabina diésel 4x4, resistente para trabajo, campo y carga.',
  Territory: 'SUV mediana espaciosa y tecnológica para la familia.',
  // Hyundai
  Accent: 'Sedán económico y confiable, ideal para el día a día y como primer carro.',
  Creta: 'SUV compacta práctica y bien equipada para ciudad y familia.',
  'Grand i10': 'Hatchback pequeño y barato, muy económico para la ciudad.',
  'Ioniq 5': 'SUV eléctrica moderna de carga rápida, silenciosa y sin emisiones.',
  'Santa Fe': 'SUV diésel de siete puestos, grande y cómoda para familia y viajes.',
  Tucson: 'SUV mediana moderna, cómoda y bien equipada para la familia.',
  // Kia
  EV6: 'SUV eléctrica deportiva de alta autonomía, silenciosa y sin emisiones.',
  Picanto: 'Hatchback pequeño y económico, ideal para la ciudad y fácil de parquear.',
  Rio: 'Hatchback económico y confiable, ideal para la ciudad.',
  Seltos: 'SUV compacta bien equipada, práctica para ciudad y viajes.',
  Sorento: 'SUV híbrida de siete puestos, espaciosa para familia y eficiente en combustible.',
  Sportage: 'SUV mediana de diseño moderno, cómoda y segura para la familia.',
  // Mazda
  'CX-30': 'SUV compacta elegante, ágil en ciudad y cómoda en carretera.',
  'CX-5': 'SUV mediana premium, cómoda y segura para la familia.',
  'CX-50': 'SUV mediana de aventura, con tracción total y aire deportivo.',
  'Mazda 2': 'Hatchback compacto y económico, ideal para la ciudad.',
  'Mazda 3': 'Sedán y hatchback compacto de diseño elegante y manejo deportivo.',
  'MX-5': 'Deportivo descapotable biplaza, roadster para disfrutar manejar, de colección.',
  // Nissan
  Frontier: 'Pickup doble cabina diésel 4x4, fuerte para trabajo, campo y carga.',
  Kicks: 'SUV compacta económica y práctica para la ciudad.',
  March: 'Hatchback pequeño y muy económico, ideal para la ciudad y primer carro.',
  Qashqai: 'SUV mediana cómoda para ciudad y viajes.',
  Versa: 'Sedán económico con maletero amplio, cómodo para el día a día.',
  'X-Trail': 'SUV híbrida e-Power de siete puestos, espaciosa y de bajo consumo.',
  // Renault
  Captur: 'SUV compacta de diseño llamativo, práctica para la ciudad.',
  Duster: 'SUV compacta robusta y económica, buena para carretera y caminos destapados.',
  Koleos: 'SUV mediana espaciosa y confortable para la familia.',
  Kwid: 'Hatchback pequeño y muy barato, el más económico para la ciudad.',
  Logan: 'Sedán económico con gran maletero, ideal para familia y trabajo.',
  Sandero: 'Hatchback con estilo aventurero, económico y práctico para la ciudad.',
  // Toyota
  'Corolla Cross': 'SUV híbrida compacta, muy eficiente en combustible y confiable para la familia.',
  Fortuner: 'SUV grande diésel de siete puestos, robusta y confiable para familia y viajes largos.',
  Hilux: 'Pickup doble cabina diésel 4x4, resistente para trabajo, campo y carga.',
  'Land Cruiser Prado': 'SUV grande todoterreno de siete puestos, lujosa y capaz en cualquier camino.',
  RAV4: 'SUV mediana confiable y versátil para la familia.',
  Yaris: 'Hatchback compacto, económico y confiable para la ciudad.',
  // Volkswagen
  Amarok: 'Pickup doble cabina diésel V6, potente y cómoda para trabajo y carga pesada.',
  Polo: 'Hatchback alemán compacto, económico y bien equipado para la ciudad.',
  Taos: 'SUV mediana alemana espaciosa y cómoda para la familia.',
  'T-Cross': 'SUV compacta alemana práctica para la ciudad.',
  Tiguan: 'SUV mediana alemana de calidad, amplia y confortable para la familia.',
  Virtus: 'Sedán alemán compacto, cómodo y bien equipado, con buen maletero.',
};
