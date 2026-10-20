import { useMutation } from '@tanstack/react-query'
import { CalendarCheck } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { classifyConfirmError, confirmChatAppointment } from './chatApi'
import type { ConfirmedAppointment, ProposalData } from './chatApi'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^[0-9+()\-\s]{7,30}$/
const control =
  'h-10 w-full rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted aria-[invalid=true]:border-accent'

interface Props {
  proposal: ProposalData
  onConfirmed: (appointment: ConfirmedAppointment) => void
  onCancel: () => void
}

/**
 * La cita NO existe todavía: este formulario es el único camino para crearla. Los datos de contacto van
 * directo al servidor; nunca entran al texto del chat ni al historial del modelo.
 */
export function ProposalCard({ proposal, onConfirmed, onCancel }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [errors, setErrors] = useState<Partial<Record<'name' | 'email' | 'phone', string>>>({})
  const [serverError, setServerError] = useState<string | null>(null)

  const confirm = useMutation({
    mutationFn: () =>
      confirmChatAppointment({
        proposalId: proposal.id,
        customer: { name: name.trim(), email: email.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}) },
      }),
    onSuccess: onConfirmed,
    onError: (error) => setServerError(classifyConfirmError(error)),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (confirm.isPending) return
    const next: typeof errors = {}
    if (name.trim().length < 2) next.name = 'Escribe tu nombre (mínimo 2 letras).'
    else if (name.trim().length > 120) next.name = 'El nombre es demasiado largo.'
    if (!EMAIL.test(email.trim()) || email.trim().length > 120) next.email = 'Escribe un correo válido, por ejemplo ana@correo.co.'
    if (phone.trim() && !PHONE.test(phone.trim())) next.phone = 'Usa solo números, espacios y + - ( ). Mínimo 7 dígitos.'
    setErrors(next)
    setServerError(null)
    if (Object.keys(next).length === 0) confirm.mutate()
  }

  const field = (key: 'name' | 'email' | 'phone', label: string, value: string, set: (v: string) => void, extra: object) => (
    <div className="text-xs">
      <label htmlFor={`chat-${proposal.id}-${key}`} className="mb-1 block">
        {label}
      </label>
      <input
        id={`chat-${proposal.id}-${key}`}
        value={value}
        onChange={(event) => set(event.target.value)}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `chat-${proposal.id}-${key}-error` : undefined}
        className={control}
        {...extra}
      />
      {errors[key] && (
        <p id={`chat-${proposal.id}-${key}-error`} className="mt-1 text-accent">
          {errors[key]}
        </p>
      )}
    </div>
  )

  return (
    <form onSubmit={submit} noValidate aria-label="Confirmar cita" className="mt-2 space-y-3 rounded-lg border border-accent/60 bg-background p-3">
      <div className="flex items-start gap-2">
        <CalendarCheck size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium">{proposal.summary}</p>
          <p className="mt-0.5 text-xs text-muted">Todavía no está agendada: confírmala con tus datos.</p>
        </div>
      </div>
      {field('name', 'Nombre', name, setName, { autoComplete: 'name', maxLength: 120 })}
      {field('email', 'Correo', email, setEmail, { type: 'email', autoComplete: 'email', maxLength: 120 })}
      {field('phone', 'Teléfono (opcional)', phone, setPhone, { type: 'tel', autoComplete: 'tel', maxLength: 30 })}
      {serverError && (
        <p role="alert" className="text-xs text-accent">
          {serverError}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={confirm.isPending}>
          {confirm.isPending ? 'Confirmando…' : 'Confirmar cita'}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={confirm.isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
