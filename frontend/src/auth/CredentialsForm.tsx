import { isAxiosError } from 'axios'
import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { errorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'

const control =
  'h-11 w-full rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted aria-[invalid=true]:border-accent'

export function loginErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    // Mismo mensaje para correo inexistente y contraseña errónea: no se confirma qué cuentas existen.
    if (error.response?.status === 401) return 'Correo o contraseña incorrectos.'
    if (error.response?.status === 400) return 'Revisa el correo y la contraseña (mínimo 8 caracteres).'
    if (error.response?.status === 429) return 'Demasiados intentos. Espera un minuto antes de volver a probar.'
  }
  return errorMessage(error)
}

interface CredentialsFormProps {
  initialEmail?: string
  submitLabel: string
  onSubmit: (email: string, password: string) => Promise<unknown>
  /** Contenido a la derecha del botón principal (por ejemplo "Salir"). */
  extraActions?: React.ReactNode
}

/**
 * Formulario de correo y contraseña. La contraseña vive solo en el campo del navegador (no controlado): en cuanto
 * se envía se vacía el campo y el valor no se copia a ningún estado de React, prop, caché, storage ni consola.
 * Tras un error el campo queda vacío y hay que volver a escribirla.
 */
export function CredentialsForm({ initialEmail = '', submitLabel, onSubmit, extraActions }: CredentialsFormProps) {
  const [email, setEmail] = useState(initialEmail)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)
  const lock = useRef(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (lock.current) return
    const input = passwordRef.current
    if (!input) return
    const password = input.value
    input.value = '' // sale del DOM de inmediato; solo queda en esta variable local mientras viaja la petición
    if (!email.trim() || password.length === 0) {
      setError('Escribe tu correo y tu contraseña.')
      input.focus()
      return
    }
    lock.current = true
    setSending(true)
    setError(null)
    try {
      await onSubmit(email.trim(), password)
    } catch (failure) {
      setError(loginErrorMessage(failure))
      input.focus()
    } finally {
      lock.current = false
      setSending(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="text-sm">
        <label htmlFor="login-email" className="mb-1.5 block">
          Correo
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="username"
          maxLength={120}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={control}
        />
      </div>
      <div className="text-sm">
        <label htmlFor="login-password" className="mb-1.5 block">
          Contraseña
        </label>
        <input
          id="login-password"
          ref={passwordRef}
          type="password"
          autoComplete="current-password"
          maxLength={72}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'login-error' : undefined}
          className={control}
        />
      </div>
      {error && (
        <p id="login-error" role="alert" className="rounded-md border border-accent p-3 text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={sending} className="min-w-36">
          {sending ? 'Entrando…' : submitLabel}
        </Button>
        {extraActions}
      </div>
    </form>
  )
}
