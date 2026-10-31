import { Injectable } from '@nestjs/common';
import { A2aOutboundService } from '../../a2a/outbound/a2a-outbound.service.js';
import { HttpPagos, HttpTaller, HttpTienda } from './http-services.js';
import { SimulatedServices } from './simulated.js';
import { SERVICE_NAMES } from './types.js';
import type { PagosService, TallerService, TiendaService } from './types.js';

const FAIL = { ok: false } as const;
/** Sin servicio registrado en producción: todo es «no verificado» (nunca se usa un simulado fuera de desarrollo). */
const UNAVAILABLE: TallerService & TiendaService & PagosService = {
  consultarRegistros: async () => FAIL,
  consultarDisponibilidad: async () => FAIL,
  agendarCita: async () => FAIL,
  consultarCompras: async () => FAIL,
  registrarCobroGarantia: async () => FAIL,
};

/**
 * Elige en cada llamada el servicio real (si hay un bot activo registrado con ese nombre) o el simulado. Pasar a uno
 * real es registrar su URL y su key en el panel de bots; no se toca código. El nombre lo fija el código.
 */
@Injectable()
export class ServiceDirectory {
  constructor(
    private readonly outbound: A2aOutboundService,
    private readonly simulated: SimulatedServices,
  ) {}

  async taller(): Promise<TallerService> {
    return (await this.outbound.hasService(SERVICE_NAMES.taller)) ? new HttpTaller(this.outbound) : this.fallback();
  }

  async tienda(): Promise<TiendaService> {
    return (await this.outbound.hasService(SERVICE_NAMES.tienda)) ? new HttpTienda(this.outbound) : this.fallback();
  }

  async pagos(): Promise<PagosService> {
    return (await this.outbound.hasService(SERVICE_NAMES.pagos)) ? new HttpPagos(this.outbound) : this.fallback();
  }

  private fallback(): TallerService & TiendaService & PagosService {
    return process.env.NODE_ENV === 'production' ? UNAVAILABLE : this.simulated;
  }
}
