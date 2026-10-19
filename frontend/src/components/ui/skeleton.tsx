import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** Bloque de carga; decorativo, oculto para lectores de pantalla. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-border', className)} {...props} />
}
