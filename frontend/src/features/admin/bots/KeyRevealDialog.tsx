import { Check, Copy, KeyRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

export interface Reveal {
  botName: string
  apiKey: string
  reason: 'created' | 'rotated'
}

/**
 * La key en claro se muestra UNA vez y no se puede recuperar. Esc no cierra el diálogo (se perdería sin querer):
 * hay que confirmar con «Ya la guardé». Al cerrarse, el componente se desmonta y la key desaparece del estado.
 */
export function KeyRevealDialog({ reveal, onClose }: { reveal: Reveal | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (reveal && !dialog.open) dialog.showModal()
    else if (!reveal && dialog.open) dialog.close()
    setCopied(null)
  }, [reveal])

  const copy = async (): Promise<void> => {
    if (!reveal) return
    try {
      await navigator.clipboard.writeText(reveal.apiKey)
      setCopied('yes')
    } catch {
      // Sin permiso para el portapapeles: se queda el campo seleccionable para copiarla a mano.
      setCopied('no')
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="key-dialog-title"
      onCancel={(event) => event.preventDefault()}
      className="m-auto w-[calc(100%-1.5rem)] max-w-lg rounded-xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/80"
    >
      {reveal && (
        <div className="p-6">
          <h2 id="key-dialog-title" className="flex items-center gap-2 text-xl font-semibold">
            <KeyRound size={20} aria-hidden="true" />
            {reveal.reason === 'created' ? `Bot registrado: ${reveal.botName}` : `Key nueva de ${reveal.botName}`}
          </h2>
          <p className="mt-3 text-sm">
            Esta es la key con la que <strong>{reveal.botName}</strong> le consulta a AutoMax. <strong>Se muestra una sola vez</strong> y no se puede
            recuperar: cópiala ahora y entrégasela al otro grupo. Si se pierde, se genera otra.
          </p>
          {reveal.reason === 'rotated' && <p className="mt-2 text-sm text-muted">La key anterior ya dejó de funcionar.</p>}
          <label htmlFor="revealed-key" className="mt-4 block text-sm text-muted">
            Key del bot
          </label>
          <input
            id="revealed-key"
            readOnly
            value={reveal.apiKey}
            onFocus={(event) => event.currentTarget.select()}
            autoComplete="off"
            spellCheck={false}
            className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 font-mono text-xs"
          />
          <div className="mt-3 flex items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
              {copied === 'yes' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              {copied === 'yes' ? 'Copiada' : 'Copiar key'}
            </Button>
            {copied === 'no' && (
              <p role="status" className="text-xs text-muted">
                No pudimos copiarla sola: selecciónala y cópiala a mano.
              </p>
            )}
          </div>
          <div className="mt-6 flex justify-end">
            <Button type="button" onClick={onClose}>
              Ya la guardé
            </Button>
          </div>
        </div>
      )}
    </dialog>
  )
}
