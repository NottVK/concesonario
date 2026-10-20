import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useEffect, useRef, useState } from 'react'
import type { MutableRefObject, ReactNode } from 'react'
import { brandsQuery } from '@/api/queries'
import { errorMessage } from '@/api/client'
import type { VehicleWithBrand } from '@/api/types'
import { Button } from '@/components/ui/button'
import { GroupedInput } from '@/components/ui/grouped-input'
import { FUEL_LABELS, TRANSMISSION_LABELS } from '@/lib/labels'
import { MAX_IMAGES } from '@/lib/images'
import { cn } from '@/lib/utils'
import { createVehicle, updateVehicle, vehicleFreshQuery } from './api'
import { EMPTY_FORM, LIMITS, isDirty, toForm, toPayload, validateVehicleForm } from './validation'
import type { FormErrors, VehicleForm } from './validation'

export type DialogMode = { kind: 'create' } | { kind: 'edit'; vehicle: VehicleWithBrand }

const DUPLICATE = 'Ya existe un vehículo con esa marca, modelo, año y versión. Cambia alguno de esos datos.'

type Phase =
  | { name: 'form' }
  | { name: 'sending' }
  | { name: 'stale'; current: VehicleWithBrand | null }
  | { name: 'sold' }
  | { name: 'failed'; message: string }
  | { name: 'gone' }

const inputClass = 'h-10 w-full rounded-md border border-border bg-background px-3 text-sm aria-[invalid=true]:border-accent'

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-muted">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-accent">
          {error}
        </p>
      )}
    </div>
  )
}

const aria = (id: string, error?: string) => ({ id, 'aria-invalid': error ? ('true' as const) : undefined, 'aria-describedby': error ? `${id}-error` : undefined })

interface EditorProps {
  mode: DialogMode
  busyRef: MutableRefObject<boolean>
  onClose: () => void
  onSaved: (saved: VehicleWithBrand, created: boolean) => void
  /** Lo que muestra la lista ya no es cierto (409 o 404): hay que refrescarla. */
  onStale: () => void
}

