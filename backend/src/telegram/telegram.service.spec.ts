import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ChatReplyDto } from '../chat/dto/chat.dto.js';
import type { ChatService } from '../chat/chat.service.js';
import type { TelegramClient } from './telegram.client.js';
import { isValidTelegramToken } from './telegram.config.js';
import { formatReply, UNSUPPORTED_TEXT, WELCOME_TEXT } from './telegram.format.js';
import { TelegramService } from './telegram.service.js';

const reply = (extra: Partial<ChatReplyDto> = {}): ChatReplyDto => ({ reply: 'Claro', cards: [], proposal: null, thirdParty: null, ...extra });

function build(turn: ChatService['turn']) {
  const client = { sendMessage: vi.fn().mockResolvedValue(undefined), sendTyping: vi.fn().mockResolvedValue(undefined) };
  const chat = { turn: vi.fn(turn) };
  const service = new TelegramService(client as unknown as TelegramClient, chat as unknown as ChatService);
  return { client, chat, service };
}

const update = (text: string | undefined, type = 'private', id = 7) => ({ update_id: 1, message: { text, chat: { id, type } } });

describe('TelegramService', () => {
  it('responde con el chat y recuerda la sesión por chat_id', async () => {
    const { client, chat, service } = build(async () => reply({ sessionToken: 'tok' }));
    await service.handle(update('hola mazda'));
    await service.handle(update('y el precio'));
    expect(client.sendMessage).toHaveBeenCalledWith(7, 'Claro');
    expect(chat.turn.mock.calls[0][0]).toMatchObject({ message: 'hola mazda', sessionToken: undefined, ip: 'telegram:7' });
    expect(chat.turn.mock.calls[1][0]).toMatchObject({ sessionToken: 'tok' });
  });

  it('/start da la bienvenida y lo que no es texto se rechaza, sin llamar al chat', async () => {
    const { client, chat, service } = build(async () => reply());
    await service.handle(update('/start'));
    await service.handle(update(undefined));
    expect(client.sendMessage).toHaveBeenNthCalledWith(1, 7, WELCOME_TEXT);
    expect(client.sendMessage).toHaveBeenNthCalledWith(2, 7, UNSUPPORTED_TEXT);
    expect(chat.turn).not.toHaveBeenCalled();
  });

  it('ignora grupos y canales', async () => {
    const { client, service } = build(async () => reply());
    await service.handle(update('hola', 'group'));
    expect(client.sendMessage).not.toHaveBeenCalled();
  });

  it('traduce los errores del chat sin romper el sondeo', async () => {
    const busy = build(async () => { throw new HttpException('cola llena', HttpStatus.SERVICE_UNAVAILABLE); });
    await busy.service.handle(update('hola mazda'));
    expect(busy.client.sendMessage).toHaveBeenCalledWith(7, 'cola llena');

    const limit = build(async () => { throw new HttpException('Llegaste al límite', HttpStatus.TOO_MANY_REQUESTS); });
    await limit.service.handle(update('hola mazda'));
    expect(limit.client.sendMessage).toHaveBeenCalledWith(7, 'Llegaste al límite');
  });
});

describe('formatReply y token', () => {
  it('agrega fichas, cita y tercero como texto plano', () => {
    const text = formatReply(
      reply({
        cards: [{ id: 1, title: 'Mazda 3', year: 2024, price: '1', priceText: '$95.000.000', fuel: 'gasolina', transmission: 'automática', mileage: 0, status: 'disponible', image: null }],
        thirdParty: { botName: 'Amigo', text: 'tenemos stock', flags: [] },
      }),
    );
    expect(text).toContain('Mazda 3 (2024) · $95.000.000');
    expect(text).toContain('tercero no verificado');
  });

  it('valida el formato del token de BotFather', () => {
    expect(isValidTelegramToken('123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw')).toBe(true);
    expect(isValidTelegramToken('pon_aqui_el_token_de_botfather')).toBe(false);
  });
});
