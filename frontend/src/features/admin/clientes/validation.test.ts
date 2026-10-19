import { describe, expect, it } from 'vitest'
import { changesBetween, normalizeForm, validateForm } from './validation'

const base = { name: 'Ana Pérez', email: 'ana@correo.co', phone: '300 123 4567' }

describe('validateForm (mismas reglas que el servidor)', () => {
  it('acepta datos correctos, con el teléfono opcional', () => {
    expect(validateForm(base)).toEqual({})
    expect(validateForm({ ...base, phone: '' })).toEqual({})
    expect(validateForm({ ...base, phone: '   ' })).toEqual({})
  })

  it.each(['', ' ', 'A', ' A '])('rechaza el nombre %j (mínimo 2 caracteres)', (name) => {
    expect(validateForm({ ...base, name }).name).toMatch(/al menos 2/)
  })

  it('rechaza un nombre de más de 120 caracteres', () => {
    expect(validateForm({ ...base, name: 'a'.repeat(121) }).name).toMatch(/120/)
    expect(validateForm({ ...base, name: 'a'.repeat(120) }).name).toBeUndefined()
  })

  it.each(['', 'ana', 'ana@', '@correo.co', 'ana@correo', 'ana correo@x.co', 'a@b@c.co', 'ana@.co', 'ana@correo..co', 'ana@correo.c'])(
    'rechaza el correo %j',
    (email) => {
      expect(validateForm({ ...base, email }).email).toBeTruthy()
    },
  )

  it.each(['ana@correo.co', 'ANA@Correo.CO', 'ana.perez+ventas@mail.example.com', '  ana@correo.co  '])('acepta el correo %j', (email) => {
    expect(validateForm({ ...base, email }).email).toBeUndefined()
  })

  it('rechaza un correo de más de 120 caracteres', () => {
    expect(validateForm({ ...base, email: `${'a'.repeat(60)}@${'b'.repeat(60)}.co` }).email).toMatch(/120/)
  })

  it.each(['300abc4567', '+++-----((', '12 34 56', '3'.repeat(31), '300.123.4567', '300#123'])('rechaza el teléfono %j', (phone) => {
    expect(validateForm({ ...base, phone }).phone).toBeTruthy()
  })

  it.each(['3001234567', '300 123 4567', '+57 (300) 123-4567', '601 234 5678'])('acepta el teléfono %j', (phone) => {
    expect(validateForm({ ...base, phone }).phone).toBeUndefined()
  })
})

describe('normalizeForm', () => {
  it('recorta espacios, pasa el correo a minúsculas y deja el teléfono vacío como null', () => {
    expect(normalizeForm({ name: '  Ana  Pérez ', email: ' ANA@Correo.CO ', phone: '  ' })).toEqual({
      name: 'Ana  Pérez',
      email: 'ana@correo.co',
      phone: null,
    })
  })
})

describe('changesBetween (vista de cambios antes de guardar)', () => {
  const saved = { name: 'Ana Pérez', email: 'ana@correo.co', phone: '300 123 4567' as string | null }

  it('sin cambios devuelve una lista vacía, aunque cambien espacios o mayúsculas del correo', () => {
    expect(changesBetween(saved, { name: ' Ana Pérez ', email: 'ANA@correo.co', phone: '300 123 4567' })).toEqual([])
  })

  it('lista solo los campos que cambian, con su valor de antes y de después', () => {
    const changes = changesBetween(saved, { name: 'Ana P. Pérez', email: 'ana@correo.co', phone: '' })
    expect(changes).toEqual([
      { field: 'name', label: 'Nombre', before: 'Ana Pérez', after: 'Ana P. Pérez' },
      { field: 'phone', label: 'Teléfono', before: '300 123 4567', after: 'Sin teléfono' },
    ])
  })

  it('agregar un teléfono a quien no tenía lo muestra como cambio desde "Sin teléfono"', () => {
    expect(changesBetween({ ...saved, phone: null }, { ...saved, phone: '3001234567' })).toEqual([
      { field: 'phone', label: 'Teléfono', before: 'Sin teléfono', after: '3001234567' },
    ])
  })
})
