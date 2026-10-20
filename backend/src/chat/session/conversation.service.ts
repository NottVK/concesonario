import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CHAT_HISTORY_MAX_CHARS, CHAT_HISTORY_TURNS } from '../chat.config.js';
import { Conversation, ConversationRole } from '../entities/conversation.entity.js';
import type { ChatMessage } from '../model/model-provider.js';
import { redactPersonalData } from '../text/redact.js';

interface Entry {
  role: ConversationRole.USER | ConversationRole.ASSISTANT;
  message: string;
  promptVersion?: string;
  model?: string;
}

/** Historial por sesión: solo `user` y `assistant`, siempre redactado antes de guardar. */
@Injectable()
export class ConversationService {
  constructor(@InjectRepository(Conversation) private readonly conversations: Repository<Conversation>) {}

  /** Últimos 10 turnos (20 mensajes) con un tope de ~6.000 caracteres: lo más viejo se descarta primero. */
  async context(sessionId: string): Promise<ChatMessage[]> {
    const rows = await this.conversations.find({
      where: { sessionId },
      order: { id: 'DESC' },
      take: CHAT_HISTORY_TURNS * 2,
    });
    const kept: ChatMessage[] = [];
    let chars = 0;
    for (const row of rows) {
      chars += row.message.length;
      if (chars > CHAT_HISTORY_MAX_CHARS) break;
      kept.push({ role: row.role === ConversationRole.USER ? 'user' : 'assistant', content: row.message });
    }
    // Siempre empieza por un mensaje del usuario, para no dejar una respuesta huérfana al inicio.
    const ordered = kept.reverse();
    while (ordered.length > 0 && ordered[0]!.role !== 'user') ordered.shift();
    return ordered;
  }

  async save(sessionId: string, entries: Entry[]): Promise<void> {
    await this.conversations.save(
      entries.map((entry) =>
        this.conversations.create({
          sessionId,
          role: entry.role,
          message: redactPersonalData(entry.message),
          promptVersion: entry.promptVersion ?? null,
          model: entry.model ?? null,
        }),
      ),
    );
  }
}
