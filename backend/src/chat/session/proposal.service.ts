import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CHAT_PROPOSAL_TTL_MS } from '../chat.config.js';
import { AppointmentProposal } from '../entities/appointment-proposal.entity.js';
import type { NewProposal, ProposalView } from '../tools/tool-types.js';

export function toView(proposal: AppointmentProposal): ProposalView {
  return {
    id: proposal.id,
    summary: proposal.summary,
    vehicleLabel: proposal.vehicleLabel,
    startsAt: proposal.startsAt.toISOString(),
    expiresAt: proposal.expiresAt.toISOString(),
  };
}

/** Propuestas de cita de un solo uso, ligadas a la sesión que las pidió. */
@Injectable()
export class ProposalService {
  constructor(@InjectRepository(AppointmentProposal) private readonly proposals: Repository<AppointmentProposal>) {}

  async create(sessionId: string, input: NewProposal, now = new Date()): Promise<ProposalView> {
    const saved = await this.proposals.save(
      this.proposals.create({
        sessionId,
        vehicleId: input.vehicleId,
        vehicleLabel: input.vehicleLabel.slice(0, 160),
        startsAt: input.startsAt,
        summary: input.summary,
        expiresAt: new Date(now.getTime() + CHAT_PROPOSAL_TTL_MS),
      }),
    );
    return toView(saved);
  }

  /**
   * Consume la propuesta con un UPDATE atómico: solo una de dos confirmaciones simultáneas obtiene la fila.
   * null si no existe, es de otra sesión, ya se usó o venció.
   */
  async consume(id: string, sessionId: string): Promise<AppointmentProposal | null> {
    const result = await this.proposals
      .createQueryBuilder()
      .update(AppointmentProposal)
      .set({ usedAt: () => 'now()' })
      .where('id = :id AND "sesion_id" = :sessionId AND "usada_en" IS NULL AND "vence_en" > now()', { id, sessionId })
      .returning('*')
      .execute();
    const row = (result.raw as Record<string, unknown>[])[0];
    if (!row) return null;
    return this.proposals.create({
      id: String(row.id),
      sessionId: String(row.sesion_id),
      vehicleId: Number(row.vehiculo_id),
      vehicleLabel: String(row.etiqueta),
      startsAt: new Date(String(row.inicia_en)),
      summary: String(row.resumen),
      expiresAt: new Date(String(row.vence_en)),
    });
  }

  /** La cita no se creó (rechazo definitivo): la propuesta vuelve a poder usarse hasta que venza. */
  async release(id: string): Promise<void> {
    await this.proposals.update({ id }, { usedAt: null });
  }

  async complete(id: string, appointmentId: number): Promise<void> {
    await this.proposals.update({ id }, { appointmentId });
  }
}
