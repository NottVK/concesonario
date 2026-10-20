import { Inject, Injectable, Logger } from '@nestjs/common';
import { CHAT_MAX_CALLS_PER_ITERATION, CHAT_MAX_TOOL_ITERATIONS, CHAT_REPLY_MAX_CHARS } from '../chat.config.js';
import { MODEL_PROVIDER } from '../model/model-provider.js';
import type { ChatMessage, ChatResponse, ModelProvider, ToolCall } from '../model/model-provider.js';
import { DATA_CLOSE, DATA_OPEN, stripDelimiters, truncate } from '../text/sanitize.js';
import { executeTool, toolDefinitions } from '../tools/tool-registry.js';
import type { NewProposal, ProposalView, ToolContext, VehicleCard } from '../tools/tool-types.js';
import type { ReadOnlyApi } from '../api/public-api.client.js';
import { Collected } from './collected.js';
import { buildSystemPrompt } from './prompt.js';
import { checkReply, correctionNote, GENERIC_FALLBACK, PROMPT_REFUSAL } from './reply-checks.js';
import type { Problem } from './reply-checks.js';

export interface AgentInput {
  /** Solo roles `user` y `assistant`, ya redactados. */
  history: ChatMessage[];
  /** Mensaje del usuario ya saneado. */
  userMessage: string;
  api: ReadOnlyApi;
  sessionId: string;
  /** Ids que la sesión ya vio; el agente suma los de este turno. */
  seenVehicleIds: number[];
  createProposal(input: NewProposal): Promise<ProposalView>;
  signal?: AbortSignal;
  now?: Date;
}

export interface AgentOutput {
  reply: string;
  cards: VehicleCard[];
  proposal: ProposalView | null;
  /** Todos los ids vistos tras este turno. */
  seenVehicleIds: number[];
  toolsCalled: string[];
  /** 'none' = respuesta del modelo; 'template' = armada con datos de las tools; 'refusal' = negativa fija. */
  fallback: 'none' | 'template' | 'refusal';
}

/** Los datos de una tool viajan entre delimitadores, en JSON, y los propios datos no pueden cerrarlos. */
export function wrapToolData(data: Record<string, unknown>): string {
  return `${DATA_OPEN}\n${stripDelimiters(JSON.stringify(data))}\n${DATA_CLOSE}`;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(@Inject(MODEL_PROVIDER) private readonly provider: ModelProvider) {}

  get model(): string {
    return this.provider.model;
  }

  async run(input: AgentInput): Promise<AgentOutput> {
    const now = input.now ?? new Date();
    const collected = new Collected();
    const seen = new Set(input.seenVehicleIds);
    const toolsCalled: string[] = [];
    const context: ToolContext = { api: input.api, sessionId: input.sessionId, seen, now, createProposal: (proposal) => input.createProposal(proposal) };
    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(now) },
      ...input.history,
      { role: 'user', content: input.userMessage },
    ];

    let retried = false;
    // Hasta 4 rondas de tools más un único reintento de corrección.
    for (let round = 0; round < CHAT_MAX_TOOL_ITERATIONS + 1; round++) {
      const response = await this.provider.chat({ messages, tools: toolDefinitions(), signal: input.signal });
      if (response.toolCalls.length > 0) {
        await this.runToolCalls(response, messages, context, collected, seen, toolsCalled);
        continue;
      }
      const reply = response.content.trim();
      const problems: Problem[] = reply ? checkReply(reply, collected, input.userMessage) : ['empty'];
      if (problems.length === 0) return this.finish(reply, collected, seen, toolsCalled, 'none');
      if (problems.includes('prompt')) return this.finish(PROMPT_REFUSAL, collected, seen, toolsCalled, 'refusal');
      this.logger.warn(`Respuesta del modelo rechazada (${problems.join(', ')})`);
      if (retried) break;
      retried = true;
      messages.push({ role: 'assistant', content: reply || '(sin respuesta)' }, { role: 'user', content: correctionNote(problems) });
    }
    return this.finish(collected.template() ?? GENERIC_FALLBACK, collected, seen, toolsCalled, 'template');
  }

  private async runToolCalls(
    response: ChatResponse,
    messages: ChatMessage[],
    context: ToolContext,
    collected: Collected,
    seen: Set<number>,
    toolsCalled: string[],
  ): Promise<void> {
    messages.push({ role: 'assistant', content: response.content, toolCalls: response.toolCalls });
    const calls: ToolCall[] = response.toolCalls;
    for (const [index, call] of calls.entries()) {
      if (index >= CHAT_MAX_CALLS_PER_ITERATION) {
        messages.push({ role: 'tool', toolCallId: call.id, toolName: call.name, content: wrapToolData({ error: 'Demasiadas llamadas a la vez; haz una por vez.' }) });
        continue;
      }
      toolsCalled.push(call.name);
      const result = await executeTool(call, context);
      collected.add(call.name, result);
      for (const id of result.seen ?? []) seen.add(id);
      messages.push({ role: 'tool', toolCallId: call.id, toolName: call.name, content: wrapToolData(result.data) });
    }
  }

  private finish(
    reply: string,
    collected: Collected,
    seen: Set<number>,
    toolsCalled: string[],
    fallback: AgentOutput['fallback'],
  ): AgentOutput {
    return {
      reply: truncate(reply, CHAT_REPLY_MAX_CHARS),
      cards: collected.cards,
      proposal: collected.proposal,
      seenVehicleIds: [...seen],
      toolsCalled,
      fallback,
    };
  }
}
