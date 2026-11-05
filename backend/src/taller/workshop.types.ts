import type { z } from 'zod';
import type { availabilitySchema, prediagnosisSchema, reservationSchema, routingSchema, sitesSchema, tamperingSchema, workOrderSchema } from './workshop-schemas.js';

/**
 * Contrato con el MCP del taller (servidor real `taller-pulgas-locas` 2.0.0), solo las herramientas y los campos que
 * usa el concesionario para el flujo de garantía bot a bot (decisiones 130, 131 y 133). Los nombres van tal cual el
 * contrato: minúscula y guion bajo. Los tipos salen de los esquemas zod, que son la única fuente.
 */
export type Site = z.output<typeof sitesSchema>['elementos'][number];
export type Prediagnosis = z.output<typeof prediagnosisSchema>;
export type Routing = z.output<typeof routingSchema>;
export type Availability = z.output<typeof availabilitySchema>;
export type Reservation = z.output<typeof reservationSchema>;
export type WorkOrder = z.output<typeof workOrderSchema>;
export type Tampering = z.output<typeof tamperingSchema>;

/** `consultar_manipulacion`: el componente (especialidad y, si hay, el SKU) de un VIN, sin contar la orden actual. */
export interface TamperingRequest {
  vin: string;
  id_relacion: string;
  especialidad: string;
  sku?: string;
  excluir_codigo?: string;
}

/** `enrutar_garantia`: lo que el cliente contó y el motivo del reclamo; el taller decide la sede. */
export interface RouteRequest {
  id_relacion: string;
  vin: string;
  por_garantia: boolean;
  motivo_reclamo: string;
  mensajes_cliente: string[];
  kilometraje?: number;
  id_mensaje: string;
}

/** `reservar_franja`: aparta una hora mientras el cliente confirma. */
export interface ReserveRequest {
  taller: string;
  fecha_hora: string;
  id_relacion: string;
  id_mensaje: string;
}

/** `agendar_cita` con lo ya decidido: el taller usa la sede del prediagnóstico y la hora de la reserva. */
export interface BookingRequest {
  id_relacion: string;
  id_prediagnostico: string;
  id_reserva: string;
  id_mensaje: string;
}

/** `registrar_resultado_garantia`: la respuesta del concesionario a `validar_garantia` (decisión 134). */
export interface WarrantyResultRequest {
  codigo: string;
  resultados: { tarea_id: string | number; valida: boolean; motivo: string }[];
  id_mensaje: string;
}

/** Las herramientas del taller que usa el concesionario. */
export interface WorkshopClient {
  /** `simulado` o `taller` (el MCP real): queda en la copia local de cada orden. */
  readonly source: 'simulado' | 'taller';
  route(request: RouteRequest): Promise<Routing>;
  /** Franjas libres de una sede entre dos fechas AAAA-MM-DD (máximo 14 días). */
  availability(site: string, from: string, to: string): Promise<Availability>;
  reserve(request: ReserveRequest): Promise<Reservation>;
  book(request: BookingRequest): Promise<WorkOrder>;
  listSites(): Promise<Site[]>;
  /** Órdenes abiertas del vehículo (`listar_ordenes`): para saber si un reintento ya dejó la cita creada. */
  openOrders(relationId: string): Promise<WorkOrder[]>;
  /** Si al componente ya se le hizo algo antes (decisión 135): sin esto no se da la garantía. */
  checkTampering(request: TamperingRequest): Promise<Tampering>;
  /** Le registra al taller el resultado de la validación de garantía de una orden. */
  registerWarrantyResult(request: WarrantyResultRequest): Promise<void>;
}

export const WORKSHOP_CLIENT = Symbol('WORKSHOP_CLIENT');

/** Error de negocio del taller (`isError: true`) y taller caído: los mismos del cliente MCP genérico. */
export { RemoteToolError as WorkshopBusinessError, RemoteUnavailableError as WorkshopUnavailableError } from '../common/remote-mcp.client.js';
