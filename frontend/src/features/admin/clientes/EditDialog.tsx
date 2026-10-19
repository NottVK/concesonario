import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { errorMessage } from '@/api/client'
import type { Customer } from '@/api/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { clienteQuery, updateCliente } from './api'
import { EMAIL_MAX, NAME_MAX, NO_PHONE, PHONE_MAX, changesBetween, normalizeForm, validateForm } from './validation'
import type { CustomerForm } from './validation'

const EMAIL_TAKEN = 'Ese correo ya está registrado en otro cliente.'

type Phase =
  | { name: 'form' }
  | { name: 'review' }
  | { name: 'sending' }
  | { name: 'stale'; current: Customer | null }
  | { name: 'failed'; message: string }
  | { name: 'gone' }

const toForm = (customer: Customer): CustomerForm => ({ name: customer.name, email: customer.email, phone: customer.phone ?? '' })

const inputClass = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm aria-[invalid=true]:border-accent'

interface FieldProps {
  id: string
  label: string
  value: string
  error?: string
  maxLength: number
  type?: string
  autoComplete?: string
  onChange: (value: string) => void
}

function Field({ id, label, value, error, maxLength, type = 'text', autoComplete, onChange }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-muted">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        maxLength={maxLength}
        autoComplete={autoComplete ?? 'off'}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-accent">
          {error}
        </p>
      )}
    </div>
  )
}

interface EditorProps {
  customer: Customer
  /** Verdadero mientras hay un guardado en curso (el diálogo no se cierra con Esc). */
  busyRef: MutableRefObject<boolean>
  onClose: () => void
  onSaved: (saved: Customer) => void
  /** Lo que muestra la lista ya no es cierto (409 o 404): hay que refrescarla. */
  onStale: () => void
}

