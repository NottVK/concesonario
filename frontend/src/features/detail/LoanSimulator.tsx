import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useId, useState } from 'react'
import { errorMessage } from '@/api/client'
import { simulateFinancing } from '@/api/queries'
import { Button } from '@/components/ui/button'
import { GroupedInput } from '@/components/ui/grouped-input'
import { formatCOP } from '@/lib/utils'

const MONTH_OPTIONS = [12, 24, 36, 48, 60, 72, 84]
const DEFAULT_MONTHS = 60
const DEFAULT_DOWN_PAYMENT_SHARE = 0.3

const control = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm'

/** Mensaje para el usuario; el 429 se explica sin tecnicismos. */
export function simulatorErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    if (error.response?.status === 429) {
      return 'Hiciste varias simulaciones seguidas. Espera un minuto y vuelve a calcular.'
    }
    if (error.response?.status === 400) {
      return 'No pudimos calcular con esos datos. Revisa la cuota inicial y el plazo.'
    }
  }
  return errorMessage(error)
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}

/**
 * Simulador de crédito. Consulta solo al pulsar "Calcular cuota" (no con cada tecla) y
 * ignora clics repetidos mientras hay una petición en curso.
 */
export function LoanSimulator({ price }: { price: string }) {
  const priceWhole = Math.floor(Number(price))
  const [downPayment, setDownPayment] = useState(String(Math.floor(priceWhole * DEFAULT_DOWN_PAYMENT_SHARE)))
  const [months, setMonths] = useState(DEFAULT_MONTHS)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const errorId = useId()

  const simulation = useMutation({ mutationFn: simulateFinancing })

  // Al cambiar un dato, el resultado anterior deja de corresponder.
  const edit = (apply: () => void) => {
    apply()
    setFieldError(null)
    if (!simulation.isIdle) simulation.reset()
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (simulation.isPending) return
    const down = downPayment === '' ? 0 : Number(downPayment)
    if (down >= priceWhole) {
      setFieldError('La cuota inicial debe ser menor que el valor del vehículo.')
      return
    }
    simulation.mutate({ amount: price, downPayment: String(down), months })
  }

  const result = simulation.data

  return (
    <section aria-labelledby="simulador" className="rounded-xl border border-border bg-surface p-5">
      <h2 id="simulador" className="text-lg font-semibold">
        Simula tu crédito
      </h2>
      <form onSubmit={submit} noValidate className="mt-4 space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-medium">Cuota inicial (COP)</span>
          <GroupedInput
            value={downPayment}
            onValueChange={(value) => edit(() => setDownPayment(value))}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? errorId : undefined}
            placeholder="0"
            className={control}
          />
          {fieldError && (
            <span id={errorId} role="alert" className="block text-sm text-accent">
              {fieldError}
            </span>
          )}
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium">Plazo</span>
          <select
            value={months}
            onChange={(event) => edit(() => setMonths(Number(event.target.value)))}
            className={control}
          >
            {MONTH_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} meses
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" className="w-full" disabled={simulation.isPending}>
          {simulation.isPending ? 'Calculando…' : 'Calcular cuota'}
        </Button>
      </form>

      <div aria-live="polite" className="mt-4">
        {simulation.isError && (
          <p role="alert" className="rounded-md border border-border p-3 text-sm">
            {simulatorErrorMessage(simulation.error)}
          </p>
        )}
        {result && (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm text-muted">Tu cuota mensual sería</p>
            <p className="font-display text-3xl font-semibold text-accent">{formatCOP(result.monthlyPayment)}</p>
            <dl className="space-y-2">
              <Row label="Valor a financiar" value={formatCOP(result.financed)} />
              <Row label="Total a pagar" value={formatCOP(result.totalPayment)} />
              <Row label="Intereses" value={formatCOP(result.totalInterest)} />
              <Row
                label="Tasa efectiva anual"
                value={`${(result.annualRate * 100).toLocaleString('es-CO', { maximumFractionDigits: 2 })} %`}
              />
            </dl>
          </div>
        )}
      </div>
      <p className="mt-4 text-xs text-muted">
        Simulación informativa. La tasa final y la aprobación dependen del estudio de crédito.
      </p>
    </section>
  )
}
