import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from './AuthContext'
import { CredentialsForm } from './CredentialsForm'

/**
 * Diálogo de re-login. Se abre encima de la página sin desmontarla, así que lo que la persona estaba escribiendo
 * no se pierde. Lo que falló con 401 se reintenta solo si vuelve a entrar el mismo usuario.
 */
export function ReloginDialog() {
  const auth = useAuth()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const expired = auth.reloginReason === 'expired'
  const open = auth.reloginReason !== null

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // El correo ya viene precargado: el foco va directo a la contraseña.
      dialog.querySelector<HTMLInputElement>('#login-password')?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="relogin-title"
      onCancel={(event) => {
        // Con la sesión vencida hay que responder (volver a entrar o salir); no se cierra con Esc.
        if (expired) event.preventDefault()
        else auth.closeRenew()
      }}
      className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/80"
    >
      {open && (
        <div className="p-6">
          <h2 id="relogin-title" className="text-xl font-semibold">
            {expired ? 'Tu sesión venció' : 'Renueva tu sesión'}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {expired
              ? 'Vuelve a entrar para continuar. Lo que estabas haciendo sigue en pantalla y se retoma al entrar con la misma cuenta.'
              : 'Vuelve a escribir tu contraseña para seguir trabajando sin interrupciones.'}
          </p>
          <div className="mt-5">
            <CredentialsForm
              initialEmail={auth.user?.email ?? ''}
              submitLabel="Volver a entrar"
              onSubmit={(email, password) => auth.signIn(email, password)}
              extraActions={
                expired ? (
                  <Button variant="ghost" onClick={auth.logout}>
                    Salir
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={auth.closeRenew}>
                    Ahora no
                  </Button>
                )
              }
            />
          </div>
        </div>
      )}
    </dialog>
  )
}
