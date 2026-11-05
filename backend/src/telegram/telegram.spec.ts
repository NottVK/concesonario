import { HttpStatus } from '@nestjs/common';
import { AxiosError, AxiosHeaders } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import type { AppointmentConfirmService } from '../chat/appointment-confirm.service.js';
import { ChatRetryException } from '../chat/chat.errors.js';
import type { ChatService } from '../chat/chat.service.js';
import type { ChatReplyDto } from '../chat/dto/chat.dto.js';
import { nextBookingStep, readyCustomer, startBooking } from './booking-flow.js';
import { TelegramApiError, toTelegramError } from './telegram-api.client.js';
import type { TelegramApiClient } from './telegram-api.client.js';
import { BUTTON_BOOK, BUTTON_CONFIRM, replyToMessages, TEXTS } from './telegram-format.js';
import { telegramEnabled, telegramToken } from './telegram.config.js';
import { TelegramService } from './telegram.service.js';
import type { TelegramUpdate } from './telegram.types.js';

const TOKEN = '123456789:AAHfakeTokenForTests_abcdefghijklmnop';
const PROPOSAL_ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

const reply = (overrides: Partial<ChatReplyDto> = {}): ChatReplyDto => ({ reply: 'Tenemos este:', cards: [], proposal: null, thirdParty: null, ...overrides });
const text = (id: number, value: string, chatType: 'private' | 'group' = 'private'): TelegramUpdate => ({
  update_id: id,
  message: { message_id: id, chat: { id: 42, type: chatType }, text: value },
});
const button = (id: number, data: string): TelegramUpdate => ({
  update_id: id,
  callback_query: { id: `cb${id}`, data, message: { message_id: 900 + id, chat: { id: 42, type: 'private' } } },
});

