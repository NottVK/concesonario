import { useQuery } from '@tanstack/react-query'
import { MessageCircle, RotateCcw, Send, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link, useMatch } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useCompare } from '@/features/compare/CompareContext'
import { parseDbId } from '@/lib/ids'
import { cn } from '@/lib/utils'
import { fetchChatStatus, MAX_MESSAGE } from './chatApi'
import type { VehicleCardData } from './chatApi'
import { ProposalCard } from './ProposalCard'
import { useChat } from './useChat'

function TypingIndicator({ long }: { long: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted" role="status">
      <span className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="chat-dot size-1.5 rounded-full bg-muted" style={{ animationDelay: `${i * 90}ms` }} />
        ))}
      </span>
      <span>{long ? 'Sigo pensando…' : 'escribiendo…'}</span>
    </div>
  )
}

function Cards({ cards }: { cards: VehicleCardData[] }) {
  if (cards.length === 0) return null
  return (
    <ul className="mt-2 space-y-2">
      {cards.slice(0, 5).map((card) => (
        <li key={card.id} className="rounded-lg border border-border bg-background p-2.5 text-xs">
          <p className="font-medium">{card.title}</p>
          <p className="text-muted">
            {card.year} · {card.fuel} · {card.transmission}
          </p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="font-semibold text-accent">{card.priceText}</span>
            <Link to={`/catalogo/${card.id}`} className="underline underline-offset-2 hover:text-accent">
              Ver ficha
              <span className="sr-only"> de {card.title}</span>
            </Link>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** `thinkingAfterMs` solo cambia en las pruebas; en la app son 10 s. */
export function ChatWidget({ thinkingAfterMs }: { thinkingAfterMs?: number } = {}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const launcher = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)
  const { ids } = useCompare()
  const detail = useMatch('/catalogo/:id')
  const vehicleId = parseDbId(detail?.params.id)
  const chat = useChat(vehicleId, thinkingAfterMs)

  const status = useQuery({ queryKey: ['chat-status'], queryFn: fetchChatStatus, enabled: open, staleTime: 30_000, retry: false })
  const unavailable = open && (status.isError || status.data?.available === false)
  const external = status.data?.external === true
  const blocked = chat.sending || chat.cooldown > 0 || unavailable

  // Foco al campo al abrir; de vuelta al botón al cerrar.
  useEffect(() => {
    if (open) input.current?.focus()
    else if (wasOpen.current) launcher.current?.focus()
    wasOpen.current = open
  }, [open])

  // Mantiene visible lo último que se dijo.
  useEffect(() => {
    log.current?.scrollTo?.({ top: log.current.scrollHeight })
  }, [chat.messages, chat.sending, chat.failure])

  const submit = () => {
    if (blocked || !draft.trim()) return
    const text = draft
    setDraft('')
    void chat.send(text)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter envía; Shift+Enter agrega una línea.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  if (!open) {
    return (
      <button
        ref={launcher}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir asistente"
        className={cn(
          'fixed right-4 z-50 flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg transition-transform duration-200 hover:scale-105',
          ids.length > 0 ? 'bottom-24' : 'bottom-4',
        )}
      >
        <MessageCircle size={26} aria-hidden="true" />
      </button>
    )
  }

  return (
    <section
      role="dialog"
      aria-label="Asistente de AutoMax"
      onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}
      className="fixed inset-0 z-50 flex flex-col border-border bg-surface sm:inset-auto sm:bottom-4 sm:right-4 sm:h-[34rem] sm:max-h-[calc(100dvh-2rem)] sm:w-[24rem] sm:rounded-xl sm:border sm:shadow-2xl"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="font-display text-base font-semibold">Asistente AutoMax</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={chat.reset} aria-label="Nueva conversación" title="Nueva conversación">
            <RotateCcw size={16} aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void chat.erase()} aria-label="Borrar conversación" title="Borrar conversación">
            <Trash2 size={16} aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Cerrar asistente">
            <X size={18} aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div ref={log} role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversación" className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {chat.messages.length === 0 && !chat.sending && (
          <p className="text-sm text-muted">
            ¡Hola! Soy el asistente de AutoMax. Pregúntame por precios, disponibilidad, créditos o agenda un test-drive.
          </p>
        )}
        {chat.messages.map((message) => (
          <div key={message.id} className={cn('flex flex-col', message.role === 'user' ? 'items-end' : 'items-start')}>
            <div
              className={cn(
                'max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm',
                message.role === 'user' ? 'bg-accent text-accent-foreground' : message.role === 'note' ? 'text-xs text-muted' : 'bg-background',
              )}
            >
              {/* Siempre texto plano: React escapa todo, nada del modelo se interpreta como HTML. */}
              {message.text}
            </div>
            {message.cards && <Cards cards={message.cards} />}
            {message.proposal && message.proposalState === 'open' && (
              <div className="w-full">
                <ProposalCard
                  proposal={message.proposal}
                  onCancel={() => chat.setProposalState(message.id, 'cancelled')}
                  onConfirmed={(appointment) => {
                    chat.setProposalState(message.id, 'done')
                    chat.append({ role: 'assistant', text: appointment.message })
                  }}
                />
              </div>
            )}
            {message.proposal && message.proposalState === 'cancelled' && <p className="mt-1 text-xs text-muted">Propuesta descartada.</p>}
          </div>
        ))}
        {chat.sending && <TypingIndicator long={chat.thinkingLong} />}
        {chat.failure && (
          <div role="alert" className="rounded-lg border border-accent/50 bg-background p-3 text-sm">
            <p>{chat.failure.message}</p>
            {chat.failure.retryText && (
              <Button size="sm" variant="outline" className="mt-2" onClick={chat.retry}>
                Reintentar
              </Button>
            )}
          </div>
        )}
        {unavailable && !chat.failure && (
          <div role="alert" className="rounded-lg border border-accent/50 bg-background p-3 text-sm">
            <p>El asistente no está disponible ahora. Puedes usar el catálogo o agendar desde el detalle del vehículo.</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => void status.refetch()}>
              Reintentar
            </Button>
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        {external && (
          <p className="mb-2 text-xs text-muted">Tu texto puede procesarse en un servicio externo para generar la respuesta.</p>
        )}
        {chat.cooldown > 0 && (
          <p role="status" className="mb-2 text-xs text-accent">
            Límite alcanzado. Podrás escribir de nuevo en {chat.cooldown} s.
          </p>
        )}
        <div className="flex items-end gap-2">
          <label htmlFor="chat-input" className="sr-only">
            Escribe tu mensaje
          </label>
          <textarea
            id="chat-input"
            ref={input}
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, MAX_MESSAGE))}
            onKeyDown={onKeyDown}
            disabled={chat.cooldown > 0 || unavailable}
            rows={2}
            maxLength={MAX_MESSAGE}
            placeholder="Escribe tu mensaje…"
            className="min-h-11 flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted disabled:opacity-60"
          />
          <Button onClick={submit} disabled={blocked || !draft.trim()} aria-label="Enviar mensaje" className="size-11 shrink-0 px-0">
            <Send size={18} aria-hidden="true" />
          </Button>
        </div>
        <p className="mt-1 text-right text-[11px] text-muted" aria-hidden="true">
          {draft.length}/{MAX_MESSAGE}
        </p>
      </div>
    </section>
  )
}
