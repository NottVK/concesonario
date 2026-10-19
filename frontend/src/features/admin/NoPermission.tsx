import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import type { AuthUser } from '@/auth/AuthContext'
import { Button, buttonVariants } from '@/components/ui/button'

export const ROLE_LABELS: Record<AuthUser['role'], string> = {
  admin: 'Administrador',
  vendedor: 'Vendedor',
  cliente: 'Cliente',
}

/** Pantalla para quien está con sesión pero sin permiso para la sección (o sin acceso al panel). */
export function NoPermission({ user }: { user: AuthUser }) {
  const auth = useAuth()
  const noPanel = user.role === 'cliente'
  return (
    <section className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-3xl font-semibold">{noPanel ? 'Esta cuenta no tiene acceso al panel' : 'No tienes permiso para esta sección'}</h1>
      <p className="mt-3 text-muted">
        {noPanel
          ? 'El panel es solo para el personal del concesionario.'
          : `Tu rol (${ROLE_LABELS[user.role].toLowerCase()}) no incluye esta sección. Si la necesitas, pídesela a un administrador.`}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {!noPanel && (
          <Link to="/admin" className={buttonVariants()}>
            Ir al inicio del panel
          </Link>
        )}
        <Link to="/" className={buttonVariants({ variant: 'outline' })}>
          Volver al sitio
        </Link>
        <Button variant="ghost" onClick={auth.logout}>
          Cerrar sesión
        </Button>
      </div>
    </section>
  )
}
