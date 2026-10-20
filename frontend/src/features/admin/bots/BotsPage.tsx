import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot as BotIcon, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { errorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { botsQuery, rotateBotKey, updateBot } from './api'
import type { Bot } from './api'
import { BotFormDialog } from './BotFormDialog'
import type { FormTarget } from './BotFormDialog'
import { BotRow } from './BotRow'
import { ExchangesPanel } from './ExchangesPanel'
import { ROW_GRID } from './format'
import { KeyRevealDialog } from './KeyRevealDialog'
import type { Reveal } from './KeyRevealDialog'

type Tab = 'bots' | 'intercambios'
const TABS: { id: Tab; label: string }[] = [
  { id: 'bots', label: 'Bots' },
  { id: 'intercambios', label: 'Intercambios' },
]

function ListSkeleton() {
  return (
    <ul aria-busy="true" aria-label="Cargando bots" className="rounded-xl border border-border bg-surface">
      {Array.from({ length: 3 }, (_, i) => (
        <li key={i} className={cn('grid gap-3 border-b border-border px-4 py-4 last:border-b-0', ROW_GRID)}>
          <Skeleton className="h-14 w-3/4" />
          <Skeleton className="h-14 w-4/5" />
          <Skeleton className="h-14 w-4/5" />
          <Skeleton className="h-8 w-28" />
        </li>
      ))}
    </ul>
  )
}

/**
 * Bots amigos: registrarlos, activarlos o desactivarlos, probar la conexión y ver lo que se intercambia. Las keys en claro solo
 * existen en el diálogo que las muestra (una vez); la lista nunca las trae. Solo admin.
 */
export function BotsPage() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'intercambios' ? 'intercambios' : 'bots'
  const queryClient = useQueryClient()
  const list = useQuery(botsQuery())
  const [form, setForm] = useState<FormTarget | null>(null)
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [confirmRotate, setConfirmRotate] = useState<Bot | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Bots | AutoMax'
    return () => {
      document.title = 'AutoMax | Concesionario'
    }
  }, [])

  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey: ['admin', 'bots'] })

  const toggle = useMutation({
    mutationFn: (bot: Bot) => updateBot(bot.id, { active: !bot.active }),
    onSuccess: (saved) => {
      setFailure(null)
      setDone(saved.active ? `${saved.name} quedó activo.` : `${saved.name} quedó desactivado: sus consultas reciben ahora el mismo rechazo que una key falsa.`)
      void refresh()
    },
    onError: (error) => setFailure(errorMessage(error)),
  })

  const rotate = useMutation({
    mutationFn: (bot: Bot) => rotateBotKey(bot.id),
    onSuccess: (result) => {
      setConfirmRotate(null)
      setFailure(null)
      setReveal({ botName: result.bot.name, apiKey: result.apiKey, reason: 'rotated' })
      void refresh()
    },
    onError: (error) => setFailure(errorMessage(error)),
  })

  const bots = list.data ?? []
  const busy = toggle.isPending || rotate.isPending
  const showTab = (next: Tab): void => setParams(next === 'bots' ? new URLSearchParams() : new URLSearchParams({ tab: next }), { replace: true })

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Bots externos</h1>
          <p className="mt-1 max-w-2xl text-muted">Otros asistentes con los que AutoMax intercambia información pública. Nunca se comparten datos de clientes.</p>
        </div>
        <Button onClick={() => setForm({ kind: 'create' })}>
          <Plus size={16} aria-hidden="true" />
          Registrar un bot
        </Button>
      </header>

      <div role="tablist" aria-label="Secciones" className="mb-5 flex gap-1 border-b border-border">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            onClick={() => showTab(item.id)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm transition-colors',
              tab === item.id ? 'border-accent font-medium text-foreground' : 'border-transparent text-muted hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {done && (
        <div role="status" className="mb-4 flex items-center justify-between gap-4 rounded-md border border-border bg-surface p-3 text-sm">
          <p>{done}</p>
          <Button variant="ghost" size="sm" onClick={() => setDone(null)}>
            Entendido
          </Button>
        </div>
      )}
      {failure && (
        <p role="alert" className="mb-4 rounded-md border border-accent p-3 text-sm">
          {failure}
        </p>
      )}
      {confirmRotate && (
        <div role="alertdialog" aria-label={`Rotar la key de ${confirmRotate.name}`} className="mb-4 rounded-md border border-accent p-4 text-sm">
          <p>
            Se generará una key nueva para <strong>{confirmRotate.name}</strong> y la actual <strong>dejará de funcionar al instante</strong>. El otro grupo tendrá que usar la
            nueva.
          </p>
          <div className="mt-3 flex gap-3">
            <Button size="sm" disabled={rotate.isPending} onClick={() => rotate.mutate(confirmRotate)}>
              {rotate.isPending ? 'Generando…' : 'Generar key nueva'}
            </Button>
            <Button size="sm" variant="outline" disabled={rotate.isPending} onClick={() => setConfirmRotate(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {tab === 'bots' && (
        <div role="tabpanel" id="panel-bots" aria-labelledby="tab-bots">
          {list.isPending && <ListSkeleton />}

          {list.isError && !list.data && (
            <div role="alert" className="rounded-xl border border-border bg-surface p-8 text-center">
              <p className="font-medium">No pudimos cargar los bots</p>
              <p className="mt-1 text-sm text-muted">{errorMessage(list.error)}</p>
              <Button className="mt-5" onClick={() => void list.refetch()}>
                Reintentar
              </Button>
            </div>
          )}

          {list.isSuccess && bots.length === 0 && (
            <div className="rounded-xl border border-border bg-surface p-10 text-center">
              <BotIcon size={32} aria-hidden="true" className="mx-auto text-muted" />
              <p className="mt-3 font-medium">Todavía no hay bots registrados</p>
              <p className="mt-1 text-sm text-muted">Registra el de otro grupo para que pueda consultar el catálogo, o para que el asistente le haga preguntas.</p>
              <Button className="mt-5" onClick={() => setForm({ kind: 'create' })}>
                Registrar un bot
              </Button>
            </div>
          )}

          {list.isSuccess && bots.length > 0 && (
            <>
              <div aria-hidden="true" className={cn('hidden gap-4 px-4 pb-2 text-xs text-muted md:grid', ROW_GRID)}>
                <span>Bot</span>
                <span>Nos consulta</span>
                <span>Le consultamos</span>
                <span>Acciones</span>
              </div>
              <ul aria-label="Bots" className="rounded-xl border border-border bg-surface">
                {bots.map((bot) => (
                  <BotRow
                    key={bot.id}
                    bot={bot}
                    busy={busy}
                    onEdit={(target) => setForm({ kind: 'edit', bot: target })}
                    onToggle={(target) => toggle.mutate(target)}
                    onRotate={(target) => {
                      setDone(null)
                      setConfirmRotate(target)
                    }}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {tab === 'intercambios' && (
        <div role="tabpanel" id="panel-intercambios" aria-labelledby="tab-intercambios">
          <ExchangesPanel bots={bots} />
        </div>
      )}

      <BotFormDialog
        target={form}
        onClose={() => setForm(null)}
        onCreated={(result) => {
          setForm(null)
          setDone(null)
          setReveal({ botName: result.bot.name, apiKey: result.apiKey, reason: 'created' })
          void refresh()
        }}
        onSaved={(saved) => {
          setForm(null)
          setDone(`Cambios de ${saved.name} guardados.`)
          void refresh()
        }}
      />
      <KeyRevealDialog reveal={reveal} onClose={() => setReveal(null)} />
    </div>
  )
}
