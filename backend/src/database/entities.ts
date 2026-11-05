import { BotExchange } from '../a2a/entities/bot-exchange.entity.js';
import { ExternalBot } from '../a2a/entities/external-bot.entity.js';
import { Appointment } from '../citas/entities/appointment.entity.js';
import { AppointmentProposal } from '../chat/entities/appointment-proposal.entity.js';
import { ChatSession } from '../chat/entities/chat-session.entity.js';
import { Conversation } from '../chat/entities/conversation.entity.js';
import { Customer } from '../clientes/entities/customer.entity.js';
import { Brand } from '../marcas/entities/brand.entity.js';
import { Relationship } from '../relaciones/entities/relationship.entity.js';
import { WarrantyValidation } from '../taller/entities/warranty-validation.entity.js';
import { WorkshopOrder } from '../taller/entities/workshop-order.entity.js';
import { User } from '../usuarios/entities/user.entity.js';
import { Vehicle } from '../vehiculos/entities/vehicle.entity.js';
import { Sale } from '../ventas/entities/sale.entity.js';
import { VinRecord } from '../vin/entities/vin-record.entity.js';

/** Lista explícita de entidades (evita globs, que fallan con ESM). */
export const entities = [
  Brand,
  Vehicle,
  Customer,
  User,
  Appointment,
  Sale,
  Conversation,
  ChatSession,
  AppointmentProposal,
  ExternalBot,
  BotExchange,
  VinRecord,
  Relationship,
  WorkshopOrder,
  WarrantyValidation,
];
