import { useMutation } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, CirclePause, Plug } from 'lucide-react'
import { errorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { testBotConnection } from './api'
import type { Bot, ConnectionTest } from './api'
import { formatDate, ROW_GRID } from './format'
import { AUTH_LABELS, STATUS_HINTS } from './labels'

/** Estado del bot: texto + icono + forma del borde, de modo que no dependa solo del color. */
export function ActiveBadge({ active }: { active: boolean }) {
  const Icon = active ? CircleCheck : CirclePause
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        active ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-muted line-through decoration-1',
      )}
    >
      <Icon size={13} aria-hidden="true" />
      {active ? 'Activo' : 'Desactivado'}
    </span>
  )
}

/**
 * Resultado de «Probar conexión». El nombre y la descripción son lo que el otro bot dice de sí mismo: texto de un
 * tercero, ya saneado por el servidor y pintado aquí SIEMPRE como texto.
 */
export function ConnectionResult({ result }: { result: ConnectionTest }) {
  if (!result.ok) {
    const hint = result.status ? STATUS_HINTS[result.status] : undefined
    return (
      <div role="status" className="mt-3 flex gap-2 rounded-md border border-accent/60 p-3 text-sm">
        <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
        <div>
          <p className="font-medium">{result.message ?? 'No se pudo probar la conexión.'}</p>
          {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
        </div>
      </div>
    )
  }
  return (
    <div role="status" className="mt-3 rounded-md border border-border p-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <CircleCheck size={16} aria-hidden="true" className="text-accent" />
        Conexión correcta
      </p>
      <div className="mt-2 rounded-md border border-dashed border-accent/60 p-2.5">
        <p className="text-xs text-muted">Lo que el bot dice de sí mismo (tercero no verificado):</p>
        <p className="mt-1 break-words font-medium">{result.name || 'Sin nombre'}</p>
        {result.description && <p className="mt-0.5 break-words text-muted">{result.description}</p>}
        {result.skills && result.skills.length > 0 && <p className="mt-1 break-words text-xs text-muted">Habilidades: {result.skills.join(', ')}</p>}
      </div>
      {result.originMismatch && (
        <p className="mt-2 text-xs text-accent">
          La tarjeta del bot dice que vive en otro dominio. Las consultas siguen yendo a la dirección que registraste, no a esa.
        </p>
      )}
    </div>
  )
}

interface BotRowProps {
  bot: Bot
  busy: boolean
  onEdit: (bot: Bot) => void
  onToggle: (bot: Bot) => void
  onRotate: (bot: Bot) => void
}

export function BotRow({ bot, busy, onEdit, onToggle, onRotate }: BotRowProps) {
  const test = useMutation({ mutationFn: () => testBotConnection(bot.id) })
  return (
    <li className="border-b border-border px-4 py-4 last:border-b-0">
      <div className={cn('grid gap-3 md:gap-4', ROW_GRID)}>
        <div className="min-w-0">
          <h2 className="break-words text-base font-medium">{bot.name}</h2>
          <div className="mt-1.5">
            <ActiveBadge active={bot.active} />
          </div>
          <p className="mt-2 break-all text-sm text-muted">{bot.url ?? 'Sin dirección: AutoMax no puede preguntarle'}</p>
        </div>

        <dl className="text-sm">
          <dt className="text-xs text-muted">Cuando el bot nos consulta</dt>
          <dd className="mt-0.5">
            {bot.hasKey ? (
              <>
                Key <code className="font-mono text-xs">amx_{bot.keyPrefix}…</code>
              </>
            ) : (
              'Sin key'
            )}
          </dd>
          <dd className="text-xs text-muted">Último uso: {formatDate(bot.lastUsedAt)}</dd>
          <dd className="text-xs text-muted">
            Hasta {bot.limitPerMinute}/min y {bot.limitPerDay.toLocaleString('es-CO')}/día
          </dd>
        </dl>

        <dl className="text-sm">
          <dt className="text-xs text-muted">Cuando AutoMax le pregunta</dt>
          <dd className="mt-0.5">{bot.hasOutboundKey ? 'Key guardada (cifrada)' : 'Sin key'}</dd>
          <dd className="text-xs text-muted">{AUTH_LABELS[bot.outboundAuth as keyof typeof AUTH_LABELS] ?? bot.outboundAuth}</dd>
          <dd className="text-xs text-muted">Hasta {bot.outboundLimitPerMinute}/min</dd>
        </dl>

        <div className="flex flex-wrap gap-2 md:max-w-44 md:justify-end">
          <Button size="sm" variant="outline" disabled={!bot.url || test.isPending} aria-label={`Probar la conexión con ${bot.name}`} onClick={() => test.mutate()}>
            <Plug size={14} aria-hidden="true" />
            {test.isPending ? 'Probando…' : 'Probar'}
          </Button>
          <Button size="sm" variant="outline" aria-label={`Editar a ${bot.name}`} onClick={() => onEdit(bot)}>
            Editar
          </Button>
          <Button size="sm" variant="outline" disabled={busy} aria-label={`${bot.active ? 'Desactivar' : 'Activar'} a ${bot.name}`} onClick={() => onToggle(bot)}>
            {bot.active ? 'Desactivar' : 'Activar'}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} aria-label={`Generar una key nueva para ${bot.name}`} onClick={() => onRotate(bot)}>
            Rotar key
          </Button>
        </div>
      </div>
      {test.isError && (
        <p role="alert" className="mt-3 rounded-md border border-accent/60 p-3 text-sm">
          {errorMessage(test.error)}
        </p>
      )}
      {test.data && <ConnectionResult result={test.data} />}
    </li>
  )
}
