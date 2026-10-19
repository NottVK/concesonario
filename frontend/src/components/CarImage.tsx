import { useState } from 'react'
import { cn } from '@/lib/utils'

export const PLACEHOLDER_SRC = '/autos/placeholder.svg'

interface CarImageProps {
  src: string | undefined
  alt: string
  className?: string
}

/**
 * Foto de un auto con carga diferida. Si el archivo no existe (404) o falla,
 * cambia una sola vez al placeholder. El contenedor tiene proporción fija para evitar saltos de layout.
 */
export function CarImage({ src, alt, className }: CarImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const current = src && failedSrc !== src ? src : PLACEHOLDER_SRC

  return (
    <div className={cn('aspect-[16/10] overflow-hidden bg-surface', className)}>
      <img
        src={current}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => {
          if (src && current === src) setFailedSrc(src)
        }}
        className="h-full w-full object-cover"
      />
    </div>
  )
}
