import { useMutation, useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { errorMessage } from '@/api/client'
import type { Customer, PaymentMethod, Sale, VehicleWithBrand } from '@/api/types'
import { Button } from '@/components/ui/button'
import { formatCOP } from '@/lib/utils'
import { createSale, openAppointmentsQuery } from './api'
import { PAYMENT_LABELS } from './payment'

/** Lo que el vendedor armó en el formulario y va a confirmar. */
export interface SaleDraft {
  vehicle: VehicleWithBrand
  customer: Customer
  /** Precio final en pesos, solo dígitos. */
  price: string
  payment: PaymentMethod
}

type Phase =
  | { name: 'ask' }
  | { name: 'sending' }
  | { name: 'failed'; message: string }
  | { name: 'sold' }
  | { name: 'vehicleGone' }
  | { name: 'customerGone' }

export const vehicleName = (vehicle: VehicleWithBrand): string => `${vehicle.brand.name} ${vehicle.model} ${vehicle.year}`

function appointmentsNote(query: { pending: boolean; failed: boolean; count: number }): string {
  if (query.pending) return 'Revisando las citas del vehículo…'
  if (query.failed) return 'Se cancelarán las citas abiertas de este vehículo.'
  if (query.count === 0) return 'Este vehículo no tiene citas abiertas.'
  if (query.count === 1) return 'Se cancelará la cita abierta de este vehículo.'
  return `Se cancelarán las ${query.count} citas abiertas de este vehículo.`
}

/** Traduce el error del servidor a lo que el vendedor puede hacer. */
function explain(error: unknown): Phase {
  const status = isAxiosError(error) ? error.response?.status : undefined
  const message = isAxiosError<{ message?: string | string[] }>(error) ? String(error.response?.data?.message ?? '') : ''
  if (status === 409) return { name: 'sold' }
  if (status === 404) return /cliente/i.test(message) ? { name: 'customerGone' } : { name: 'vehicleGone' }
  if (status === 401) return { name: 'failed', message: 'Tu sesión terminó antes de registrar la venta. Vuelve a intentarlo.' }
  if (status === 403) return { name: 'failed', message: 'Tu cuenta no tiene permiso para registrar ventas.' }
  return { name: 'failed', message: errorMessage(error) }
}

const GONE_TEXT = {
  sold: 'Ese vehículo ya fue vendido por otra persona. Elige otro vehículo para continuar.',
  vehicleGone: 'Ese vehículo ya no existe en el inventario. Elige otro vehículo para continuar.',
  customerGone: 'Ese cliente ya no existe. Elige otro cliente para continuar.',
} as const

interface BodyProps {
  draft: SaleDraft
  busyRef: MutableRefObject<boolean>
  onClose: () => void
  onDone: (sale: Sale) => void
  onPickAnotherVehicle: () => void
  onPickAnotherCustomer: () => void
}

function Body({ draft, busyRef, onClose, onDone, onPickAnotherVehicle, onPickAnotherCustomer }: BodyProps) {
  const sending = useRef(false)
  const [phase, setPhase] = useState<Phase>({ name: 'ask' })
  const mutation = useMutation({ mutationFn: createSale })
  const open = useQuery(openAppointmentsQuery(draft.vehicle.id))
  const busy = phase.name === 'sending'

  const confirm = (): void => {
    if (sending.current) return
    sending.current = true
    busyRef.current = true
    setPhase({ name: 'sending' })
    mutation.mutate(
      { vehicleId: draft.vehicle.id, customerId: draft.customer.id, finalPrice: draft.price, payment: draft.payment },
      {
        onSuccess: onDone,
        onError: (error) => setPhase(explain(error)),
        onSettled: () => {
          sending.current = false
          busyRef.current = false
        },
      },
    )
  }

  if (phase.name === 'sold' || phase.name === 'vehicleGone' || phase.name === 'customerGone') {
    const customerGone = phase.name === 'customerGone'
    return (
      <div className="p-6">
        <h2 id="sale-dialog-title" className="text-xl font-semibold">
          No se registró la venta
        </h2>
        <p role="alert" className="mt-3 text-sm">
          {GONE_TEXT[phase.name]}
        </p>
        <p className="mt-2 text-xs text-muted">No se cambió nada: lo demás que elegiste se conserva.</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={customerGone ? onPickAnotherCustomer : onPickAnotherVehicle}>
            {customerGone ? 'Elegir otro cliente' : 'Elegir otro vehículo'}
          </Button>
        </div>
      </div>
    )
  }

  const rows: [string, string, string?][] = [
    ['Vehículo', vehicleName(draft.vehicle), draft.vehicle.version],
    ['Precio de lista', formatCOP(draft.vehicle.price)],
    ['Cliente', draft.customer.name, draft.customer.email],
    ['Precio final', formatCOP(draft.price)],
    ['Forma de pago', PAYMENT_LABELS[draft.payment]],
  ]
  return (
    <div className="p-6">
      <h2 id="sale-dialog-title" className="text-xl font-semibold">
        Confirmar la venta
      </h2>
      <p className="mt-2 text-sm text-muted">Revisa el resumen. Al confirmar, la venta queda registrada y no se puede deshacer desde aquí.</p>
      <ul aria-label="Resumen de la venta" className="mt-5 divide-y divide-border rounded-lg border border-border text-sm">
        {rows.map(([label, value, extra]) => (
          <li key={label} className="flex justify-between gap-4 px-4 py-2.5">
            <span className="shrink-0 text-muted">{label}</span>
            <span className="min-w-0 text-right">
              <span className="block break-words font-medium">{value}</span>
              {extra && <span className="block break-all text-xs text-muted">{extra}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm">El vehículo pasará a vendido y dejará de verse en el catálogo.</p>
      <p className="mt-1 text-sm" aria-live="polite">
        {appointmentsNote({ pending: open.isPending, failed: open.isError, count: open.data ?? 0 })}
      </p>
      {phase.name === 'failed' && (
        <p role="alert" className="mt-4 rounded-md border border-accent p-3 text-sm">
          {phase.message}
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button variant="outline" disabled={busy} onClick={onClose} autoFocus>
          Volver
        </Button>
        <Button disabled={busy} onClick={confirm}>
          {busy ? 'Registrando…' : phase.name === 'failed' ? 'Reintentar' : 'Confirmar venta'}
        </Button>
      </div>
    </div>
  )
}

interface ConfirmSaleDialogProps {
  draft: SaleDraft | null
  onClose: () => void
  onDone: (sale: Sale) => void
  onPickAnotherVehicle: () => void
  onPickAnotherCustomer: () => void
}

/**
 * Confirmación previa a registrar la venta, con el resumen completo. Mientras envía se bloquean los botones y Esc,
 * y un doble clic hace una sola petición. Un 409 (ya vendido) se explica y lleva a elegir otro vehículo.
 */
export function ConfirmSaleDialog({ draft, onClose, onDone, onPickAnotherVehicle, onPickAnotherCustomer }: ConfirmSaleDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const busyRef = useRef(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (draft && !dialog.open) dialog.showModal()
    else if (!draft && dialog.open) dialog.close()
  }, [draft])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="sale-dialog-title"
      onCancel={(event) => {
        if (busyRef.current) event.preventDefault()
      }}
      onClose={() => {
        if (draft) onClose()
      }}
      className="m-auto w-[calc(100%-1.5rem)] max-w-lg rounded-xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/70"
    >
      {draft && (
        <Body
          key={`${draft.vehicle.id}-${draft.customer.id}`}
          draft={draft}
          busyRef={busyRef}
          onClose={onClose}
          onDone={onDone}
          onPickAnotherVehicle={onPickAnotherVehicle}
          onPickAnotherCustomer={onPickAnotherCustomer}
        />
      )}
    </dialog>
  )
}
