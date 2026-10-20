import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { MutableRefObject, ReactNode } from 'react'
import { errorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { createBot, updateBot } from './api'
import type { Bot, BotWithKey } from './api'
import { AUTH_LABELS } from './labels'
import { buildCreateBody, buildUpdateBody, EMPTY_FORM, LIMITS, toForm, URL_MAX, validateBotForm, willDropKey } from './validation'
import type { BotForm, BotFormErrors, OutboundAuth } from './validation'

const inputClass = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm disabled:opacity-60 aria-[invalid=true]:border-accent'

interface FieldProps {
  id: string
  label: string
  hint?: ReactNode
  error?: string
  children: (props: { id: string; 'aria-invalid'?: 'true'; 'aria-describedby'?: string; className: string }) => ReactNode
}

function Field({ id, label, hint, error, children }: FieldProps) {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-muted">
        {label}
      </label>
      {children({ id, ...(error ? { 'aria-invalid': 'true' as const } : {}), ...(describedBy ? { 'aria-describedby': describedBy } : {}), className: inputClass })}
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-accent">
          {error}
        </p>
      )}
    </div>
  )
}

export type FormTarget = { kind: 'create' } | { kind: 'edit'; bot: Bot }

interface EditorProps {
  target: FormTarget
  busyRef: MutableRefObject<boolean>
  onClose: () => void
  onCreated: (result: BotWithKey) => void
  onSaved: (bot: Bot) => void
}

