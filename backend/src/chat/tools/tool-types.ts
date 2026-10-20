import type { ReadOnlyApi } from '../api/public-api.client.js';
import type { ToolDefinition } from '../model/model-provider.js';
import type { OtherBotTurn, ThirdPartyCard } from './other-bot.js';

/** Ficha corta para el widget (campo estructurado: el widget nunca interpreta texto del modelo como HTML). */
export interface VehicleCard {
  id: number;
  title: string;
  year: number;
  price: string;
  priceText: string;
  fuel: string;
  transmission: string;
  mileage: number;
  status: string;
  image: string | null;
}

/** Propuesta de cita que el widget muestra como tarjeta con formulario. */
export interface ProposalView {
  id: string;
  summary: string;
  vehicleLabel: string;
  startsAt: string;
  expiresAt: string;
}

export interface NewProposal {
  vehicleId: number;
  vehicleLabel: string;
  startsAt: Date;
  summary: string;
}

export interface ToolContext {
  api: ReadOnlyApi;
  sessionId: string;
  /** Ids que ya salieron de una tool en esta sesión (o que mandó la ficha del vehículo). */
  seen: ReadonlySet<number>;
  now: Date;
  createProposal(input: NewProposal): Promise<ProposalView>;
  /** Consulta a otros bots en este turno; null = la tool `preguntar_a_otro_bot` no se ofrece (no hay bots activos). */
  otherBots: OtherBotTurn | null;
}

export interface ToolResult {
  /** Lo que ve el modelo (ya filtrado por lista blanca de campos). */
  data: Record<string, unknown>;
  cards?: VehicleCard[];
  /** Ids que pasan a ser "vistos" en la sesión. */
  seen?: number[];
  proposal?: ProposalView;
  /** Respuesta de otro bot: va al widget en una tarjeta aparte y NUNCA al modelo (decisión 114). */
  thirdParty?: ThirdPartyCard;
}

export interface ChatTool {
  readonly name: string;
  readonly definition: ToolDefinition;
  /** Valida los argumentos que mandó el modelo; nunca confía en ellos. */
  run(rawArguments: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

/** Resultado de error que el modelo puede leer y corregir. */
export function toolError(message: string): ToolResult {
  return { data: { error: message } };
}
