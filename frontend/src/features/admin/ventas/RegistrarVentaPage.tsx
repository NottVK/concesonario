import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Customer, PaymentMethod, Sale, VehicleWithBrand } from '@/api/types'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { GroupedInput } from '@/components/ui/grouped-input'
import { formatShortDate, formatTime } from '@/lib/bogota'
import { formatCOP } from '@/lib/utils'
import { ConfirmSaleDialog, vehicleName } from './ConfirmSaleDialog'
import type { SaleDraft } from './ConfirmSaleDialog'
import { PAYMENT_LABELS, PAYMENT_OPTIONS } from './payment'
import { CustomerPicker, VehiclePicker } from './Pickers'
import { MAX_SALE_PRICE_DIGITS, validateSalePrice } from './price'

const errorText = 'mt-2 text-sm text-accent'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Chosen({ label, children, changeLabel, onChange }: { label: string; children: ReactNode; changeLabel: string; onChange: () => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
      <div className="min-w-0 text-sm">{children}</div>
      <Button size="sm" variant="outline" onClick={onChange}>
        {changeLabel}
      </Button>
    </div>
  )
}

function SaleDone({ sale, onAnother }: { sale: Sale; onAnother: () => void }) {
  const vehicle = sale.vehicle as VehicleWithBrand | undefined
  const rows: [string, string][] = [
    ['Vehículo', vehicle ? vehicleName(vehicle) : `Vehículo ${sale.vehicleId}`],
    ['Cliente', sale.customer?.name ?? `Cliente ${sale.customerId}`],
    ['Precio final', formatCOP(sale.finalPrice)],
    ['Forma de pago', PAYMENT_LABELS[sale.payment]],
    ['Fecha', `${formatShortDate(sale.soldAt)} ${formatTime(sale.soldAt)}`],
  ]
  return (
    <>
      <section role="status" aria-label="Venta registrada" className="rounded-xl border border-border bg-surface p-6">
        <div className="flex items-center gap-3">
          <CheckCircle2 size={28} aria-hidden="true" className="text-accent" />
          <h2 className="text-xl font-semibold">Venta registrada</h2>
        </div>
        <p className="mt-2 text-sm text-muted">El vehículo quedó como vendido y sus citas abiertas se cancelaron.</p>
        <ul className="mt-5 divide-y divide-border rounded-lg border border-border text-sm">
          {rows.map(([label, value]) => (
            <li key={label} className="flex justify-between gap-4 px-4 py-2.5">
              <span className="text-muted">{label}</span>
              <span className="break-words text-right font-medium">{value}</span>
            </li>
          ))}
        </ul>
      </section>
      <Button className="mt-6" onClick={onAnother}>
        Registrar otra venta
      </Button>
    </>
  )
}

/**
 * Registrar una venta (vendedor y admin). Cuatro datos —vehículo disponible, cliente, precio final y forma de pago—,
 * una confirmación previa con resumen y el envío. El vendedor solo registra: aquí nunca se pide el historial de ventas.
 */
