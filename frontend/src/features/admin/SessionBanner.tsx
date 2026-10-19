import { Clock } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'

const clock = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true })

/** Aviso previo al vencimiento de la sesión, con la forma de renovarla sin perder lo que se está haciendo. */
export function SessionBanner() {
  const auth = useAuth()
  if (!auth.warning || auth.reloginReason !== null || !auth.expiresAt) return null
  return (
    <div role="status" className="border-b border-accent bg-surface">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm sm:px-6">
        <p className="flex items-center gap-2">
          <Clock size={16} aria-hidden="true" className="text-accent" />
          Tu sesión vence a las {clock.format(new Date(auth.expiresAt))} Termina lo que estás haciendo o renueva la sesión.
        </p>
        <Button size="sm" onClick={auth.openRenew}>
          Renovar sesión
        </Button>
      </div>
    </div>
  )
}
