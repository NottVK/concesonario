// Definiciones de las tools (las mismas formas que tendrá el producto) y un ejecutor SIMULADO con datos realistas.
// Nombres en inglés para el código; descripciones en español. Los valores de los enums son los de la API.

const vehicleId = { type: 'integer', minimum: 1, description: 'Id del vehículo que devolvió una búsqueda' }

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_vehicles',
      description: 'Busca vehículos del catálogo por marca, modelo, año, precio, combustible o transmisión. Úsala siempre antes de dar precios o decir qué hay disponible.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Descripción libre de lo que busca el cliente, si no hay filtros claros' },
          brand: { type: 'string', description: 'Marca, p. ej. Mazda' },
          model: { type: 'string', description: 'Modelo, p. ej. CX-5' },
          yearMin: { type: 'integer' },
          yearMax: { type: 'integer' },
          priceMin: { type: 'integer', description: 'Precio mínimo en pesos colombianos' },
          priceMax: { type: 'integer', description: 'Precio máximo en pesos colombianos' },
          fuel: { type: 'string', enum: ['gasolina', 'diesel', 'hibrido', 'electrico'] },
          transmission: { type: 'string', enum: ['manual', 'automatica'] },
          status: { type: 'string', enum: ['nuevo', 'usado'] },
          sort: { type: 'string', enum: ['price_asc', 'price_desc', 'year_desc'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vehicle_detail',
      description: 'Da el detalle de un vehículo (ficha) por su id.',
      parameters: { type: 'object', properties: { vehicleId }, required: ['vehicleId'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_vehicles',
      description: 'Compara de 2 a 3 vehículos por sus ids.',
      parameters: {
        type: 'object',
        properties: { vehicleIds: { type: 'array', items: { type: 'integer', minimum: 1 }, minItems: 2, maxItems: 3 } },
        required: ['vehicleIds'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'simulate_credit',
      description: 'Simula la cuota mensual de un crédito. Usa vehicleId o un monto en pesos. Nunca calcules la cuota tú mismo.',
      parameters: {
        type: 'object',
        properties: {
          vehicleId,
          amount: { type: 'integer', description: 'Valor del vehículo en pesos, si no se da vehicleId' },
          downPayment: { type: 'integer', description: 'Cuota inicial en pesos' },
          months: { type: 'integer', minimum: 12, maximum: 84, description: 'Plazo en meses (12 a 84)' },
        },
        required: ['downPayment', 'months'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description: 'Propone una cita de test-drive (lunes a sábado, de 8 a 17 horas, hora de Bogotá). El cliente la confirma después en pantalla; esta herramienta NO agenda por sí sola.',
      parameters: {
        type: 'object',
        properties: {
          vehicleId,
          date: { type: 'string', description: 'Fecha YYYY-MM-DD' },
          hour: { type: 'integer', minimum: 8, maximum: 17, description: 'Hora de inicio, de 8 a 17' },
        },
        required: ['vehicleId', 'date', 'hour'],
      },
    },
  },
]

const FLEET = [
  { vehicleId: 12, brand: 'Mazda', model: 'CX-5', year: 2023, price: '168000000.00', fuel: 'gasolina', transmission: 'automatica', mileage: 0, condition: 'nuevo', color: 'Rojo' },
  { vehicleId: 18, brand: 'Kia', model: 'Sportage', year: 2022, price: '139900000.00', fuel: 'hibrido', transmission: 'automatica', mileage: 18500, condition: 'usado', color: 'Gris' },
  { vehicleId: 25, brand: 'Toyota', model: 'RAV4', year: 2024, price: '189000000.00', fuel: 'hibrido', transmission: 'automatica', mileage: 0, condition: 'nuevo', color: 'Blanco' },
  { vehicleId: 31, brand: 'Hyundai', model: 'Tucson', year: 2023, price: '154500000.00', fuel: 'gasolina', transmission: 'automatica', mileage: 9000, condition: 'usado', color: 'Negro' },
  { vehicleId: 40, brand: 'Chevrolet', model: 'Captiva', year: 2022, price: '121000000.00', fuel: 'gasolina', transmission: 'automatica', mileage: 24000, condition: 'usado', color: 'Plata' },
]

/** Ejecutor simulado: devuelve datos con la misma forma compacta que tendrá el producto, envueltos como DATOS. */
export function runStubTool(name, args) {
  let data
  if (name === 'search_vehicles') {
    const wanted = (args.brand ?? '').toLowerCase()
    const found = FLEET.filter((v) => !wanted || v.brand.toLowerCase().includes(wanted))
    data = { total: (found.length ? found : FLEET).length, vehicles: (found.length ? found : FLEET).slice(0, 5) }
  } else if (name === 'vehicle_detail') {
    data = { ...(FLEET.find((v) => v.vehicleId === Number(args.vehicleId)) ?? FLEET[0]), description: 'SUV familiar con buen espacio y bajo consumo.' }
  } else if (name === 'compare_vehicles') {
    data = { vehicles: FLEET.slice(0, 2) }
  } else if (name === 'simulate_credit') {
    data = { financed: '80000000.00', months: Number(args.months ?? 60), annualRate: '0.18', monthlyPayment: '2043817.00', totalPayment: '122629020.00', totalInterest: '42629020.00', note: 'Simulación informativa' }
  } else if (name === 'book_appointment') {
    data = { status: 'needs_confirmation', summary: `Test-drive del vehículo ${args.vehicleId} el ${args.date} a las ${args.hour}:00 (hora de Bogotá), 60 minutos` }
  } else {
    data = { error: 'herramienta_desconocida' }
  }
  return `<<DATOS>>${JSON.stringify({ source: 'tool', tool: name, data })}<<FIN_DATOS>>`
}
