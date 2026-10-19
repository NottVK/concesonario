import { useState } from 'react'
import { CarImage } from '@/components/CarImage'
import { cn } from '@/lib/utils'

interface GalleryProps {
  images: string[]
  title: string
}

/** Foto principal y miniaturas. Cada imagen que falle cae sola al placeholder (lo hace CarImage). */
export function Gallery({ images, title }: GalleryProps) {
  const photos = images.length > 0 ? images : [undefined]
  const [selected, setSelected] = useState(0)
  const current = Math.min(selected, photos.length - 1)

  return (
    <div className="space-y-3">
      <CarImage
        src={photos[current]}
        alt={`${title}, foto ${current + 1} de ${photos.length}`}
        className="rounded-xl border border-border"
      />
      {photos.length > 1 && (
        <ul aria-label="Fotos del vehículo" className="grid grid-cols-4 gap-3 sm:grid-cols-5">
          {photos.map((src, index) => (
            <li key={`${src}-${index}`}>
              <button
                type="button"
                aria-label={`Ver foto ${index + 1} de ${photos.length}`}
                aria-pressed={index === current}
                onClick={() => setSelected(index)}
                className={cn(
                  'block w-full overflow-hidden rounded-md border-2 transition-colors duration-200',
                  index === current ? 'border-accent' : 'border-border hover:border-muted',
                )}
              >
                <CarImage src={src} alt="" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
