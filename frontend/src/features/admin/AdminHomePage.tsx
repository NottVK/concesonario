import { useAuth } from '@/auth/AuthContext'
import { ROLE_LABELS } from './NoPermission'

/** Inicio provisional del panel: las secciones se habilitan una a una (primero citas). */
export function AdminHomePage() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold">Hola, {user.name}</h1>
      <p className="mt-2 text-muted">Sesión iniciada como {ROLE_LABELS[user.role].toLowerCase()}.</p>
    </section>
  )
}