/** Contenido del diálogo; se monta al abrir y se desmonta al cerrar, así cada edición empieza limpia. */
function Editor({ mode, busyRef, onClose, onSaved, onStale }: EditorProps) {
  const queryClient = useQueryClient()
  const brands = useQuery(brandsQuery())
  const sending = useRef(false)
  // `base` es el vehículo sobre el que se edita (su revisión viaja en el PUT); cambia si se cargan los datos actuales tras un 409.
  const [base, setBase] = useState<VehicleWithBrand | null>(mode.kind === 'edit' ? mode.vehicle : null)
  const [form, setForm] = useState<VehicleForm>(base ? toForm(base) : EMPTY_FORM)
  const [original, setOriginal] = useState<VehicleForm>(form)
  const [phase, setPhase] = useState<Phase>({ name: 'form' })
  const [showErrors, setShowErrors] = useState(false)
  const [duplicate, setDuplicate] = useState(false)
  const mutation = useMutation({
    mutationFn: (payload: ReturnType<typeof toPayload>) =>
      base ? updateVehicle(base.id, { ...payload, revision: base.revision }) : createVehicle(payload),
  })

  const errors: FormErrors = validateVehicleForm(form)
  const visible = showErrors ? errors : {}
  const editing = base !== null
  const dirty = !editing || isDirty(form, original)
  const set = <K extends keyof VehicleForm>(key: K, value: VehicleForm[K]) => {
    setDuplicate(false)
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  const submit = (): void => {
    setShowErrors(true)
    if (Object.keys(errors).length > 0 || sending.current) return
    sending.current = true
    busyRef.current = true
    setPhase({ name: 'sending' })
    mutation.mutate(toPayload(form, base ?? undefined), {
      onSuccess: (saved) => onSaved(saved, !editing),
      onError: (error) => void explain(error),
      onSettled: () => {
        sending.current = false
        busyRef.current = false
      },
    })
  }

  /** Un 409 puede ser "se vendió", "otra persona lo editó" o "ya existe uno igual": se distingue mirando el vehículo actual. */
  const explain = async (error: unknown): Promise<void> => {
    const status = isAxiosError(error) ? error.response?.status : undefined
    if (status === 409 && base) {
      onStale()
      try {
        const current = await queryClient.fetchQuery(vehicleFreshQuery(base.id))
        if (current.status === 'vendido') return setPhase({ name: 'sold' })
        if (current.revision !== base.revision) return setPhase({ name: 'stale', current })
        setDuplicate(true)
        setPhase({ name: 'form' })
      } catch (reloadError) {
        if (isAxiosError(reloadError) && reloadError.response?.status === 404) return setPhase({ name: 'gone' })
        setPhase({ name: 'stale', current: null })
      }
    } else if (status === 409) {
      setDuplicate(true)
      setPhase({ name: 'form' })
    } else if (status === 404) {
      onStale()
      setPhase({ name: 'gone' })
    } else if (status === 401) {
      // La sesión terminó (o entró otra cuenta) y el cambio no se guardó: nunca se reintenta con otra persona.
      setPhase({ name: 'failed', message: 'Tu sesión terminó antes de guardar. Vuelve a intentarlo.' })
    } else if (status === 403) {
      setPhase({ name: 'failed', message: 'Tu cuenta no tiene permiso para modificar el inventario.' })
    } else {
      setPhase({ name: 'failed', message: errorMessage(error) })
    }
  }

  const adopt = (current: VehicleWithBrand, keepMine: boolean): void => {
    setBase(current)
    setOriginal(toForm(current))
    if (!keepMine) setForm(toForm(current))
    setDuplicate(false)
    setShowErrors(false)
    setPhase({ name: 'form' })
  }

  if (phase.name === 'gone') {
    return (
      <Message title="No se pudo guardar" onClose={onClose}>
        Este vehículo ya no existe. La lista ya se actualizó.
      </Message>
    )
  }
  if (phase.name === 'sold') {
    return (
      <Message title="No se guardaron tus cambios" onClose={onClose}>
        Este vehículo se vendió mientras lo editabas, así que ya no se puede modificar. La lista ya se actualizó.
      </Message>
    )
  }
  if (phase.name === 'stale') {
    const current = phase.current
    return (
      <Message
        title="No se guardaron tus cambios"
        onClose={onClose}
        extra={
          current && (
            <>
              <Button variant="outline" onClick={() => adopt(current, true)}>
                Conservar lo que escribí
              </Button>
              <Button onClick={() => adopt(current, false)}>Cargar los datos actuales</Button>
            </>
          )
        }
      >
        Otra persona modificó este vehículo mientras lo editabas. No se pisó nada: la lista ya se actualizó.
        {current && ' Puedes cargar los datos actuales o conservar lo que escribiste y revisarlo antes de guardar de nuevo.'}
      </Message>
    )
  }

  const busy = phase.name === 'sending'
  const brandName = mode.kind === 'edit' ? mode.vehicle.brand.name : ''
  return (
    <form
      noValidate
      className="p-6"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <h2 id="vehicle-dialog-title" className="text-xl font-semibold">
        {editing ? `Editar ${brandName} ${base.model}` : 'Agregar vehículo'}
      </h2>
      <p className="mt-2 text-sm text-muted">
        {editing ? 'Cambia los datos y guarda. Si otra persona lo modifica a la vez, te avisaremos sin pisar sus cambios.' : 'Completa los datos del vehículo. Quedará disponible en el catálogo.'}
      </p>

      {(duplicate || phase.name === 'failed') && (
        <p role="alert" className="mt-4 rounded-md border border-accent p-3 text-sm">
          {duplicate ? DUPLICATE : phase.name === 'failed' ? phase.message : ''}
        </p>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field id="v-brand" label="Marca" error={visible.brandId}>
          <select {...aria('v-brand', visible.brandId)} value={form.brandId} onChange={(e) => set('brandId', e.target.value)} className={inputClass}>
            <option value="">{brands.isPending ? 'Cargando marcas…' : 'Elige una marca'}</option>
            {brands.data?.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
          {brands.isError && <p className="mt-1 text-xs text-accent">No pudimos cargar las marcas. Cierra y vuelve a abrir el formulario.</p>}
        </Field>
        <Field id="v-model" label="Modelo" error={visible.model}>
          <input {...aria('v-model', visible.model)} value={form.model} maxLength={LIMITS.modelMax + 20} onChange={(e) => set('model', e.target.value)} className={inputClass} />
        </Field>
        <Field id="v-version" label="Versión" error={visible.version} hint="Por ejemplo: Touring, XEI, Sport.">
          <input {...aria('v-version', visible.version)} value={form.version} maxLength={LIMITS.versionMax + 20} onChange={(e) => set('version', e.target.value)} className={inputClass} />
        </Field>
        <Field id="v-year" label="Año" error={visible.year} hint={`Entre ${LIMITS.yearMin} y ${LIMITS.yearMax}.`}>
          <GroupedInput {...aria('v-year', visible.year)} grouped={false} maxLength={4} value={form.year} onValueChange={(v) => set('year', v)} className={inputClass} />
        </Field>
        <Field id="v-price" label="Precio (COP)" error={visible.price}>
          <GroupedInput {...aria('v-price', visible.price)} maxLength={LIMITS.priceDigits + 1} value={form.price} onValueChange={(v) => set('price', v)} className={inputClass} />
        </Field>
        <Field id="v-mileage" label="Kilometraje" error={visible.mileage} hint={`Hasta ${new Intl.NumberFormat('es-CO').format(LIMITS.mileageMax)} km.`}>
          <GroupedInput {...aria('v-mileage', visible.mileage)} maxLength={8} value={form.mileage} onValueChange={(v) => set('mileage', v === '' ? '' : v)} className={inputClass} />
        </Field>
        <Field id="v-fuel" label="Combustible" error={visible.fuel}>
          <select {...aria('v-fuel', visible.fuel)} value={form.fuel} onChange={(e) => set('fuel', e.target.value as VehicleForm['fuel'])} className={inputClass}>
            <option value="">Elige una opción</option>
            {Object.entries(FUEL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="v-transmission" label="Transmisión" error={visible.transmission}>
          <select {...aria('v-transmission', visible.transmission)} value={form.transmission} onChange={(e) => set('transmission', e.target.value as VehicleForm['transmission'])} className={inputClass}>
            <option value="">Elige una opción</option>
            {Object.entries(TRANSMISSION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="v-color" label="Color" error={visible.color}>
          <input {...aria('v-color', visible.color)} value={form.color} maxLength={LIMITS.colorMax + 10} onChange={(e) => set('color', e.target.value)} className={inputClass} />
        </Field>
        <Field id="v-status" label="Estado" hint="Pasa a «Vendido» solo al registrar una venta.">
          <select id="v-status" value={form.status} onChange={(e) => set('status', e.target.value as VehicleForm['status'])} className={inputClass}>
            <option value="nuevo">Nuevo</option>
            <option value="usado">Usado</option>
          </select>
        </Field>
      </div>

      <div className="mt-4 space-y-4">
        <Field id="v-description" label="Descripción (opcional)" error={visible.description}>
          <textarea {...aria('v-description', visible.description)} rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} className={cn(inputClass, 'h-auto py-2')} />
        </Field>
        <Field
          id="v-images"
          label={`Imágenes (opcional, una por línea, hasta ${MAX_IMAGES})`}
          error={visible.images}
          hint="Rutas que empiecen por /autos/ o URL que empiecen por https://. No se aceptan otros tipos de dirección."
        >
          <textarea {...aria('v-images', visible.images)} rows={3} spellCheck={false} value={form.images} onChange={(e) => set('images', e.target.value)} className={cn(inputClass, 'h-auto py-2 font-mono text-xs')} />
        </Field>
      </div>

      {showErrors && Object.keys(errors).length > 0 && (
        <p role="alert" className="mt-4 text-sm text-accent">
          Revisa los campos marcados antes de guardar.
        </p>
      )}
      {editing && !dirty && <p className="mt-4 text-xs text-muted">Aún no hay cambios que guardar.</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy || !dirty}>
          {busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Agregar vehículo'}
        </Button>
      </div>
    </form>
  )
}

function Message({ title, children, onClose, extra }: { title: string; children: ReactNode; onClose: () => void; extra?: ReactNode }) {
  return (
    <div className="p-6">
      <h2 id="vehicle-dialog-title" className="text-xl font-semibold">
        {title}
      </h2>
      <p role="alert" className="mt-3 text-sm">
        {children}
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
        {extra}
      </div>
    </div>
  )
}

interface VehicleDialogProps {
  mode: DialogMode | null
  onClose: () => void
  onSaved: (saved: VehicleWithBrand, created: boolean) => void
  onStale: () => void
}

/** Diálogo para agregar o editar un vehículo. Mientras envía se bloquean los botones y Esc. */
export function VehicleDialog({ mode, onClose, onSaved, onStale }: VehicleDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const busyRef = useRef(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (mode && !dialog.open) dialog.showModal()
    else if (!mode && dialog.open) dialog.close()
  }, [mode])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="vehicle-dialog-title"
      onCancel={(event) => {
        if (busyRef.current) event.preventDefault()
      }}
      onClose={() => {
        if (mode) onClose()
      }}
      className="m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/70"
    >
      {mode && <Editor key={mode.kind === 'edit' ? mode.vehicle.id : 'new'} mode={mode} busyRef={busyRef} onClose={onClose} onSaved={onSaved} onStale={onStale} />}
    </dialog>
  )
}
