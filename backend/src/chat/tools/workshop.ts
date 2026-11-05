/**
 * Contrato entre el chat y el taller (decisión 131). El chat NO importa nada de `taller/`: solo conoce esta interfaz,
 * que provee `TallerModule`, igual que A2A con `OTHER_BOT_GATEWAY`. El modelo organiza los pasos con las tools; el
 * gateway guarda por sesión, en el servidor, la cédula, la relación identificada y las horas ofrecidas, así que el
 * modelo nunca ve la cédula ni puede pedir datos de otro cliente o agendar una hora que el taller no ofreció.
 */
export const WORKSHOP_GATEWAY = Symbol('WORKSHOP_GATEWAY');

/** Lo que ve el modelo: datos ya validados, saneados y recortados, o `{ error }` con un texto fijo de AutoMax. */
export type WorkshopData = Record<string, unknown>;

/** Qué hora eligió el cliente: el número de la opción que se le ofreció (1 a 4) o la sede y la fecha_hora exactas. */
export type SlotPick = { option: number } | { site: string; slot: string };

export interface WorkshopGateway {
  /**
   * Antes del modelo: si el mensaje es del taller (o ya hay una conversación del taller en la sesión), guarda la cédula
   * y el VIN que traiga y devuelve el mensaje con los números personales tapados. Si no, lo devuelve igual.
   */
  capture(sessionId: string, message: string): string;
  /** Hay una conversación del taller en curso en esta sesión. */
  isActive(sessionId: string): boolean;
  identify(sessionId: string): Promise<WorkshopData>;
  prediagnose(sessionId: string, symptoms: string[]): Promise<WorkshopData>;
  sites(): Promise<WorkshopData>;
  /** Horas libres de una sede; `site` null = la sede que decidió el taller en el prediagnóstico. */
  slots(sessionId: string, site: string | null, date: string | null): Promise<WorkshopData>;
  /** Aparta en el taller la hora elegida mientras el cliente confirma (solo una hora que el taller ofreció). */
  hold(sessionId: string, pick: SlotPick): Promise<WorkshopData>;
  /**
   * Agenda la hora elegida (`null` = la que ya está apartada). `userMessage` es el último mensaje del cliente: sin una
   * aceptación explícita no se agenda.
   */
  book(sessionId: string, pick: SlotPick | null, userMessage: string): Promise<WorkshopData>;
}

/** Estado de las tools del taller en un turno. `null` en el contexto = las tools del taller no se ofrecen. */
export interface WorkshopTurn {
  gateway: WorkshopGateway;
  /** Mensaje del cliente de este turno (ya sin la cédula). */
  userMessage: string;
}
