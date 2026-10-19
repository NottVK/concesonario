/** Reglas de un cliente. Reflejan las del servidor (`CustomerDto`), que es quien manda: aquí solo se avisa antes. */
export const NAME_MIN = 2
export const NAME_MAX = 120
export const EMAIL_MAX = 120
export const PHONE_MIN_DIGITS = 7
export const PHONE_MAX = 30

export interface CustomerForm {
  name: string
  email: string
  phone: string
}

/** Datos de un cliente tal como se guardan (el teléfono es opcional). */
export interface CustomerFields {
  name: string
  email: string
  phone: string | null
}

export type FormErrors = Partial<Record<keyof CustomerForm, string>>

const EMAIL_PATTERN = /^[^\s@]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/
const PHONE_CHARS = /^[0-9+()\-\s]+$/

export function validateForm(form: CustomerForm): FormErrors {
  const errors: FormErrors = {}
  const name = form.name.trim()
  if (name.length < NAME_MIN) errors.name = `El nombre debe tener al menos ${NAME_MIN} caracteres.`
  else if (name.length > NAME_MAX) errors.name = `El nombre no puede pasar de ${NAME_MAX} caracteres.`

  const email = form.email.trim()
  if (email.length > EMAIL_MAX) errors.email = `El correo no puede pasar de ${EMAIL_MAX} caracteres.`
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Escribe un correo válido, por ejemplo nombre@correo.co.'

  const phone = form.phone.trim()
  if (phone) {
    const digits = phone.replace(/\D/g, '').length
    if (phone.length > PHONE_MAX) errors.phone = `El teléfono no puede pasar de ${PHONE_MAX} caracteres.`
    else if (!PHONE_CHARS.test(phone)) errors.phone = 'El teléfono solo admite números, espacios y los signos + - ( ).'
    else if (digits < PHONE_MIN_DIGITS) errors.phone = `El teléfono debe tener al menos ${PHONE_MIN_DIGITS} dígitos.`
  }
  return errors
}

/** Lo que se envía y se compara: sin espacios sobrantes, correo en minúsculas y teléfono vacío como null. */
export function normalizeForm(form: CustomerForm): CustomerFields {
  return { name: form.name.trim(), email: form.email.trim().toLowerCase(), phone: form.phone.trim() || null }
}

export const NO_PHONE = 'Sin teléfono'

export interface FieldChange {
  field: keyof CustomerForm
  label: string
  before: string
  after: string
}

const LABELS: Record<keyof CustomerForm, string> = { name: 'Nombre', email: 'Correo', phone: 'Teléfono' }

/** Campos que realmente cambian entre lo guardado y lo editado (para mostrarlos antes de guardar). */
export function changesBetween(saved: CustomerFields, edited: CustomerForm): FieldChange[] {
  const next = normalizeForm(edited)
  const show = (value: string | null): string => value ?? NO_PHONE
  return (['name', 'email', 'phone'] as const)
    .filter((field) => saved[field] !== next[field])
    .map((field) => ({ field, label: LABELS[field], before: show(saved[field]), after: show(next[field]) }))
}