export function RegistrarVentaPage() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const [vehicle, setVehicle] = useState<VehicleWithBrand | null>(null)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [price, setPrice] = useState('')
  const [payment, setPayment] = useState<PaymentMethod | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const [draft, setDraft] = useState<SaleDraft | null>(null)
  const [done, setDone] = useState<Sale | null>(null)

  // Solo el personal con sesión pide datos de clientes (el backend lo exige igual).
  const allowed = auth.status === 'authenticated' && (auth.user?.role === 'admin' || auth.user?.role === 'vendedor')

  useEffect(() => {
    document.title = 'Registrar venta | AutoMax'
    return () => {
      document.title = 'AutoMax | Concesionario'
    }
  }, [])

  const priceError = validateSalePrice(price)
  const refreshVehicles = (): Promise<void> => queryClient.invalidateQueries({ queryKey: ['vehicles'] })

  const choose = (picked: VehicleWithBrand): void => {
    setVehicle(picked)
    // Se propone el precio de lista (sin centavos); el vendedor lo ajusta al precio pactado.
    setPrice(picked.price.split('.')[0].replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, MAX_SALE_PRICE_DIGITS))
  }

  const review = (): void => {
    setShowErrors(true)
    if (vehicle && customer && payment && !priceError) setDraft({ vehicle, customer, price, payment })
  }

  const reset = (): void => {
    setVehicle(null)
    setCustomer(null)
    setPrice('')
    setPayment(null)
    setShowErrors(false)
    setDraft(null)
    setDone(null)
    void refreshVehicles()
  }

  const dropVehicle = (): void => {
    setDraft(null)
    setVehicle(null)
    setPrice('')
    void refreshVehicles()
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold">Registrar venta</h1>
        <p className="mt-1 text-muted">Elige el vehículo y el cliente, confirma el precio final y la forma de pago.</p>
      </header>

      {done ? (
        <SaleDone sale={done} onAnother={reset} />
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            review()
          }}
        >
          <Section title="Vehículo">
            {vehicle ? (
              <Chosen label="Vehículo elegido" changeLabel="Cambiar vehículo" onChange={() => setVehicle(null)}>
                <p className="font-medium">{vehicleName(vehicle)}</p>
                <p className="text-muted">{vehicle.version} · Precio de lista {formatCOP(vehicle.price)}</p>
              </Chosen>
            ) : (
              <VehiclePicker onChoose={choose} />
            )}
            {showErrors && !vehicle && <p className={errorText}>Elige el vehículo que se vendió.</p>}
          </Section>

          <Section title="Cliente">
            {customer ? (
              <Chosen label="Cliente elegido" changeLabel="Cambiar cliente" onChange={() => setCustomer(null)}>
                <p className="font-medium">{customer.name}</p>
                <p className="break-all text-muted">{customer.email}</p>
              </Chosen>
            ) : (
              <CustomerPicker enabled={allowed} onChoose={setCustomer} />
            )}
            {showErrors && !customer && <p className={errorText}>Elige el cliente que compra.</p>}
          </Section>

          <Section title="Precio y forma de pago">
            <div className="max-w-xs">
              <label htmlFor="sale-price" className="mb-1 block text-sm text-muted">
                Precio final (COP)
              </label>
              <GroupedInput
                id="sale-price"
                value={price}
                maxLength={MAX_SALE_PRICE_DIGITS}
                onValueChange={setPrice}
                placeholder="Por ejemplo 90.000.000"
                aria-invalid={showErrors && priceError ? 'true' : undefined}
                aria-describedby={showErrors && priceError ? 'sale-price-error' : undefined}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm aria-[invalid=true]:border-accent"
              />
              {showErrors && priceError && (
                <p id="sale-price-error" className={errorText}>
                  {priceError}
                </p>
              )}
              <p className="mt-1 text-xs text-muted">Máximo $ 5.000.000.000.</p>
            </div>

            <fieldset className="mt-5">
              <legend className="mb-2 text-sm text-muted">Forma de pago</legend>
              <div className="flex flex-wrap gap-3">
                {PAYMENT_OPTIONS.map((option) => (
                  <label key={option.value} className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-border px-4 text-sm has-[:checked]:border-accent has-[:focus-visible]:outline has-[:focus-visible]:outline-2">
                    <input
                      type="radio"
                      name="payment"
                      value={option.value}
                      checked={payment === option.value}
                      onChange={() => setPayment(option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              {showErrors && !payment && <p className={errorText}>Elige la forma de pago.</p>}
            </fieldset>
          </Section>

          <Button type="submit" size="lg">
            Revisar venta
          </Button>
        </form>
      )}

      <ConfirmSaleDialog
        draft={draft}
        onClose={() => setDraft(null)}
        onPickAnotherVehicle={dropVehicle}
        onPickAnotherCustomer={() => {
          setDraft(null)
          setCustomer(null)
        }}
        onDone={(sale) => {
          setDraft(null)
          setDone(sale)
          void refreshVehicles()
        }}
      />
    </div>
  )
}
