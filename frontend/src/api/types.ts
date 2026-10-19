import type { components } from './schema'

/** Tipos del contrato real de la API (generados con `npm run api:types`). */
type Schemas = components['schemas']

export type Vehicle = Schemas['Vehicle']
export type Brand = Schemas['Brand']
/** Listados, detalle y comparador siempre incluyen la marca (el spec la marca opcional por compartir entidad). */
export type VehicleWithBrand = Vehicle & { brand: Brand }
export type PageMeta = Schemas['PageMeta']
export type LoginResult = Schemas['LoginResultDto']
export type PublicUser = Schemas['PublicUserDto']
export type FinancingSimulation = Schemas['FinancingSimulationDto']
export type SimulateFinancingInput = Schemas['SimulateFinancingDto']
export type CreateAppointmentInput = Schemas['CreateAppointmentDto']
export type PublicAppointment = Schemas['PublicAppointmentDto']
export type Availability = Schemas['AvailabilityDto']

export interface Paginated<T> {
  data: T[]
  meta: PageMeta
}
