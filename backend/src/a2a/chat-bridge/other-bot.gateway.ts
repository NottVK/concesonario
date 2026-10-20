import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import type { OtherBotAnswer, OtherBotGateway, OtherBotInfo } from '../../chat/tools/other-bot.js';
import { ExternalBot } from '../entities/external-bot.entity.js';
import { A2aOutboundService } from '../outbound/a2a-outbound.service.js';

/** Máximo de bots que se le ofrecen al modelo (decisión 115). */
const MAX_BOTS = 10;

/**
 * Único puente entre el chat y la salida A2A (decisión 119). Implementa la interfaz que define el chat: lista los bots
 * activos con URL registrada y le pasa la pregunta a `A2aOutboundService`, que valida el destino, redacta la pregunta,
 * aplica los límites y sanea la respuesta. Lo único que devuelve al chat es texto plano ya saneado o un mensaje FIJO.
 */
@Injectable()
export class ChatOtherBotGateway implements OtherBotGateway {
  constructor(
    @InjectRepository(ExternalBot) private readonly bots: Repository<ExternalBot>,
    private readonly outbound: A2aOutboundService,
  ) {}

  async list(): Promise<OtherBotInfo[]> {
    const rows = await this.bots.find({ where: { active: true, url: Not(IsNull()) }, select: { id: true, name: true }, order: { id: 'ASC' }, take: MAX_BOTS });
    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  async ask(input: { botId: number; question: string; sessionKey: string }): Promise<OtherBotAnswer> {
    const result = await this.outbound.ask(input);
    return result.ok ? { ok: true, botName: result.bot.name, text: result.text, flags: result.flags } : { ok: false, message: result.message };
  }
}
