import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ApiUnreachableError, PublicApiClient } from './api/public-api.client.js';
import type { ConfirmAppointmentDto, ConfirmedAppointmentDto } from './dto/chat.dto.js';
import { ConversationRole } from './entities/conversation.entity.js';
import { ConversationService } from './session/conversation.service.js';
import { ProposalService } from './session/proposal.service.js';
import { SessionService } from './session/session.service.js';
import { apiMessage } from './tools/format.js';
import { describeSlot } from './tools/appointment-tool.js';

const GONE_MESSAGE = 'Esa propuesta ya se usó, venció o no existe. Pídele al asistente una nueva.';
const UNKNOWN_MESSAGE =
  'No recibimos respuesta del sistema de citas y la cita pudo quedar registrada. Consulta con un asesor antes de volver a intentarlo.';

/**
 * Único punto donde el bot crea una cita: solo después de que la persona confirma la propuesta en pantalla y
 * entrega sus datos. Esos datos van directo a `POST /citas`; no entran al modelo ni al historial.
 */
@Injectable()
export class AppointmentConfirmService {
  private readonly logger = new Logger(AppointmentConfirmService.name);

  constructor(
    private readonly sessions: SessionService,
    private readonly proposals: ProposalService,
    private readonly conversations: ConversationService,
    private readonly api: PublicApiClient,
  ) {}

  async confirm(sessionToken: string | undefined, dto: ConfirmAppointmentDto): Promise<ConfirmedAppointmentDto> {
    const session = await this.sessions.find(sessionToken);
    if (!session) throw new GoneException('La conversación venció. Abre una nueva para agendar.');
    // Un UPDATE atómico marca la propuesta como usada: dos confirmaciones simultáneas dan una sola cita.
    const proposal = await this.proposals.consume(dto.proposalId, session.id);
    if (!proposal) throw new GoneException(GONE_MESSAGE);

    const response = await this.createAppointment(proposal.id, {
      vehicleId: proposal.vehicleId,
      scheduledAt: proposal.startsAt.toISOString(),
      customer: dto.customer,
    });
    const appointmentId = (response.data as { id: number }).id;
    await this.proposals.complete(proposal.id, appointmentId);
    const message = `Cita #${appointmentId} registrada para ${proposal.vehicleLabel} el ${describeSlot(proposal.startsAt)}.`;
    // En el historial solo queda esta línea: nada del formulario.
    await this.conversations.save(session.id, [{ role: ConversationRole.ASSISTANT, message }]);
    await this.sessions.touch(session.id);
    return { appointmentId, message };
  }

  private async createAppointment(proposalId: string, body: Record<string, unknown>): Promise<{ data: unknown }> {
    let response: Awaited<ReturnType<PublicApiClient['createAppointment']>>;
    try {
      response = await this.api.createAppointment(body);
    } catch (error) {
      // Sin respuesta: no se sabe si la cita se creó, así que la propuesta NO se libera.
      if (error instanceof ApiUnreachableError) throw new BadGatewayException(UNKNOWN_MESSAGE);
      throw error;
    }
    if (response.status === 201) return response;
    if (response.status >= 500) {
      this.logger.error(`POST /citas respondió ${response.status}`);
      throw new BadGatewayException(UNKNOWN_MESSAGE);
    }
    // Rechazo definitivo: la propuesta vuelve a estar disponible hasta que venza.
    await this.proposals.release(proposalId);
    if (response.status === 409) throw new ConflictException(apiMessage(response.data, 'Ese horario no está disponible.'));
    if (response.status === 429) throw new HttpException('Espera un minuto antes de volver a intentarlo.', HttpStatus.TOO_MANY_REQUESTS);
    throw new BadRequestException(apiMessage(response.data, 'No pudimos registrar la cita con esos datos.'));
  }
}
