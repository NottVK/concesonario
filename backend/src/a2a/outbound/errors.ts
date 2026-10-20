import { ExchangeStatus } from '../entities/bot-exchange.entity.js';

/**
 * Fallo de una llamada saliente. `status` es la categoría que se audita y se le muestra al usuario (con un texto fijo);
 * `code` es el detalle SOLO para el registro de operación y las pruebas: nunca sale hacia el modelo ni hacia el usuario,
 * porque podría contener una dirección interna o un código de red (decisión 112).
 */
export class OutboundFailure extends Error {
  constructor(
    readonly status: ExchangeStatus,
    readonly code: string,
  ) {
    super(code);
    this.name = 'OutboundFailure';
  }
}

/** El destino viola la política SSRF: no se llegó a conectar. */
export class BlockedTarget extends OutboundFailure {
  constructor(code: string) {
    super(ExchangeStatus.SSRF_BLOCKED, code);
    this.name = 'BlockedTarget';
  }
}
