import { useMutation } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { classifyIdentifyError, identifyForWarranty } from './chatApi'

const control = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted'

interface Props {
  onIdentified: (message: string) => void
  onCancel: () => void
}

/** Identificación para garantías: el documento va directo al servidor y no se guarda en el estado del chat ni en el historial. */
export function WarrantyForm({ onIdentified, onCancel }: Props) {
  const [documento, setDocumento] = useState('')
  const [vin, setVin] = useState('')
  const [error, setError] = useState<string | null>(null)

  const identify = useMutation({
    mutationFn: () => identifyForWarranty({ documento: documento.trim(), vin: vin.trim() }),
    onSuccess: (message) => {
      setDocumento('')
      onIdentified(message)
    },
    onError: (e) => setError(classifyIdentifyError(e)),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (documento.trim().length < 6 || vin.trim().length < 11) return setError('Escribe tu documento y el VIN de tu vehículo.')
    identify.mutate()
  }

  return (
    <form onSubmit={submit} className="space-y-2 border-b border-border bg-background px-4 py-3" aria-label="Identificación para garantía">
      <p className="flex items-center gap-2 text-sm font-medium">
        <ShieldCheck size={16} aria-hidden="true" /> Garantía: identifícate
      </p>
      <input className={control} value={documento} onChange={(e) => setDocumento(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="Documento del propietario" aria-label="Documento del propietario" maxLength={20} />
      <input className={control} value={vin} onChange={(e) => setVin(e.target.value)} autoComplete="off" placeholder="VIN del vehículo (17 caracteres)" aria-label="VIN del vehículo" maxLength={40} />
      {error && (
        <p role="alert" className="text-xs text-accent">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={identify.isPending}>
          {identify.isPending ? 'Verificando…' : 'Verificar'}
        </Button>
      </div>
    </form>
  )
}
