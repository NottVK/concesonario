/**
 * Lo único que el chat conoce del flujo de garantías (como `other-bot.ts`): una interfaz. La decisión de la garantía la
 * toma el CÓDIGO del módulo `garantias`; el modelo solo redacta con el `message` que viene ya armado.
 */
export const WARRANTY_GATEWAY = Symbol('WARRANTY_GATEWAY');

export type WarrantyState = 'needs_identification' | 'identified' | 'expired' | 'pending_mechanic' | 'accepted' | 'rejected';

export interface WarrantyView {
  state: WarrantyState;
  /** Texto para el cliente, armado por el servidor (el modelo lo comunica, no lo decide). */
  message: string;
  reason?: string;
  parts?: string[];
  appointmentStart?: string;
  canRequestReview?: boolean;
}

export interface WarrantyGateway {
  /** Evalúa la falla del caso de ESTA sesión. Con `requestReview` pide a una persona revisar una garantía vencida. */
  report(sessionId: string, fault: string, requestReview: boolean): Promise<WarrantyView>;
  status(sessionId: string): Promise<WarrantyView>;
}
