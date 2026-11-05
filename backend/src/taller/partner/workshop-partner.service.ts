import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import type { StatusNoticeInput, WarrantyCheckInput, WarrantyServiceInput, WorkshopPartner } from '../../mcp/tools/partner.js';
import { RelacionesService } from '../../relaciones/relaciones.service.js';
import type { RelationRecord } from '../../relaciones/relaciones.service.js';
import { VinService } from '../../vin/vin.service.js';
import { WarrantyValidation } from '../entities/warranty-validation.entity.js';
import type { WarrantyLineResult } from '../entities/warranty-validation.entity.js';
import { WorkshopOrder } from '../entities/workshop-order.entity.js';
import { clean } from '../workshop-text.js';
import { WORKSHOP_CLIENT } from '../workshop.types.js';
import type { Tampering, WorkshopClient } from '../workshop.types.js';
import { PARTS_STORE } from './parts-store.js';
import type { PartsCheck, PartsStoreClient } from './parts-store.js';
import { eligibility, mismatch, STORE_PENDING_NOTE, storeVerdict, tamperingVerdict, verdict } from './warranty-decision.js';

/** Esperas antes de cada intento de `registrar_resultado_garantia`: la primera deja que el taller reciba nuestro acuse. */
const DELIVERY_DELAYS_MS = [500, 3_000, 15_000];

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Lo que el taller llama en nuestro MCP (decisión 134): leer la relación y el VIN, pedirnos validar la garantía y
 * avisarnos los cambios de estado de una orden. Solo lo usa un bot con el permiso `taller`.
 */
@Injectable()
export class WorkshopPartnerService implements WorkshopPartner {
  private readonly logger = new Logger(WorkshopPartnerService.name);
  /** Esperas entre intentos de envío (las pruebas las ponen en cero). */
  deliveryDelaysMs: readonly number[] = DELIVERY_DELAYS_MS;
  /** El último envío en curso a `registrar_resultado_garantia` (para esperarlo en las pruebas). */
  lastDelivery: Promise<void> = Promise.resolve();

  constructor(
    private readonly relations: RelacionesService,
    private readonly vins: VinService,
    @Inject(WORKSHOP_CLIENT) private readonly workshop: WorkshopClient,
    @InjectRepository(WarrantyValidation) private readonly validations: Repository<WarrantyValidation>,
    @InjectRepository(WorkshopOrder) private readonly orders: Repository<WorkshopOrder>,
    @Inject(PARTS_STORE) private readonly partsStore: PartsStoreClient,
  ) {}

  consultRelation(idRelacion: string): Promise<object | null> {
    return this.relations.consult(idRelacion);
  }

  /** Ficha del VIN en el formato de la cabecera de `consultar_relacion`, más qué dice cada parte del código. */
  async decodeVin(vin: string): Promise<object> {
    const info = await this.vins.lookup(vin);
    const s = info.structure;
    return {
      vin: info.vin, registrado: info.registered, fuente: info.source,
      marca: info.brand, modelo: info.model, anio: info.year, version: info.version, carroceria: info.bodyType,
      puertas: info.doors, motor: info.engine, combustible: info.fuel, transmision: info.transmission,
      estructura: { wmi: s.wmi, fabricante: s.manufacturer, pais: s.country, region: s.region, anioPorCodigo: s.year, digitoVerificadorValido: s.checkDigitValid },
    };
  }

  async validateWarranty(input: WarrantyCheckInput): Promise<object> {
    const relation = await this.relations.consult(input.id_relacion);
    const results = !relation || relation.vin !== input.vin ? mismatch(input.servicios) : await Promise.all(input.servicios.map((service) => this.decide(relation, input, service)));
    const existing = await this.validations.findOneBy({ code: input.codigo });
    if (existing && existing.relationId !== input.id_relacion) {
      this.logger.warn(`validar_garantia de ${input.codigo} con otra relación: no se guarda ni se envía`);
      return ack(input.codigo, mismatch(input.servicios));
    }
    // Mismo resultado = mismo id_mensaje (el taller no lo aplica dos veces); si cambió, otro id para que sí lo aplique.
    const same = existing && JSON.stringify(existing.results) === JSON.stringify(results);
    const messageId = same ? existing.messageId : `conc-${randomUUID()}-garantia`;
    await this.validations.save({ code: input.codigo, relationId: input.id_relacion, results, messageId, sendStatus: 'pendiente', attempts: 0 });
    this.logger.log(`Garantía ${input.codigo}: ${results.filter((r) => r.valida).length} de ${results.length} servicios válidos`);
    this.lastDelivery = this.deliver(input.codigo);
    return ack(input.codigo, results);
  }

