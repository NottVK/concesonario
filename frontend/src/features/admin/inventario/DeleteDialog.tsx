import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '@/api/client'
import type { VehicleWithBrand } from '@/api/types'
import { Button } from '@/components/ui/button'
import { deleteVehicle } from './api'

type Problem = { kind: 'history' | 'gone' | 'other'; message: string }

/** El servidor explica por qué no se puede borrar (venta o citas); aquí solo se agrega qué hacer en su lugar. */
function explain(error: unknown): Problem {
  const status = isAxiosError(error) ? error.response?.status : undefined
  if (status === 409) return { kind: 'history', message: errorMessage(error) }
  if (status === 404) return { kind: 'gone', message: 'Este vehículo ya no existe. La lista ya se actualizó.' }
  if (status === 401) return { kind: 'other', message: 'Tu sesión terminó antes de borrar. Vuelve a intentarlo.' }
  if (status === 403) return { kind: 'other', message: 'Tu cuenta no tiene permiso para borrar vehículos.' }
  return { kind: 'other', message: errorMessage(error) }
}

function Body({ vehicle, onClose, onDeleted, onStale }: { vehicle: VehicleWithBrand; onClose: () => void; onDeleted: (v: VehicleWithBrand) => void; onStale: () => void }) {
  const sending = useRef(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const mutation = useMutation({ mutationFn: () => deleteVehicle(vehicle.id) })
  const name = `${vehicle.brand.name} ${vehicle.model} ${vehicle.year}`

  const confirm = (): void => {
    if (sending.current) return
    sending.current = true
    setProblem(null)
    mutation.mutate(undefined, {
      onSuccess: () => onDeleted(vehicle),
      onError: (error) => {
        const found = explain(error)
        if (found.kind !== 'other') onStale()
        setProblem(found)
      },
      onSettled: () => {
        sending.current = false
      },
    })
  }

  const finished = problem !== null && problem.kind !== 'other'
  return (
    <div className="p-6">
      <h2 id="delete-dialog-title" className="text-xl font-semibold">
        {finished ? 'No se borró el vehículo' : '¿Borrar este vehículo?'}
      </h2>
      {!finished && (
        <p className="mt-3 text-sm">
          Vas a borrar <strong>{name}</strong> ({vehicle.version}). Esta acción no se puede deshacer.
        </p>
      )}
      {problem && (
        <p role="alert" className="mt-4 rounded-md border border-accent p-3 text-sm">
          {problem.message}
          {problem.kind === 'history' && ' Si ya no quieres mostrarlo, puedes dejarlo como está o editar sus datos.'}
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button variant="outline" onClick={onClose} disabled={mutation.isPending} autoFocus>
          {finished ? 'Cerrar' : 'Cancelar'}
        </Button>
        {!finished && (
          <Button onClick={confirm} disabled={mutation.isPending}>
            {mutation.isPending ? 'Borrando…' : problem ? 'Reintentar' : 'Borrar vehículo'}
          </Button>
        )}
      </div>
    </div>
  )
}

interface DeleteDialogProps {
  vehicle: VehicleWithBrand | null
  onClose: () => void
  onDeleted: (vehicle: VehicleWithBrand) => void
  onStale: () => void
}

export function DeleteDialog({ vehicle, onClose, onDeleted, onStale }: DeleteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (vehicle && !dialog.open) dialog.showModal()
    else if (!vehicle && dialog.open) dialog.close()
  }, [vehicle])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="delete-dialog-title"
      onClose={() => {
        if (vehicle) onClose()
      }}
      className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/70"
    >
      {vehicle && <Body key={vehicle.id} vehicle={vehicle} onClose={onClose} onDeleted={onDeleted} onStale={onStale} />}
    </dialog>
  )
}