/** Contenido del diálogo; se monta al abrir y se desmonta al cerrar, así cada edición empieza limpia. */
function Editor({ customer, busyRef, onClose, onSaved, onStale }: EditorProps) {
  const queryClient = useQueryClient()
  const sending = useRef(false)
  // `base` es la versión del cliente sobre la que se edita; cambia si se cargan los datos actuales tras un 409.
  const [base, setBase] = useState(customer)
  const [form, setForm] = useState<CustomerForm>(toForm(customer))
  const [phase, setPhase] = useState<Phase>({ name: 'form' })
  const [showErrors, setShowErrors] = useState(false)
  const [takenEmail, setTakenEmail] = useState<string | null>(null)
  const mutation = useMutation({ mutationFn: (input: { id: number; body: Parameters<typeof updateCliente>[1] }) => updateCliente(input.id, input.body) })

  const errors = validateForm(form)
  if (takenEmail !== null && normalizeForm(form).email === takenEmail) errors.email = EMAIL_TAKEN
  const visibleErrors = showErrors ? errors : { email: errors.email === EMAIL_TAKEN ? errors.email : undefined }
  const changes = changesBetween(base, form)
  const busy = phase.name === 'sending'

  const update = (key: keyof CustomerForm) => (value: string) => setForm((previous) => ({ ...previous, [key]: value }))

  const review = (): void => {
    setShowErrors(true)
    if (Object.keys(errors).length === 0 && changes.length > 0) setPhase({ name: 'review' })
  }

  const save = (): void => {
    if (sending.current) return
    sending.current = true
    busyRef.current = true
    setPhase({ name: 'sending' })
    const { name, email, phone } = normalizeForm(form)
    mutation.mutate(
      { id: base.id, body: { name, email, ...(phone ? { phone } : {}), version: base.version } },
      {
        onSuccess: (saved) => onSaved(saved),
        onError: (error) => void explain(error, email),
        onSettled: () => {
          sending.current = false
          busyRef.current = false
        },
      },
    )
  }

  /** Un 409 puede ser "otra persona lo editó" o "ese correo ya existe": se distingue mirando la versión actual. */
  const explain = async (error: unknown, email: string): Promise<void> => {
    const status = isAxiosError(error) ? error.response?.status : undefined
    if (status === 409) {
      onStale()
      try {
        const current = await queryClient.fetchQuery(clienteQuery(base.id))
        if (current.version !== base.version) return setPhase({ name: 'stale', current })
        setTakenEmail(email)
        setShowErrors(true)
        setPhase({ name: 'form' })
      } catch {
        setPhase({ name: 'stale', current: null })
      }
    } else if (status === 404) {
      onStale()
      setPhase({ name: 'gone' })
    } else if (status === 401) {
      // La sesión terminó (o entró otra cuenta) y el cambio no se guardó: nunca se reintenta con otra persona.
      setPhase({ name: 'failed', message: 'Tu sesión terminó antes de guardar el cambio. Vuelve a intentarlo.' })
    } else if (status === 403) {
      setPhase({ name: 'failed', message: 'Tu cuenta no tiene permiso para editar clientes.' })
    } else {
      setPhase({ name: 'failed', message: errorMessage(error) })
    }
  }

  const adopt = (current: Customer, keepMine: boolean): void => {
    setBase(current)
    if (!keepMine) setForm(toForm(current))
    setTakenEmail(null)
    setShowErrors(false)
    setPhase(keepMine ? { name: 'review' } : { name: 'form' })
  }

  if (phase.name === 'gone') {
    return (
      <div className="p-6">
        <h2 id="client-dialog-title" className="text-xl font-semibold">
          No se pudo guardar
        </h2>
        <p role="alert" className="mt-3 text-sm">
          Este cliente ya no existe. La lista ya se actualizó.
        </p>
        <div className="mt-6 flex justify-end">
          <Button onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    )
  }

  if (phase.name === 'stale') {
    const current = phase.current
    const mine = normalizeForm(form)
    const rows: [string, string, string][] = current
      ? [
          ['Nombre', current.name, mine.name],
          ['Correo', current.email, mine.email],
          ['Teléfono', current.phone ?? NO_PHONE, mine.phone ?? NO_PHONE],
        ]
      : []
    return (
      <div className="p-6">
        <h2 id="client-dialog-title" className="text-xl font-semibold">
          No se guardaron tus cambios
        </h2>
        <p role="alert" className="mt-3 text-sm">
          Otra persona modificó este cliente mientras lo editabas. No se pisó nada: la lista ya se actualizó.
        </p>
        {current && (
          <table aria-label="Datos actuales frente a tus cambios" className="mt-4 w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th scope="col" className="py-1 pr-3 font-normal">Campo</th>
                <th scope="col" className="py-1 pr-3 font-normal">Datos actuales</th>
                <th scope="col" className="py-1 font-normal">Tus cambios</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border border-t border-border">
              {rows.map(([label, now, yours]) => (
                <tr key={label}>
                  <td className="py-2 pr-3 text-muted">{label}</td>
                  <td className="break-words py-2 pr-3">{now}</td>
                  <td className="break-words py-2">{yours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          {current && (
            <>
              <Button variant="outline" onClick={() => adopt(current, true)}>
                Revisar mis cambios sobre los actuales
              </Button>
              <Button onClick={() => adopt(current, false)}>Cargar los datos actuales</Button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (phase.name === 'review' || phase.name === 'sending' || phase.name === 'failed') {
    return (
      <div className="p-6">
        <h2 id="client-dialog-title" className="text-xl font-semibold">
          Revisar los cambios
        </h2>
        <p className="mt-2 text-sm text-muted">Esto es lo que cambiará. Nada se guarda hasta que lo confirmes.</p>
        {changes.length === 0 ? (
          <p className="mt-4 text-sm">Ya no hay diferencias con los datos actuales.</p>
        ) : (
          <table aria-label="Cambios por guardar" className="mt-4 w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th scope="col" className="py-1 pr-3 font-normal">Campo</th>
                <th scope="col" className="py-1 pr-3 font-normal">Antes</th>
                <th scope="col" className="py-1 font-normal">Después</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border border-t border-border">
              {changes.map((change) => (
                <tr key={change.field}>
                  <td className="py-2 pr-3 text-muted">{change.label}</td>
                  <td className="break-words py-2 pr-3 text-muted line-through">{change.before}</td>
                  <td className="break-words py-2 font-medium">{change.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {phase.name === 'failed' && (
          <p role="alert" className="mt-4 rounded-md border border-accent p-3 text-sm">
            {phase.message}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="outline" disabled={busy} onClick={() => setPhase({ name: 'form' })} autoFocus>
            Volver a editar
          </Button>
          <Button disabled={busy || changes.length === 0} onClick={save}>
            {busy ? 'Guardando…' : phase.name === 'failed' ? 'Reintentar' : 'Guardar cambios'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form
      noValidate
      className="p-6"
      onSubmit={(event) => {
        event.preventDefault()
        review()
      }}
    >
      <h2 id="client-dialog-title" className="text-xl font-semibold">
        Editar cliente
      </h2>
      <p className="mt-2 text-sm text-muted">Cambia los datos de contacto. Antes de guardar verás un resumen de lo que cambia.</p>
      <div className="mt-5 space-y-4">
        <Field id="client-name" label="Nombre" value={form.name} maxLength={NAME_MAX + 20} error={visibleErrors.name} onChange={update('name')} />
        <Field id="client-email" label="Correo" type="email" value={form.email} maxLength={EMAIL_MAX + 20} error={visibleErrors.email} onChange={update('email')} />
        <Field id="client-phone" label="Teléfono (opcional)" type="tel" value={form.phone} maxLength={PHONE_MAX + 10} error={visibleErrors.phone} onChange={update('phone')} />
      </div>
      {changes.length === 0 && <p className="mt-4 text-xs text-muted">Aún no hay cambios que guardar.</p>}
      <div className={cn('flex flex-wrap justify-end gap-3', changes.length === 0 ? 'mt-2' : 'mt-6')}>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={changes.length === 0}>
          Revisar cambios
        </Button>
      </div>
    </form>
  )
}

interface EditDialogProps {
  customer: Customer | null
  onClose: () => void
  onSaved: (saved: Customer) => void
  onStale: () => void
}

/**
 * Diálogo para editar un cliente en tres pasos: formulario con validación, vista de cambios (antes y después)
 * y guardado. Mientras envía se bloquean los botones y Esc; un 409 explica qué pasó en lugar de un error genérico.
 */
export function EditDialog({ customer, onClose, onSaved, onStale }: EditDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const busyRef = useRef(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (customer && !dialog.open) dialog.showModal()
    else if (!customer && dialog.open) dialog.close()
  }, [customer])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="client-dialog-title"
      onCancel={(event) => {
        // Esc no debe interrumpir un guardado en curso.
        if (busyRef.current) event.preventDefault()
      }}
      onClose={() => {
        if (customer) onClose()
      }}
      className="m-auto w-[calc(100%-1.5rem)] max-w-lg rounded-xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/70"
    >
      {customer && <Editor key={customer.id} customer={customer} busyRef={busyRef} onClose={onClose} onSaved={onSaved} onStale={onStale} />}
    </dialog>
  )
}