  async notifyStatus(input: StatusNoticeInput): Promise<object> {
    const order = await this.orders.findOneBy({ code: input.codigo });
    if (!order || order.relationId !== input.id_relacion) {
      this.logger.warn(`notificar_estado_vehiculo de una orden que no es nuestra: ${input.codigo}`);
      return { recibido: true, codigo: input.codigo, conocida: false };
    }
    await this.orders.update({ code: input.codigo }, { status: input.estado, lastNote: input.nota ? clean(input.nota, 300) : null });
    this.logger.log(`Orden ${input.codigo}: ${input.estado}`);
    return { recibido: true, codigo: input.codigo, conocida: true, estado: input.estado };
  }

  /** Las cinco reglas de una línea (decisión 135): vigencia y plan, manipulación (taller), compra de repuesto (tienda) y dictamen. */
  private async decide(relation: RelationRecord, input: WarrantyCheckInput, service: WarrantyServiceInput): Promise<WarrantyLineResult> {
    const blocked = eligibility(relation.garantia, service);
    if (blocked) return blocked;
    const [tampering, store] = await Promise.all([this.tampering(input, service), this.purchases(input, service)]);
    const external = tamperingVerdict(service, tampering) ?? storeVerdict(service, store, input.codigo);
    if (external) return external;
    const result = verdict(relation.garantia, service);
    return result.valida && store && !store.conectada ? { ...result, motivo: result.motivo + STORE_PENDING_NOTE } : result;
  }

  /** `consultar_manipulacion` en el taller; null si no respondió (entonces no se puede verificar). */
  private async tampering(input: WarrantyCheckInput, service: WarrantyServiceInput): Promise<Tampering | null> {
    try {
      return await this.workshop.checkTampering({
        vin: input.vin, id_relacion: input.id_relacion, especialidad: service.especialidad, ...(service.sku ? { sku: service.sku } : {}), excluir_codigo: input.codigo,
      });
    } catch (error) {
      this.logger.warn(`No se pudo consultar la manipulación en el taller para ${input.codigo} (${error instanceof Error ? error.name : 'error'})`);
      return null;
    }
  }

  /** Compras del repuesto en la tienda; null si la tienda está conectada y no respondió. */
  private async purchases(input: WarrantyCheckInput, service: WarrantyServiceInput): Promise<PartsCheck | null> {
    try {
      return await this.partsStore.purchasesFor({ vin: input.vin, especialidad: service.especialidad, ...(service.sku ? { sku: service.sku } : {}) });
    } catch (error) {
      this.logger.warn(`No se pudo consultar la tienda de repuestos para ${input.codigo} (${error instanceof Error ? error.name : 'error'})`);
      return null;
    }
  }

  /** Envía el resultado al taller con reintentos; nunca lanza (corre después de responder el acuse). */
  private async deliver(code: string): Promise<void> {
    for (const [attempt, delay] of this.deliveryDelaysMs.entries()) {
      await sleep(delay);
      try {
        const row = await this.validations.findOneBy({ code });
        if (!row) return;
        await this.workshop.registerWarrantyResult({ codigo: row.code, resultados: row.results, id_mensaje: row.messageId });
        await this.validations.update({ code }, { sendStatus: 'enviado', attempts: attempt + 1 });
        this.logger.log(`Resultado de garantía ${code} registrado en el taller`);
        return;
      } catch (error) {
        const last = attempt === this.deliveryDelaysMs.length - 1;
        this.logger.warn(`No se pudo registrar la garantía ${code} en el taller (intento ${attempt + 1}: ${error instanceof Error ? error.name : 'error'})`);
        await this.validations.update({ code }, { sendStatus: last ? 'fallido' : 'pendiente', attempts: attempt + 1 }).catch(() => undefined);
      }
    }
  }
}

function ack(code: string, results: WarrantyLineResult[]): object {
  return {
    recibido: true,
    codigo: code,
    resultados: results,
    siguiente_paso: { responsable: 'concesionario', descripcion: 'AutoMax registra este resultado en el taller con registrar_resultado_garantia' },
  };
}
