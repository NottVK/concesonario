import { priceGap } from './price-gap'

describe('priceGap (en centavos, sin decimales flotantes)', () => {
  it('descuento cuando el final es menor que el de lista', () => {
    expect(priceGap('120000000.00', '115000000.50')).toEqual({ kind: 'discount', amount: '4999999.50' })
  })
  it('por encima cuando el final supera al de lista', () => {
    expect(priceGap('100000000.00', '100000000.07')).toEqual({ kind: 'above', amount: '0.07' })
  })
  it('igual cuando coinciden', () => {
    expect(priceGap('90000000.00', '90000000')).toEqual({ kind: 'same', amount: '0.00' })
  })
  it('no pierde precisión con montos grandes', () => {
    expect(priceGap('9999999999.99', '9999999999.98')).toEqual({ kind: 'discount', amount: '0.01' })
  })
})
