import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight, Inbox } from 'lucide-react'
import { useState } from 'react'
import { errorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Pagination } from '@/features/catalog/Pagination'
import { cn } from '@/lib/utils'
import { exchangesQuery } from './api'
import type { Bot, Exchange, ExchangesFilters } from './api'
import { formatDate } from './format'
import { CHANNEL_LABELS, DIRECTION_LABELS, STATUS_HINTS, STATUS_LABELS, statusLabel } from './labels'

const selectClass = 'h-10 rounded-md border border-border bg-background px-3 text-sm'

function StatusBadge({ status }: { status: string | null }) {
  const ok = status === 'ok'
  return (
    <span
      title={status ? STATUS_HINTS[status] : undefined}
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium',
        ok ? 'border-accent bg-accent text-accent-foreground' : 'border-dashed border-foreground',
      )}
    >
      {statusLabel(status)}
    </span>
  )
}

/** Un texto que viene de otro bot o lo que se le mandó: siempre texto plano, con su etiqueta de quién lo escribió. */
function Quote({ label, text, thirdParty }: { label: string; text: string; thirdParty: boolean }) {
  return (
    <div className={cn('rounded-md border p-2.5 text-sm', thirdParty ? 'border-dashed border-accent/60' : 'border-border')}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap break-words">{text || '(vacío)'}</p>
    </div>
  )
}

function ExchangeRow({ exchange }: { exchange: Exchange }) {
  const inbound = exchange.direction === 'entrante'
  const Icon = inbound ? ArrowDownLeft : ArrowUpRight
  return (
    <li className="grid gap-3 border-b border-border px-4 py-4 last:border-b-0 md:grid-cols-[11rem_minmax(0,1fr)_auto] md:gap-4">
      <div className="text-sm">
        <p className="flex items-center gap-1.5 font-medium">
          <Icon size={14} aria-hidden="true" />
          <span className="break-words">{exchange.botName}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {CHANNEL_LABELS[exchange.channel as keyof typeof CHANNEL_LABELS] ?? exchange.channel} · {DIRECTION_LABELS[exchange.direction as keyof typeof DIRECTION_LABELS] ?? exchange.direction}
        </p>
        <p className="mt-0.5 text-xs text-muted">{formatDate(exchange.createdAt)}</p>
      </div>
      <div className="min-w-0 space-y-2">
        {exchange.channel === 'mcp' ? (
          <Quote label="Herramienta consultada por el bot" text={[exchange.tool, exchange.argsSummary].filter(Boolean).join(' · ')} thirdParty={false} />
        ) : (
          <>
            <Quote
              label={inbound ? 'Pregunta del bot (tercero no verificado, ya redactada)' : 'Pregunta que enviamos (ya redactada)'}
              text={exchange.question ?? ''}
              thirdParty={inbound}
            />
            {(exchange.answer !== null || !inbound) && (
              <Quote
                label={inbound ? 'Lo que respondió AutoMax' : 'Respuesta del bot (tercero no verificado, ya saneada)'}
                text={exchange.answer ?? ''}
                thirdParty={!inbound}
              />
            )}
          </>
        )}
      </div>
      <div className="text-sm md:text-right">
        <StatusBadge status={exchange.status} />
        <p className="mt-1.5 text-xs text-muted">{exchange.durationMs === null ? '' : `${exchange.durationMs} ms`}</p>
      </div>
    </li>
  )
}

function ListSkeleton() {
  return (
    <ul aria-busy="true" aria-label="Cargando intercambios" className="rounded-xl border border-border bg-surface">
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className="grid gap-3 border-b border-border px-4 py-4 last:border-b-0 md:grid-cols-[11rem_minmax(0,1fr)_auto]">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-8 w-24" />
        </li>
      ))}
    </ul>
  )
}

