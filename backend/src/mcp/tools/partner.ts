/**
 * Lo que el MCP necesita del taller para atender al bot del taller (decisión 134). El MCP no importa nada de
 * `taller/`: solo esta interfaz, que provee `TallerModule`. Si no está (pruebas del MCP), esas herramientas no existen.
 */
export const WORKSHOP_PARTNER = Symbol('WORKSHOP_PARTNER');

export interface WarrantyServiceInput {
  tarea_id: string | number;
  sku?: string;
  especialidad: string;
  causa?: string | null;
  aplica: boolean;
  motivo?: string | null;
  evidencias: string[];
}

export interface WarrantyCheckInput {
  codigo: string;
  id_relacion: string;
  vin: string;
  por_garantia: boolean;
  motivo_reclamo?: string | null;
  servicios: WarrantyServiceInput[];
}

export interface StatusNoticeInput {
  codigo: string;
  id_relacion: string;
  estado: string;
  placa?: string;
  sede?: string;
  nota?: string | null;
  fecha?: string;
}

export interface WorkshopPartner {
  /** `consultar_relacion`: cliente, vehículo (cabecera del VIN), kilometraje y garantía en camelCase, o null. */
  consultRelation(idRelacion: string): Promise<object | null>;
  decodeVin(vin: string): Promise<object>;
  /** Decide cada servicio y responde el acuse; el resultado se le envía al taller con `registrar_resultado_garantia`. */
  validateWarranty(input: WarrantyCheckInput): Promise<object>;
  notifyStatus(input: StatusNoticeInput): Promise<object>;
}
