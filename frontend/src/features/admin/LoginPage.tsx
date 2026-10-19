import { useEffect } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { CredentialsForm } from '@/auth/CredentialsForm'
import { safeAdminPath } from '@/auth/guards'

export function LoginPage() {
  const auth = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const destination = safeAdminPath((location.state as { from?: unknown } | null)?.from)

  useEffect(() => {
    document.title = 'Entrar | AutoMax'
    return () => {
      document.title = 'AutoMax | Concesionario'
    }
  }, [])

  if (auth.status === 'authenticated') return <Navigate to={destination} replace />

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <section className="w-full max-w-sm">
        <Link to="/" className="font-display text-2xl font-semibold tracking-tight">
          Auto<span className="text-accent">Max</span>
        </Link>
        <h1 className="mt-6 text-2xl font-semibold">Entrar al panel</h1>
        <p className="mt-1 text-sm text-muted">Solo para el personal del concesionario.</p>

        {auth.notice && (
          <p role="status" className="mt-5 rounded-md border border-border p-3 text-sm">
            {auth.notice}
          </p>
        )}

        <div className="mt-6 rounded-xl border border-border bg-surface p-5">
          <CredentialsForm
            submitLabel="Entrar"
            onSubmit={async (email, password) => {
              await auth.signIn(email, password)
              navigate(destination, { replace: true })
            }}
          />
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          <Link to="/" className="hover:text-foreground">
            Volver al sitio
          </Link>
        </p>
      </section>
    </div>
  )
}