/** Auditoría de lo que entra y sale por MCP y A2A. Texto redactado y recortado por el servidor; aquí solo se muestra como texto. */
export function ExchangesPanel({ bots }: { bots: Bot[] }) {
  const [filters, setFilters] = useState<ExchangesFilters>({ page: 1 })
  const list = useQuery({ ...exchangesQuery(filters), placeholderData: keepPreviousData })
  const rows = list.data?.data ?? []
  const filtered = Object.keys(filters).some((key) => key !== 'page' && filters[key as keyof ExchangesFilters] !== undefined)

  const change = (patch: Partial<ExchangesFilters>): void => setFilters((previous) => ({ ...previous, ...patch, page: 1 }))

  return (
    <section aria-label="Intercambios con otros bots">
      <p className="mb-4 max-w-2xl text-sm text-muted">
        Lo que entra y sale por MCP y A2A, lo más reciente primero. Las preguntas y respuestas se guardan redactadas (sin correos, enlaces ni teléfonos) y
        recortadas: las de A2A se borran a los 30 días y las de MCP a los 90. Lo que escribe un bot es de un tercero no verificado.
      </p>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="ex-bot" className="mb-1 block text-sm text-muted">
            Bot
          </label>
          <select id="ex-bot" className={selectClass} value={filters.botId ?? ''} onChange={(event) => change({ botId: event.target.value ? Number(event.target.value) : undefined })}>
            <option value="">Todos</option>
            {bots.map((bot) => (
              <option key={bot.id} value={bot.id}>
                {bot.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ex-channel" className="mb-1 block text-sm text-muted">
            Canal
          </label>
          <select id="ex-channel" className={selectClass} value={filters.channel ?? ''} onChange={(event) => change({ channel: (event.target.value || undefined) as ExchangesFilters['channel'] })}>
            <option value="">Todos</option>
            <option value="a2a">A2A</option>
            <option value="mcp">MCP</option>
          </select>
        </div>
        <div>
          <label htmlFor="ex-direction" className="mb-1 block text-sm text-muted">
            Dirección
          </label>
          <select
            id="ex-direction"
            className={selectClass}
            value={filters.direction ?? ''}
            onChange={(event) => change({ direction: (event.target.value || undefined) as ExchangesFilters['direction'] })}
          >
            <option value="">Todas</option>
            <option value="entrante">Entrante (el bot nos consulta)</option>
            <option value="saliente">Saliente (le consultamos)</option>
          </select>
        </div>
        <div>
          <label htmlFor="ex-status" className="mb-1 block text-sm text-muted">
            Resultado
          </label>
          <select id="ex-status" className={selectClass} value={filters.status ?? ''} onChange={(event) => change({ status: event.target.value || undefined })}>
            <option value="">Todos</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => setFilters({ page: 1 })}>
            Quitar filtros
          </Button>
        )}
      </div>

      {list.isPending && <ListSkeleton />}

      {list.isError && !list.data && (
        <div role="alert" className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="font-medium">No pudimos cargar los intercambios</p>
          <p className="mt-1 text-sm text-muted">{errorMessage(list.error)}</p>
          <Button className="mt-5" onClick={() => void list.refetch()}>
            Reintentar
          </Button>
        </div>
      )}

      {list.isSuccess && rows.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-10 text-center">
          <Inbox size={32} aria-hidden="true" className="mx-auto text-muted" />
          <p className="mt-3 font-medium">{filtered ? 'No hay intercambios con esos filtros' : 'Todavía no hay intercambios'}</p>
          <p className="mt-1 text-sm text-muted">
            {filtered ? 'Prueba quitando algún filtro.' : 'Aparecen aquí cuando un bot consulta a AutoMax o cuando el asistente le pregunta algo a un bot.'}
          </p>
        </div>
      )}

      {list.isSuccess && rows.length > 0 && (
        <>
          <ul aria-label="Intercambios" aria-busy={list.isFetching} className={cn('rounded-xl border border-border bg-surface', list.isPlaceholderData && 'opacity-60 transition-opacity')}>
            {rows.map((exchange) => (
              <ExchangeRow key={exchange.id} exchange={exchange} />
            ))}
          </ul>
          <Pagination page={list.data.meta.page} pages={list.data.meta.pages} onChange={(page) => setFilters((previous) => ({ ...previous, page }))} />
          <p className="mt-3 text-center text-xs text-muted">
            Mostrando {rows.length} de {list.data.meta.total}.
          </p>
        </>
      )}
    </section>
  )
}
