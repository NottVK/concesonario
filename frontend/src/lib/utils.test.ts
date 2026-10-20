import { formatCOP, formatCOPExact } from './utils'

describe('formatCOPExact', () => {
  it('sin centavos se ve igual que formatCOP', () => {
    expect(formatCOPExact('95000000.00')).toBe(formatCOP('95000000.00'))
    expect(formatCOPExact('95000000')).toBe(formatCOP('95000000'))
  })

  it('con centavos no redondea: 115000000.50 no se convierte en 115.000.001', () => {
    expect(formatCOP('115000000.50')).toMatch(/115\.000\.001/)
    expect(formatCOPExact('115000000.50')).toMatch(/115\.000\.000,50/)
    expect(formatCOPExact('0.07')).toMatch(/0,07/)
  })

  it('un texto que no es número se devuelve tal cual', () => {
    expect(formatCOPExact('abc')).toBe('abc')
  })
})