/** Contenido del diálogo; se monta al abrir y se desmonta al cerrar, así cada vez empieza limpio (y la key escrita no sobrevive). */
function Editor({ target, busyRef, onClose, onCreated, onSaved }: EditorProps) {
  const existing = target.kind === 'edit' ? target.bot : null
  const [form, setForm] = useState<BotForm>(existing ? toForm(existing) : EMPTY_FORM)
  const [showErrors, setShowErrors] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const sending = useRef(false)
  const create = useMutation({ mutationFn: createBot })
  const edit = useMutation({ mutationFn: (input: { id: number; body: ReturnType<typeof buildUpdateBody> }) => updateBot(input.id, input.body) })

  const errors: BotFormErrors = validateBotForm(form, existing)
  const visible = showErrors ? errors : {}
  const changed = existing ? Object.keys(buildUpdateBody(existing, form)).length > 0 : true
  const busy = create.isPending || edit.isPending
  const set = <K extends keyof BotForm>(key: K) => (value: BotForm[K]) => setForm((previous) => ({ ...previous, [key]: value }))

  const submit = (): void => {
    setShowErrors(true)
    setServerError(null)
    if (Object.keys(errors).length > 0 || sending.current || !changed) return
    sending.current = true
    busyRef.current = true
    const done = (): void => {
      sending.current = false
      busyRef.current = false
    }
    if (existing) {
      edit.mutate({ id: existing.id, body: buildUpdateBody(existing, form) }, { onSuccess: onSaved, onError: (error) => setServerError(errorMessage(error)), onSettled: done })
    } else {
      create.mutate(buildCreateBody(form), { onSuccess: onCreated, onError: (error) => setServerError(errorMessage(error)), onSettled: done })
    }
  }

  const dropsKey = existing ? willDropKey(form, existing) : false
  const [outMin, outMax] = LIMITS.outboundPerMinute
  const [inMin, inMax] = LIMITS.perMinute
  const [dayMin, dayMax] = LIMITS.perDay

  return (
    <form
      noValidate
      className="max-h-[85dvh] overflow-y-auto p-6"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <h2 id="bot-dialog-title" className="text-xl font-semibold">
        {existing ? `Editar a ${existing.name}` : 'Registrar un bot'}
      </h2>
      <p className="mt-2 text-sm text-muted">
        {existing
          ? 'Cambia la dirección, la key con la que AutoMax le habla o los límites. Solo se envía lo que cambies.'
          : 'Un bot amigo con el que AutoMax puede intercambiar información pública (catálogo, precios, disponibilidad). Jamás datos de clientes.'}
      </p>

      <div className="mt-5 space-y-4">
        <Field id="bot-name" label="Nombre" error={visible.name} hint={existing ? 'El nombre no se puede cambiar.' : 'Es el que verá el asistente al ofrecer la consulta.'}>
          {(props) => <input {...props} type="text" value={form.name} maxLength={80} disabled={!!existing} autoComplete="off" onChange={(event) => set('name')(event.target.value)} />}
        </Field>
        <Field
          id="bot-url"
          label="Dirección del bot (opcional)"
          error={visible.url}
          hint="La dirección base A2A, por ejemplo https://bot.ejemplo.com/a2a. Debe ser https y un nombre público: se rechazan localhost, redes internas y puertos de AutoMax."
        >
          {(props) => <input {...props} type="url" value={form.url} maxLength={URL_MAX + 20} autoComplete="off" placeholder="https://" onChange={(event) => set('url')(event.target.value)} />}
        </Field>
      </div>

      <fieldset className="mt-6 space-y-4 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium">Cuando AutoMax le pregunta al bot</legend>
        <Field
          id="bot-outbound-key"
          label={existing?.hasOutboundKey ? 'Key nueva (deja vacío para conservar la guardada)' : 'Key que AutoMax le envía (opcional)'}
          error={visible.outboundApiKey}
          hint="Se guarda cifrada, atada a la dirección del bot, y nunca vuelve a mostrarse."
        >
          {(props) => (
            <input
              {...props}
              type="password"
              value={form.outboundApiKey}
              maxLength={220}
              autoComplete="new-password"
              disabled={form.removeKey}
              onChange={(event) => set('outboundApiKey')(event.target.value)}
            />
          )}
        </Field>
        {existing?.hasOutboundKey && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.removeKey} onChange={(event) => setForm((previous) => ({ ...previous, removeKey: event.target.checked, outboundApiKey: '' }))} />
            Quitar la key guardada
          </label>
        )}
        {dropsKey && (
          <p role="status" className="rounded-md border border-accent/60 p-3 text-xs">
            Cambiaste el dominio del bot: la key guardada solo vale para el dominio anterior, así que se borrará. Escribe la key de nuevo si el bot la necesita.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="bot-auth" label="Cómo se envía la key">
            {(props) => (
              <select {...props} value={form.outboundAuth} onChange={(event) => set('outboundAuth')(event.target.value as OutboundAuth)}>
                {(Object.keys(AUTH_LABELS) as OutboundAuth[]).map((value) => (
                  <option key={value} value={value}>
                    {AUTH_LABELS[value]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id="bot-out-limit" label="Consultas por minuto" error={visible.outboundLimitPerMinute} hint={`De ${outMin} a ${outMax}.`}>
            {(props) => <input {...props} type="text" inputMode="numeric" value={form.outboundLimitPerMinute} onChange={(event) => set('outboundLimitPerMinute')(event.target.value)} />}
          </Field>
        </div>
      </fieldset>

      <fieldset className="mt-4 space-y-4 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium">Cuando el bot le pregunta a AutoMax</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="bot-in-minute" label="Consultas por minuto" error={visible.limitPerMinute} hint={`De ${inMin} a ${inMax}.`}>
            {(props) => <input {...props} type="text" inputMode="numeric" value={form.limitPerMinute} onChange={(event) => set('limitPerMinute')(event.target.value)} />}
          </Field>
          <Field id="bot-in-day" label="Consultas por día" error={visible.limitPerDay} hint={`De ${dayMin} a ${dayMax.toLocaleString('es-CO')}.`}>
            {(props) => <input {...props} type="text" inputMode="numeric" value={form.limitPerDay} onChange={(event) => set('limitPerDay')(event.target.value)} />}
          </Field>
        </div>
        {!existing && <p className="text-xs text-muted">Al registrar el bot se genera la key con la que él nos consulta. Se muestra una sola vez.</p>}
      </fieldset>

      {serverError && (
        <p role="alert" className="mt-4 rounded-md border border-accent p-3 text-sm">
          {serverError}
        </p>
      )}
      {existing && !changed && <p className="mt-4 text-xs text-muted">Aún no hay cambios que guardar.</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy || !changed}>
          {busy ? 'Guardando…' : existing ? 'Guardar cambios' : 'Registrar bot'}
        </Button>
      </div>
    </form>
  )
}

interface BotFormDialogProps {
  target: FormTarget | null
  onClose: () => void
  onCreated: (result: BotWithKey) => void
  onSaved: (bot: Bot) => void
}

/** Diálogo para registrar un bot o editar uno. Mientras guarda no se cierra con Esc. */
export function BotFormDialog({ target, onClose, onCreated, onSaved }: BotFormDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const busyRef = useRef(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (target && !dialog.open) dialog.showModal()
    else if (!target && dialog.open) dialog.close()
  }, [target])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="bot-dialog-title"
      onCancel={(event) => {
        if (busyRef.current) event.preventDefault()
      }}
      onClose={() => {
        if (target) onClose()
      }}
      className="m-auto w-[calc(100%-1.5rem)] max-w-xl rounded-xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/70"
    >
      {target && <Editor key={target.kind === 'edit' ? target.bot.id : 'new'} target={target} busyRef={busyRef} onClose={onClose} onCreated={onCreated} onSaved={onSaved} />}
    </dialog>
  )
}
