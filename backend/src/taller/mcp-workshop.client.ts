import type { z } from 'zod';
import { RemoteMcpClient, RemoteUnavailableError } from '../common/remote-mcp.client.js';
import { TALLER_CALL_TIMEOUT_MS, TALLER_SLOW_CALL_TIMEOUT_MS, TALLER_TAMPERING_TIMEOUT_MS } from './taller.config.js';
import type { TallerMcpConfig } from './taller.config.js';
import { availabilitySchema, ordersSchema, reservationSchema, routingSchema, sitesSchema, tamperingSchema, workOrderSchema } from './workshop-schemas.js';
import type { Availability, BookingRequest, Reservation, ReserveRequest, RouteRequest, Routing, Site, Tampering, TamperingRequest, WarrantyResultRequest, WorkOrder, WorkshopClient } from './workshop.types.js';

/**
 * Cliente del MCP real del taller (decisiones 130, 131 y 133). La conexión la lleva `RemoteMcpClient`; aquí van los
 * nombres y campos del contrato y la validación con zod de lo que responde el taller (es un dato no confiable; zod
 * descarta lo que no se usa, por ejemplo los datos del cliente que vienen en la orden). `enrutar_garantia` tiene un
 * plazo largo: el taller calcula el prediagnóstico con su modelo.
 */
export class McpWorkshopClient implements WorkshopClient {
  readonly source = 'taller' as const;
  private readonly remote: RemoteMcpClient;

  constructor(config: TallerMcpConfig) {
    this.remote = new RemoteMcpClient('taller', config, TALLER_CALL_TIMEOUT_MS);
  }

  async route(request: RouteRequest): Promise<Routing> {
    return parse(routingSchema, await this.remote.call('enrutar_garantia', { ...request }, TALLER_SLOW_CALL_TIMEOUT_MS));
  }

  async availability(site: string, from: string, to: string): Promise<Availability> {
    return parse(availabilitySchema, await this.remote.call('consultar_disponibilidad', { taller: site, desde: from, hasta: to }, TALLER_CALL_TIMEOUT_MS));
  }

  async reserve(request: ReserveRequest): Promise<Reservation> {
    return parse(reservationSchema, await this.remote.call('reservar_franja', { ...request }, TALLER_CALL_TIMEOUT_MS));
  }

  async book(request: BookingRequest): Promise<WorkOrder> {
    return parse(workOrderSchema, await this.remote.call('agendar_cita', { ...request }, TALLER_SLOW_CALL_TIMEOUT_MS));
  }

  async listSites(): Promise<Site[]> {
    return parse(sitesSchema, await this.remote.call('listar_talleres', {}, TALLER_CALL_TIMEOUT_MS)).elementos;
  }

  async openOrders(relationId: string): Promise<WorkOrder[]> {
    return parse(ordersSchema, await this.remote.call('listar_ordenes', { id_relacion: relationId, abiertas: true }, TALLER_CALL_TIMEOUT_MS));
  }

  async checkTampering(request: TamperingRequest): Promise<Tampering> {
    return parse(tamperingSchema, await this.remote.call('consultar_manipulacion', { ...request }, TALLER_TAMPERING_TIMEOUT_MS));
  }

  /** Lo que responda el taller no se usa: basta con que no sea isError (eso lanza RemoteToolError). */
  async registerWarrantyResult(request: WarrantyResultRequest): Promise<void> {
    await this.remote.call('registrar_resultado_garantia', { ...request }, TALLER_CALL_TIMEOUT_MS);
  }
}

function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new RemoteUnavailableError('La respuesta del taller no cumple el contrato');
  return parsed.data;
}