describe('Configuración del bot de Telegram', () => {
  it('sin token está apagado; en pruebas está apagado aunque haya token', () => {
    expect(telegramToken({})).toBeNull();
    expect(telegramEnabled({ NODE_ENV: 'development' })).toBe(false);
    expect(telegramEnabled({ NODE_ENV: 'test', TELEGRAM_BOT_TOKEN: TOKEN })).toBe(false);
    expect(telegramEnabled({ NODE_ENV: 'development', TELEGRAM_BOT_TOKEN: TOKEN })).toBe(true);
  });

  it('un token con otro formato no arranca la API (y el error no muestra el token)', () => {
    expect(() => telegramToken({ TELEGRAM_BOT_TOKEN: 'pegue-aqui-su-token' })).toThrow(/formato que entrega BotFather/);
    try {
      telegramToken({ TELEGRAM_BOT_TOKEN: 'secreto-mal-copiado' });
    } catch (error) {
      expect(String(error)).not.toContain('secreto-mal-copiado');
    }
  });

  it('los errores de Axios se convierten en errores sin la URL (la URL lleva el token)', () => {
    const config = { url: `https://api.telegram.org/bot${TOKEN}/getUpdates`, headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
    const axiosError = new AxiosError('Request failed with status code 401', 'ERR_BAD_REQUEST', config, null, {
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      config,
      data: { ok: false, description: 'Unauthorized' },
    });
    const converted = toTelegramError(axiosError);
    expect(converted).toBeInstanceOf(TelegramApiError);
    expect((converted as TelegramApiError).status).toBe(401);
    expect(JSON.stringify(converted) + String(converted)).not.toContain(TOKEN);
  });
});

describe('Formato de las respuestas para Telegram', () => {
  it('arma la respuesta con fichas, la del otro bot aparte y la propuesta con botones', () => {
    const messages = replyToMessages(
      reply({
        cards: [{ id: 1, title: 'Mazda 3 Grand Touring', year: 2024, price: '95000000.00', priceText: '$95.000.000', fuel: 'gasolina', transmission: 'automatica', mileage: 12500, status: 'usado', image: null }],
        thirdParty: { botName: 'Bot Amigo', text: 'Tenemos repuestos.', flags: [] },
        proposal: { id: PROPOSAL_ID, summary: 'Test-drive del Mazda 3, sábado', vehicleLabel: 'Mazda 3', startsAt: '2026-11-07T15:00:00.000Z', expiresAt: '2026-11-07T15:10:00.000Z' },
      }),
    );
    expect(messages).toHaveLength(3);
    expect(messages[0]!.text).toContain('Mazda 3 Grand Touring 2024: $95.000.000 · 12.500 km · Gasolina · Automática');
    expect(messages[1]!.text).toMatch(/^Respuesta de Bot Amigo \(otro servicio, no verificado/);
    const buttons = messages[2]!.keyboard!.inline_keyboard[0]!;
    expect(buttons.map((b) => b.callback_data)).toEqual([`${BUTTON_BOOK}${PROPOSAL_ID}`, `cita:no:${PROPOSAL_ID}`]);
    for (const b of buttons) expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);
  });
});

describe('Datos de la cita en Telegram (los pide el código, no el modelo)', () => {
  it('pide nombre y correo, valida con las reglas de POST /citas y deja revisar antes de confirmar', () => {
    expect(startBooking('no-es-un-uuid')).toBeNull();
    let step = startBooking(PROPOSAL_ID)!;
    step = nextBookingStep(step.booking, 'A');
    expect(step.booking.step).toBe('name');
    step = nextBookingStep(step.booking, '  Ana Pérez  ');
    expect(step.booking).toMatchObject({ step: 'email', name: 'Ana Pérez' });
    step = nextBookingStep(step.booking, 'ana-arroba-correo');
    expect(step.booking.step).toBe('email');
    expect(readyCustomer(step.booking)).toBeNull();
    step = nextBookingStep(step.booking, 'ANA@Correo.co');
    expect(step.booking.step).toBe('confirm');
    expect(step.message.keyboard).toBeDefined();
    expect(readyCustomer(step.booking)).toEqual({ proposalId: PROPOSAL_ID, name: 'Ana Pérez', email: 'ana@correo.co' });
  });
});

describe('TelegramService', () => {
  function setup() {
    const api = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      sendTyping: vi.fn().mockResolvedValue(undefined),
      answerCallback: vi.fn().mockResolvedValue(undefined),
      removeButtons: vi.fn().mockResolvedValue(undefined),
    };
    const chat = { turn: vi.fn(), removeSession: vi.fn().mockResolvedValue(undefined) };
    const confirmation = { confirm: vi.fn().mockResolvedValue({ appointmentId: 7, message: 'Cita #7 registrada.' }) };
    const service = new TelegramService(api as unknown as TelegramApiClient, chat as unknown as ChatService, confirmation as unknown as AppointmentConfirmService);
    const sent = (): string[] => api.sendMessage.mock.calls.map((call) => call[1] as string);
    return { api, chat, confirmation, service, sent };
  }

  it('cada chat privado es una sesión: el token de la primera respuesta se reutiliza y el límite va por chat', async () => {
    const { chat, service, sent } = setup();
    chat.turn.mockResolvedValueOnce(reply({ sessionToken: 'tok-1' })).mockResolvedValueOnce(reply({ reply: 'Claro.' }));
    await service.accept(text(1, '¿Qué Mazda tienen?'));
    await service.accept(text(2, 'Cuéntame más'));
    expect(chat.turn.mock.calls[0]![0]).toMatchObject({ message: '¿Qué Mazda tienen?', sessionToken: undefined, ip: 'telegram:42' });
    expect(chat.turn.mock.calls[1]![0]).toMatchObject({ sessionToken: 'tok-1', ip: 'telegram:42' });
    expect(sent()).toEqual(['Tenemos este:', 'Claro.']);
  });

  it('ignora los grupos y responde /start sin llamar al modelo', async () => {
    const { chat, service, sent } = setup();
    await service.accept(text(1, 'hola a todos', 'group'));
    await service.accept(text(2, '/start'));
    expect(chat.turn).not.toHaveBeenCalled();
    expect(sent()).toEqual([TEXTS.welcome]);
  });

  it('agenda con botones: el nombre y el correo nunca llegan al modelo y la cita sale del servicio de confirmación', async () => {
    const { chat, confirmation, service, sent } = setup();
    const proposal = { id: PROPOSAL_ID, summary: 'Test-drive del Mazda 3', vehicleLabel: 'Mazda 3', startsAt: '', expiresAt: '' };
    chat.turn.mockResolvedValueOnce(reply({ sessionToken: 'tok-1', proposal }));
    await service.accept(text(1, 'Quiero un test-drive del Mazda 3 el sábado a las 10'));
    await service.accept(button(2, `${BUTTON_BOOK}${PROPOSAL_ID}`));
    await service.accept(text(3, 'Ana Pérez'));
    await service.accept(text(4, 'ana@correo.co'));
    await service.accept(button(5, BUTTON_CONFIRM));
    expect(chat.turn).toHaveBeenCalledTimes(1);
    expect(confirmation.confirm).toHaveBeenCalledWith('tok-1', { proposalId: PROPOSAL_ID, customer: { name: 'Ana Pérez', email: 'ana@correo.co' } });
    expect(sent().at(-1)).toContain('Cita #7 registrada.');
  });

  it('un botón de agendar sin conversación vigente no pide datos', async () => {
    const { confirmation, service, sent } = setup();
    await service.accept(button(1, `${BUTTON_BOOK}${PROPOSAL_ID}`));
    await service.accept(button(2, BUTTON_CONFIRM));
    expect(confirmation.confirm).not.toHaveBeenCalled();
    expect(sent()).toEqual([TEXTS.expired, TEXTS.noPendingBooking]);
  });

  it('los errores del chat llegan como su mensaje en español', async () => {
    const { chat, service, sent } = setup();
    chat.turn.mockRejectedValueOnce(new ChatRetryException('Llegaste al límite de mensajes por hora. Intenta más tarde.', HttpStatus.TOO_MANY_REQUESTS, 60));
    await service.accept(text(1, '¿Tienen Kia?'));
    expect(sent()).toEqual(['Llegaste al límite de mensajes por hora. Intenta más tarde.']);
  });

  it('/borrar borra la sesión del chat y lo que se recuerda del chat', async () => {
    const { chat, service } = setup();
    chat.turn.mockResolvedValueOnce(reply({ sessionToken: 'tok-1' })).mockResolvedValueOnce(reply());
    await service.accept(text(1, '¿Tienen Kia?'));
    await service.accept(text(2, '/borrar'));
    await service.accept(text(3, '¿Y Toyota?'));
    expect(chat.removeSession).toHaveBeenCalledWith('tok-1');
    expect(chat.turn.mock.calls[1]![0]).toMatchObject({ sessionToken: undefined });
  });

  it('no deja que una persona encole más de 3 mensajes mientras el modelo piensa', async () => {
    const { chat, service, sent } = setup();
    let release: (value: ChatReplyDto) => void = () => undefined;
    chat.turn.mockImplementation(() => new Promise<ChatReplyDto>((resolve) => (release = resolve)));
    const pending = [1, 2, 3].map((id) => service.accept(text(id, `mensaje ${id}`)));
    await service.accept(text(4, 'mensaje 4'));
    expect(sent()).toEqual([TEXTS.busy]);
    for (let i = 0; i < 3; i += 1) {
      await vi.waitFor(() => expect(chat.turn).toHaveBeenCalledTimes(i + 1));
      release(reply());
    }
    await Promise.all(pending);
  });
});
