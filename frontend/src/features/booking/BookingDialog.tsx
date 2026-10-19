import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { createAppointment } from '@/api/queries'
import type { PublicAppointment, VehicleWithBrand } from '@/api/types'
import { Button, buttonVariants } from '@/components/ui/button'
import { VISIT_MINUTES, buildScheduledAt, formatDay, formatLongDate, formatTime, isSlotPast } from '@/lib/bogota'
import { classifyBookingError } from './bookingErrors'
import type { BookingFailure } from './bookingErrors'
import { DayPicker, TimePicker } from './SlotPickers'

const control =
  'h-11 w-full rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted aria-[invalid=true]:border-accent'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^[0-9+()\-\s]{7,30}$/

interface FormValues {
  date: string
  hour: number | null
  name: string
  email: string
  phone: string
}

type FieldErrors = Partial<Record<keyof FormValues, string>>

const EMPTY: FormValues = { date: '', hour: null, name: '', email: '', phone: '' }
const ERROR_ID: Record<keyof FormValues, string> = {
  date: 'error-date',
  hour: 'error-hour',
  name: 'field-name',
  email: 'field-email',
  phone: 'field-phone',
}

export function validate(values: FormValues, now: Date): FieldErrors {
  const errors: FieldErrors = {}
  if (!values.date) errors.date = 'Elige un día.'
  if (values.hour === null) errors.hour = 'Elige una hora.'
  else if (values.date && isSlotPast(values.date, values.hour, now)) errors.hour = 'Esa hora ya pasó. Elige otra.'
  const name = values.name.trim()
  if (name.length < 2) errors.name = 'Escribe tu nombre (mínimo 2 letras).'
  else if (name.length > 120) errors.name = 'El nombre es demasiado largo.'
  const email = values.email.trim()
  if (!EMAIL.test(email) || email.length > 120) errors.email = 'Escribe un correo válido, por ejemplo ana@correo.co.'
  const phone = values.phone.trim()
  if (phone && !PHONE.test(phone)) errors.phone = 'Usa solo números, espacios y + - ( ). Mínimo 7 dígitos.'
  return errors
}

function FieldError({ id, children }: { id: string; children: string | undefined }) {
  if (!children) return null
  return (
    <p id={id} tabIndex={-1} className="mt-1.5 text-sm text-accent">
      {children}
    </p>
  )
}

interface TextFieldProps {
  field: 'name' | 'email' | 'phone'
  label: ReactNode
  value: string
  error: string | undefined
  onChange: (value: string) => void
  type?: 'text' | 'email' | 'tel'
  autoComplete: string
  maxLength: number
}

function TextField({ field, label, value, error, onChange, type = 'text', autoComplete, maxLength }: TextFieldProps) {
  return (
    <div className="text-sm">
      <label htmlFor={`field-${field}`} className="mb-1.5 block">
        {label}
      </label>
      <input
        id={`field-${field}`}
        type={type}
        autoComplete={autoComplete}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `error-${field}` : undefined}
        className={control}
      />
      <FieldError id={`error-${field}`}>{error}</FieldError>
    </div>
  )
}

interface Confirmation {
  appointment: PublicAppointment
  name: string
  email: string
}

function ConfirmationView({
  vehicle,
  confirmation,
  onClose,
}: {
  vehicle: VehicleWithBrand
  confirmation: Confirmation
  onClose: () => void
}) {
  const { appointment, name, email } = confirmation
  const rows: [string, string][] = [
    ['Vehículo', `${vehicle.brand.name} ${vehicle.model} ${vehicle.year}`],
    ['Día', formatLongDate(appointment.scheduledAt)],
    ['Hora', `${formatTime(appointment.scheduledAt)} a ${formatTime(appointment.endsAt)}, hora de Bogotá`],
    ['Duración', `${VISIT_MINUTES} minutos`],
    ['A nombre de', name],
    ['Correo', email],
    ['Estado', 'Pendiente de confirmación'],
  ]
  return (
    <div className="p-6 sm:p-8" role="status">
      <CircleCheck size={40} className="text-accent" aria-hidden="true" />
      <h2 className="mt-4 text-2xl font-semibold">Tu test-drive quedó agendado</h2>
      <p className="mt-2 text-sm text-muted">
        Cita n.º {appointment.id}. Un asesor la confirmará. Si necesitas cambiarla, menciona este número.
      </p>
      <dl className="mt-6 divide-y divide-border rounded-lg border border-border text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 px-4 py-3">
            <dt className="shrink-0 text-muted">{label}</dt>
            <dd className="break-words text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={onClose}>Listo</Button>
        <Link to="/catalogo" className={buttonVariants({ variant: 'outline' })} onClick={onClose}>
          Seguir viendo autos
        </Link>
      </div>
    </div>
  )
}

interface BookingDialogProps {
  vehicle: VehicleWithBrand
  open: boolean
  onClose: () => void
}

/**
 * Formulario de test-drive en un diálogo nativo (foco atrapado y Esc incluidos).
 * Los datos personales viven solo en el estado de React: nunca van a la URL ni a ningún storage.
 */
