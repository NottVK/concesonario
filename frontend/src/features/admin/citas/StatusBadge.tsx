import { CircleCheck, CircleX, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STATUS_LABELS } from './api'
import type { AppointmentStatus } from './api'

const ICONS = { pendiente: Clock, confirmada: CircleCheck, cancelada: CircleX }

/** Estado de una cita: texto + icono + forma del borde, de modo que no dependa solo del color. */
export function StatusBadge({ status, className }: { status: AppointmentStatus; className?: string }) {
  const Icon = ICONS[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        status === 'pendiente' && 'border-dashed border-foreground',
        status === 'confirmada' && 'border-accent bg-accent text-accent-foreground',
        status === 'cancelada' && 'border-border text-muted line-through decoration-1',
        className,
      )}
    >
      <Icon size={13} aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  )
}
