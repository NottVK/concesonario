import { Injectable } from '@nestjs/common';
import type { WarrantyGateway, WarrantyView } from '../chat/tools/warranty.js';
import { GarantiasService } from './garantias.service.js';

/** Lo que ve el chat del flujo de garantías: dos operaciones sobre la sesión actual, nada más. */
@Injectable()
export class WarrantyChatGateway implements WarrantyGateway {
  constructor(private readonly garantias: GarantiasService) {}

  report(sessionId: string, fault: string, requestReview: boolean): Promise<WarrantyView> {
    return this.garantias.report(sessionId, fault, requestReview);
  }

  status(sessionId: string): Promise<WarrantyView> {
    return this.garantias.status(sessionId);
  }
}
