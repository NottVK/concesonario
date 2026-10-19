import { describe, expect, it } from 'vitest'
import { MAX_SALE_PRICE_DIGITS, validateSalePrice } from './price'

describe('validateSalePrice (mismo tope que el servidor: $ 5.000.000.000)', () => {
  it('pide el precio si está vacío', () => {
    expect(validateSalePrice('')).toMatch(/Escribe el precio/)
  })

  it.each(['0', '00'])('rechaza %j: debe ser mayor que cero', (value) => {
    expect(validateSalePrice(value)).toMatch(/mayor que cero/)
  })

  it.each(['1', '90000000', '4999999999', '5000000000'])('acepta %j (hasta el tope inclusive)', (value) => {
    expect(validateSalePrice(value)).toBeUndefined()
  })

  it.each(['5000000001', '9999999999'])('rechaza %j: supera el tope y lo dice', (value) => {
    expect(validateSalePrice(value)).toBe('El precio final no puede superar $ 5.000.000.000.')
  })

  it('el campo admite hasta 10 dígitos, que es lo que acepta el servidor', () => {
    expect(MAX_SALE_PRICE_DIGITS).toBe(10)
  })

  it('rechaza texto que no sean solo dígitos (defensa si llegara algo raro)', () => {
    for (const value of ['1e9', '-5', '1.5', 'abc', ' 5']) expect(validateSalePrice(value)).toBeTruthy()
  })
})
