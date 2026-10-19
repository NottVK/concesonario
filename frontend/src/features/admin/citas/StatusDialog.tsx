import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { formatLongDate, formatTime } from '@/lib/bogota'
import { STATUS_LABELS, citaQuery, updateCitaStatus } from './api'
import type { AppointmentRow, AppointmentStatus } from './api'
import { StatusBadge } from './StatusBadge'

export type TargetStatus = 'confirmada' | 'cancelada'
export interface StatusTarget {
  appointment: AppointmentRow
  to: TargetStatus
}

type Phase =
  | { name: 'ask' }
  | { name: 'sending' }
  | { name: 'conflict'; current: AppointmentStatus | null; message: string }
  | { name: 'failed'; message: string }

const COPY: Record<TargetStatus, { title: string; detail: string; action: string; sending: string }> = {
  confirmada: {
    title: 'Confirmar esta cita',
    detail: 'La visita queda confirmada con el cliente. Si luego hace falta, se puede cancelar.',
    action: 'Confirmar cita',
    sending: 'Confirmando…',
  },
  cancelada: {
    title: 'Cancelar esta cita',
    detail: 'La hora queda libre para otras visitas. Una cita cancelada no se puede reactivar.',
    action: 'Sí, cancelar la cita',
    sending: 'Cancelando…',
  },
}

/** Explica un 409 con el estado en que quedó la cita (que se consulta aparte, porque otra persona la cambió). */
export function conflictMessage(current: AppointmentStatus | null, to: TargetStatus): string {
  if (current === null) return 'La cita cambió de estado mientras la procesábamos. La lista ya se actualizó.'
  if (current === to) return `Esta cita ya estaba ${STATUS_LABELS[to].toLowerCase()}: otra persona se te adelantó.`
  if (current === 'cancelada') return 'Esta cita ya está cancelada y una cita cancelada no se puede reactivar.'
  return `La cita cambió y ahora está ${STATUS_LABELS[current].toLowerCase()}.`
}

interface StatusDialogProps {
  target: StatusTarget | null
  onClose: () => void
  /** Se llamó con éxito: la página cierra el diálogo, avisa y refresca la lista. */
  onDone: (target: StatusTarget) => void
  /** Hubo un 409 o un 404: la lista debe refrescarse porque lo que muestra ya no es cierto. */
  onStale: () => void
}

/**
 * Diálogo previo para confirmar o cancelar una cita. Mientras envía se bloquean los botones (y Esc), un doble clic
 * hace una sola petición, y un 409 muestra el estado ACTUAL de la cita en lugar de un error genérico.
 */
export function StatusDialog({ target, onClose, onDone, onStale }: StatusDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const sending = useRef(false)
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<Phase>({ name: 'ask' })
  const mutation = useMutation({ mutationFn: ({ id, status }: { id: number; status: TargetStatus }) => updateCitaStatus(id, status) })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (target && !dialog.open) {
      setPhase({ name: 'ask' })
      sending.current = false
      dialog.showModal()
    } else if (!target && dialog.open) {
      dialog.close()
    }
  }, [target])

  const send = (): void => {
    if (!target || sending.current) return
    sending.current = true
    setPhase({ name: 'sending' })
    mutation.mutate(
      { id: target.appointment.id, status: target.to },
      {
        onSuccess: () => onDone(target),
        onError: async (error) => {
          if (isAxiosError(error) && error.response?.status === 409) {
            onStale()
            try {
              const current = await queryClient.fetchQuery(citaQuery(target.appointment.id))
              setPhase({ name: 'conflict', current: current.status, message: conflictMessage(current.status, target.to) })
            } catch {
              setPhase({ name: 'conflict', current: null, message: conflictMessage(null, target.to) })
            }
          } else if (isAxiosError(error) && error.response?.status === 404) {
            onStale()
            setPhase({ name: 'conflict', current: null, message: 'Esta cita ya no existe. La lista ya se actualizó.' })
          } else if (isAxiosError(error) && error.response?.status === 401) {
            // La sesión terminó (o entró otra cuenta) y el cambio no se guardó: nunca se reintenta con otra persona.
            setPhase({ name: 'failed', message: 'Tu sesión terminó antes de guardar el cambio. Vuelve a intentarlo.' })
          } else if (isAxiosError(error) && error.response?.status === 403) {
            setPhase({ name: 'failed', message: 'Tu cuenta no tiene permiso para cambiar citas.' })
          } else {
            setPhase({ name: 'failed', message: errorMessage(error) })
          }
        },
        onSettled: () => {
          sending.current = false
        },
      },
    )
  }

  const busy = phase.name === 'sending'
  const copy = target ? COPY[target.to] : COPY.confirmada
  const appointment = target?.appointment
  const rows: [string, string][] = appointment
    ? [
        ['Cliente', appointment.customer.name],
        ['Contacto', [appointment.customer.email, appointment.customer.phone].filter(Boolean).join(' · ')],
        ['Vehículo', `${appointment.vehicle.brand.name} ${appointment.vehicle.model} ${appointment.vehicle.year}`],
        ['Día', formatLongDate(appointment.scheduledAt)],
        ['Hora', `${formatTime(appointment.scheduledAt)} a ${formatTime(new Date(new Date(appointment.scheduledAt).getTime() + appointment.durationMin * 60_000))}`],
      ]
    : []

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="status-dialog-title"
      onCancel={(event) => {
        if (busy) event.preventDefault()
      }}
      onClose={() => {
        if (target) onClose()
      }}
      className="m-auto w-[calc(100%-1.5rem)] max-w-lg rounded-xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/70"
    >
      {appointment && target && (
        <div className="p-6">
          {phase.name === 'conflict' ? (
            <>
              <h2 id="status-dialog-title" className="text-xl font-semibold">
                No se pudo {target.to === 'confirmada' ? 'confirmar' : 'cancelar'} la cita
              </h2>
              <p role="alert" className="mt-3 text-sm">
                {phase.message}
              </p>
              {phase.current && (
                <p className="mt-4 flex items-center gap-2 text-sm">
                  Estado actual: <StatusBadge status={phase.current} />
                </p>
              )}
              <p className="mt-3 text-xs text-muted">La lista de citas ya se actualizó.</p>
              <div className="mt-6 flex justify-end">
                <Button onClick={onClose}>Cerrar</Button>
              </div>
            </>
          ) : (
            <>
              <h2 id="status-dialog-title" className="text-xl font-semibold">
                {copy.title}
              </h2>
              <p className="mt-2 text-sm text-muted">{copy.detail}</p>
              <dl className="mt-5 divide-y divide-border rounded-lg border border-border text-sm">
                {rows.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 px-4 py-2.5">
                    <dt className="shrink-0 text-muted">{label}</dt>
                    <dd className="break-words text-right font-medium">{value}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                  <dt className="text-muted">Estado</dt>
                  <dd className="flex items-center gap-2">
                    <StatusBadge status={appointment.status} />
                    <span aria-hidden="true">→</span>
                    <StatusBadge status={target.to} />
                  </dd>
                </div>
              </dl>
              {phase.name === 'failed' && (
                <p role="alert" className="mt-4 rounded-md border border-accent p-3 text-sm">
                  {phase.message}
                </p>
              )}
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                {/* El foco inicial va a "Volver": confirmar o cancelar exige una acción deliberada. */}
                <Button variant="outline" disabled={busy} onClick={onClose} autoFocus>
                  Volver
                </Button>
                <Button disabled={busy} onClick={send}>
                  {busy ? copy.sending : phase.name === 'failed' ? 'Reintentar' : copy.action}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </dialog>
  )
}
