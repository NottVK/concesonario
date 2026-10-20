import type { Vehicle } from '@/api/types'
import { EMPTY_FORM, isDirty, toForm, toPayload, validateVehicleForm, wholePesos } from './validation'
import type { VehicleForm } from './validation'

const valid: VehicleForm = {
  brandId: '1', model: 'Mazda 3', year: '2024', version: 'Touring', price: '95000000', mileage: '0',
  fuel: 'gasolina', transmission: 'automatica', color: 'Rojo', status: 'nuevo', description: '', images: '',
}
const errorsOf = (over: Partial<VehicleForm>) => validateVehicleForm({ ...valid, ...over })

describe('validateVehicleForm', () => {
  it('un formulario completo no tiene errores', () => {
    expect(validateVehicleForm(valid)).toEqual({})
  })

  it('el formulario vacío marca los obligatorios', () => {
    const errors = validateVehicleForm({ ...EMPTY_FORM, mileage: '' })
    expect(Object.keys(errors).sort()).toEqual(['brandId', 'color', 'fuel', 'mileage', 'model', 'price', 'transmission', 'version'])
  })

  it('el año respeta el tope del servidor (1990 a 2100)', () => {
    expect(errorsOf({ year: '1989' }).year).toMatch(/entre 1\.990 y 2\.100/)
    expect(errorsOf({ year: '2101' }).year).toBeDefined()
    expect(errorsOf({ year: '1990' }).year).toBeUndefined()
    expect(errorsOf({ year: '2100' }).year).toBeUndefined()
  })

  it('el kilometraje respeta el tope del servidor (10.000.000)', () => {
    expect(errorsOf({ mileage: '10000000' }).mileage).toBeUndefined()
    expect(errorsOf({ mileage: '10000001' }).mileage).toMatch(/10\.000\.000/)
  })

  it('el precio debe ser mayor que cero y de hasta 10 dígitos', () => {
    expect(errorsOf({ price: '0' }).price).toMatch(/mayor que cero/)
    expect(errorsOf({ price: '' }).price).toBeDefined()
    expect(errorsOf({ price: '9999999999' }).price).toBeUndefined()
    expect(errorsOf({ price: '10000000000' }).price).toMatch(/10 dígitos/)
  })

  it('los textos tienen su largo máximo', () => {
    expect(errorsOf({ model: 'a'.repeat(81) }).model).toMatch(/80/)
    expect(errorsOf({ color: 'a'.repeat(41) }).color).toMatch(/40/)
    expect(errorsOf({ description: 'a'.repeat(2001) }).description).toMatch(/2000/)
    expect(errorsOf({ model: '   ' }).model).toBeDefined()
  })

  it('solo acepta imágenes /autos/... o https://, y dice cuál línea falla', () => {
    expect(errorsOf({ images: '/autos/a.webp\nhttps://cdn.co/b.jpg' }).images).toBeUndefined()
    const bad = errorsOf({ images: '/autos/a.webp\njavascript:alert(1)' }).images
    expect(bad).toMatch(/imagen 2/)
    for (const image of ['data:image/png;base64,AAAA', 'http://x.co/a.jpg', '//evil.com/a.jpg', 'file:///etc/passwd', '/autos/../a.webp']) {
      expect(errorsOf({ images: image }).images, image).toBeDefined()
    }
    expect(errorsOf({ images: Array.from({ length: 11 }, (_, i) => `/autos/a${i}.webp`).join('\n') }).images).toMatch(/Máximo 10/)
  })
})

describe('toPayload', () => {
  const original = {
    id: 1, brandId: 1, model: 'Mazda 3', year: 2024, version: 'Touring', price: '95500000.50', mileage: 0, fuel: 'gasolina',
    transmission: 'automatica', color: 'Rojo', status: 'nuevo', description: null, images: ['/autos/a.webp'], revision: 3,
  } as Vehicle

  it('envía números como números y el precio como texto de dígitos', () => {
    expect(toPayload(valid)).toEqual({
      brandId: 1, model: 'Mazda 3', year: 2024, version: 'Touring', price: '95000000', mileage: 0, fuel: 'gasolina',
      transmission: 'automatica', color: 'Rojo', status: 'nuevo', images: [],
    })
  })

  it('conserva los centavos del precio original si el precio no se tocó, y usa el nuevo si se cambió', () => {
    const form = toForm(original)
    expect(form.price).toBe('95500000')
    expect(toPayload(form, original).price).toBe('95500000.50')
    expect(toPayload({ ...form, price: '96000000' }, original).price).toBe('96000000')
  })

  it('recorta espacios y omite la descripción vacía', () => {
    const payload = toPayload({ ...valid, model: '  Mazda 3 ', description: '   ' })
    expect(payload.model).toBe('Mazda 3')
    expect('description' in payload).toBe(false)
  })
})

describe('ayudantes', () => {
  it('wholePesos quita decimales', () => {
    expect(wholePesos('95000000.00')).toBe('95000000')
    expect(wholePesos('0.50')).toBe('0')
  })
  it('isDirty detecta cambios', () => {
    expect(isDirty(valid, valid)).toBe(false)
    expect(isDirty({ ...valid, color: 'Azul' }, valid)).toBe(true)
  })
})
