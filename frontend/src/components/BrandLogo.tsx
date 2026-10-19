import { useState } from 'react'
import { cn } from '@/lib/utils'

interface BrandLogoProps {
  name: string
  logoUrl: string | null | undefined
  className?: string
}

/** Logo de marca; si falta el SVG muestra la inicial en un círculo. */
export function BrandLogo({ name, logoUrl, className }: BrandLogoProps) {
  const [failed, setFailed] = useState(false)
  if (!logoUrl || failed) {
    return (
      <span
        role="img"
        aria-label={`Logo de ${name}`}
        className={cn(
          'inline-flex items-center justify-center rounded-full border border-border bg-surface font-display font-semibold',
          className,
        )}
      >
        {name.charAt(0).toUpperCase()}
      </span>
    )
  }
  return (
    <img
      src={logoUrl}
      alt={`Logo de ${name}`}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn('object-contain', className)}
    />
  )
}
