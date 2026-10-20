import { ShieldAlert } from 'lucide-react'
import type { ThirdPartyData } from './chatApi'

/** Qué significa cada aviso que manda el servidor (son nombres de lo que se quitó o se tapó; nunca contenido). */
const FLAG_HINTS: Record<string, string> = {
  'dice-ser-automax': 'Este mensaje dice ser de AutoMax, pero NO lo es: lo escribió otro bot.',
  enlace: 'Se quitaron enlaces del texto.',
  correo: 'Se taparon correos del texto.',
  numero: 'Se taparon números de contacto del texto.',
  html: 'Se quitó código del texto.',
  markdown: 'Se quitó formato del texto.',
  invisible: 'Se quitaron caracteres ocultos del texto.',
  recortado: 'El texto se acortó.',
}

/** Orden en el que se muestran los avisos: primero el más importante. */
const FLAG_ORDER = ['dice-ser-automax', 'enlace', 'correo', 'numero', 'html', 'markdown', 'invisible', 'recortado']

/**
 * Respuesta de OTRO bot (decisión 114). Es un dato no confiable: va en una tarjeta aparte, siempre marcada «tercero no
 * verificado», y se pinta SOLO como texto plano (React escapa todo; no hay `dangerouslySetInnerHTML`, enlaces ni
 * imágenes que vengan del tercero). El asistente de AutoMax nunca vio este texto y no se responsabiliza de él.
 */
export function ThirdPartyCard({ card }: { card: ThirdPartyData }) {
  const hints = FLAG_ORDER.filter((flag) => card.flags.includes(flag)).map((flag) => FLAG_HINTS[flag]!)
  return (
    <aside
      aria-label={`Respuesta de un tercero no verificado: ${card.botName}`}
      className="mt-2 w-full rounded-lg border border-dashed border-accent/60 bg-background p-3 text-sm"
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent">
        <ShieldAlert size={14} aria-hidden="true" />
        Tercero no verificado
      </p>
      <p className="mt-1 text-xs text-muted">
        Respuesta de <span className="font-medium text-foreground">{card.botName}</span>. No es información de AutoMax y no la revisamos.
      </p>
      <blockquote className="mt-2 whitespace-pre-wrap break-words border-l-2 border-border pl-2.5">{card.text}</blockquote>
      {hints.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-muted">
          {hints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      )}
    </aside>
  )
}
