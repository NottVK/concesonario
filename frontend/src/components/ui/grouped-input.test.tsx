import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { GroupedInput, cleanDigits, formatGrouped } from './grouped-input'

function Harness({ grouped }: { grouped?: boolean }) {
  const [value, setValue] = useState('')
  return (
    <>
      <GroupedInput aria-label="monto" value={value} onValueChange={setValue} grouped={grouped} maxLength={10} />
      <output data-testid="limpio">{value}</output>
    </>
  )
}

describe('GroupedInput', () => {
  it('muestra 900.000.000 y guarda 900000000', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByLabelText('monto'), '900000000')
    expect(screen.getByLabelText('monto')).toHaveValue('900.000.000')
    expect(screen.getByTestId('limpio')).toHaveTextContent('900000000')
  })

  it('ignora letras y símbolos, y respeta el máximo de dígitos', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByLabelText('monto'), '12ab,3.4567890123')
    expect(screen.getByTestId('limpio')).toHaveTextContent('1234567890')
  })

  it('sin agrupar (años) no pone separador', async () => {
    render(<Harness grouped={false} />)
    await userEvent.type(screen.getByLabelText('monto'), '2024')
    expect(screen.getByLabelText('monto')).toHaveValue('2024')
  })

  it('funciones puras', () => {
    expect(formatGrouped('')).toBe('')
    expect(formatGrouped('1500000')).toBe('1.500.000')
    expect(cleanDigits('007', 10)).toBe('7')
    expect(cleanDigits('0', 10)).toBe('0')
  })
})
