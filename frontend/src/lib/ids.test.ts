import { MAX_DB_INT, parseDbId } from './ids'

describe('parseDbId', () => {
  it('acepta ids decimales hasta el máximo de la API', () => {
    expect(parseDbId('1')).toBe(1)
    expect(parseDbId('2147483647')).toBe(MAX_DB_INT)
  })

  it.each(['0', '-1', '01', '1.5', '1e3', '1e20', '2147483648', '99999999999999999999', 'abc', '', ' 1', '1 ', '１２３', '0x10', 'NaN', 'Infinity', "1'--"])(
    'descarta %j',
    (raw) => {
      expect(parseDbId(raw)).toBeNull()
    },
  )

  it('null y undefined son inválidos', () => {
    expect(parseDbId(null)).toBeNull()
    expect(parseDbId(undefined)).toBeNull()
  })
})