export function BookingDialog({ vehicle, open, onClose }: BookingDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const alertRef = useRef<HTMLDivElement>(null)
  const sending = useRef(false)
  const queryClient = useQueryClient()

  const [values, setValues] = useState<FormValues>(EMPTY)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [failure, setFailure] = useState<BookingFailure | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [now, setNow] = useState(() => new Date())

  const booking = useMutation({ mutationFn: createAppointment })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setNow(new Date())
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setFailure(null)
  }

  const close = () => {
    if (confirmation) {
      setValues(EMPTY)
      setConfirmation(null)
    }
    setErrors({})
    setFailure(null)
    onClose()
  }

  const focusFirstError = (found: FieldErrors) => {
    const first = (Object.keys(ERROR_ID) as (keyof FormValues)[]).find((key) => found[key])
    if (first) requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>(`#${ERROR_ID[first]}`)?.focus())
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (sending.current) return
    const current = new Date()
    setNow(current)
    const found = validate(values, current)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      focusFirstError(found)
      return
    }

    sending.current = true
    setFailure(null)
    const name = values.name.trim()
    const email = values.email.trim()
    const phone = values.phone.trim()
    booking.mutate(
      {
        vehicleId: vehicle.id,
        scheduledAt: buildScheduledAt(values.date, values.hour as number),
        customer: { name, email, ...(phone ? { phone } : {}) },
      },
      {
        onSuccess: (appointment) => setConfirmation({ appointment, name, email }),
        onError: (error) => {
          const result = classifyBookingError(error)
          setFailure(result)
          // Si se vendió mientras agendaba, la página del vehículo se actualiza sola.
          if (result.kind === 'sold') void queryClient.invalidateQueries({ queryKey: ['vehicles', vehicle.id] })
          requestAnimationFrame(() => alertRef.current?.scrollIntoView({ block: 'nearest' }))
        },
        onSettled: () => {
          sending.current = false
        },
      },
    )
  }

  const title = `${vehicle.brand.name} ${vehicle.model} ${vehicle.year}`

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="booking-title"
      onClose={close}
      onCancel={(event) => {
        // Esc no debe cerrar mientras se envía: se perdería el resultado.
        if (booking.isPending) event.preventDefault()
      }}
      className="m-auto max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/70"
    >
      {confirmation ? (
        <ConfirmationView vehicle={vehicle} confirmation={confirmation} onClose={close} />
      ) : (
        <form onSubmit={submit} noValidate className="p-6 pb-0 sm:p-8 sm:pb-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="booking-title" className="text-2xl font-semibold">
                Agenda tu test-drive
              </h2>
              <p className="mt-1 text-sm text-muted">{title}</p>
            </div>
            <button
              type="button"
              aria-label="Cerrar"
              disabled={booking.isPending}
              onClick={close}
              className="rounded-md p-2 text-muted transition-colors hover:text-foreground disabled:opacity-40"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <p className="mt-4 text-sm text-muted">
            Atendemos de lunes a sábado, de 8:00 a. m. a 6:00 p. m. (hora de Bogotá). Cada visita dura {VISIT_MINUTES}{' '}
            minutos.
          </p>

          <div className="mt-6 space-y-6">
            <div>
              <DayPicker
                value={values.date}
                now={now}
                onChange={(date) => {
                  set('date', date)
                  // Si la hora elegida ya pasó en el nuevo día, se descarta.
                  if (values.hour !== null && isSlotPast(date, values.hour, now)) set('hour', null)
                }}
                invalid={!!errors.date}
                describedBy={errors.date ? 'error-date' : undefined}
              />
              <FieldError id="error-date">{errors.date}</FieldError>
            </div>
            <div>
              <TimePicker
                date={values.date}
                now={now}
                value={values.hour}
                onChange={(hour) => set('hour', hour)}
                invalid={!!errors.hour}
                describedBy={errors.hour ? 'error-hour' : undefined}
              />
              <FieldError id="error-hour">{errors.hour}</FieldError>
            </div>
            {values.date && values.hour !== null && (
              <p className="rounded-md border border-border p-3 text-sm" aria-live="polite">
                Tu visita: <strong>{formatDay(values.date)}</strong> de{' '}
                <strong>{String(values.hour).padStart(2, '0')}:00</strong> a{' '}
                <strong>{String(values.hour + 1).padStart(2, '0')}:00</strong> (hora de Bogotá).
              </p>
            )}

            <fieldset className="space-y-4">
              <legend className="mb-1 text-sm font-medium">Tus datos</legend>
              <TextField
                field="name"
                label="Nombre completo"
                autoComplete="name"
                maxLength={120}
                value={values.name}
                error={errors.name}
                onChange={(value) => set('name', value)}
              />
              <TextField
                field="email"
                label="Correo electrónico"
                type="email"
                autoComplete="email"
                maxLength={120}
                value={values.email}
                error={errors.email}
                onChange={(value) => set('email', value)}
              />
              <TextField
                field="phone"
                label={
                  <>
                    Teléfono <span className="text-muted">(opcional)</span>
                  </>
                }
                type="tel"
                autoComplete="tel"
                maxLength={30}
                value={values.phone}
                error={errors.phone}
                onChange={(value) => set('phone', value)}
              />
              <p className="text-xs text-muted">Usamos tus datos solo para coordinar la visita.</p>
            </fieldset>
          </div>

          <div ref={alertRef} aria-live="assertive">
            {failure && (
              <p role="alert" className="mt-6 rounded-md border border-accent p-3 text-sm">
                {failure.message}
              </p>
            )}
          </div>

          <div className="sticky bottom-0 -mx-6 mt-6 flex flex-wrap justify-end gap-3 border-t border-border bg-surface px-6 py-4 sm:-mx-8 sm:px-8">
            <Button variant="outline" disabled={booking.isPending} onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" disabled={booking.isPending}>
              {booking.isPending ? 'Agendando…' : 'Agendar test-drive'}
            </Button>
          </div>
        </form>
      )}
    </dialog>
  )
}
