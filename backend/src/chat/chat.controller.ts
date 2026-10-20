import { Body, Controller, Delete, Get, Headers, HttpCode, HttpException, Ip, Post, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiGoneResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../common/decorators.js';
import { publicThrottle } from '../common/throttle.js';
import { AppointmentConfirmService } from './appointment-confirm.service.js';
import { chatPerMinuteLimit } from './chat.config.js';
import { ChatRetryException } from './chat.errors.js';
import { ChatService } from './chat.service.js';
import { ChatMessageDto, ChatReplyDto, ChatStatusDto, ConfirmAppointmentDto, ConfirmedAppointmentDto } from './dto/chat.dto.js';

const SESSION_HEADER = 'x-chat-session';
const SESSION_DOC = { name: 'X-Chat-Session', required: false, description: 'Token de sesión que devolvió la primera respuesta del chat' };

/** Límite por minuto y por IP de POST /chat (el de 60 por hora vive en ChatService). */
const chatThrottle = (): ReturnType<typeof publicThrottle> => publicThrottle(chatPerMinuteLimit());

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly confirmation: AppointmentConfirmService,
  ) {}

  @Public()
  @Throttle(chatThrottle())
  @Post()
  @HttpCode(200)
  @ApiHeader(SESSION_DOC)
  @ApiOperation({
    summary: 'Un turno del chat con el asistente (público, 6 por minuto y 60 por hora por IP)',
    description:
      'Mensaje de hasta 500 caracteres. Sin streaming: la respuesta llega validada. La primera respuesta de una sesión ' +
      'trae `sessionToken`; el navegador lo guarda y lo manda en `X-Chat-Session`.',
  })
  @ApiOkResponse({ type: ChatReplyDto })
  @ApiBadRequestResponse({ description: 'Mensaje vacío o de más de 500 caracteres' })
  @ApiTooManyRequestsResponse({ description: 'Límite por IP, pausa entre turnos o tope de la conversación (con Retry-After)' })
  @ApiServiceUnavailableResponse({ description: 'El asistente no está disponible o la cola está llena' })
  async turn(
    @Body() dto: ChatMessageDto,
    @Headers(SESSION_HEADER) sessionToken: string | undefined,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ChatReplyDto> {
    const controller = new AbortController();
    // Si la persona cierra la conexión antes de que se responda, se cancela la espera y la llamada al modelo.
    res.on('close', () => {
      if (!res.writableFinished) controller.abort(new Error('El cliente cerró la conexión'));
    });
    try {
      return await this.chat.turn({ message: dto.message, vehicleId: dto.vehicleId, sessionToken, ip, signal: controller.signal });
    } catch (error) {
      if (error instanceof ChatRetryException) res.setHeader('Retry-After', String(error.retryAfterSeconds));
      // Cliente desconectado (499): nadie leerá la respuesta; se evita registrar un error falso.
      if (controller.signal.aborted) throw new HttpException('El cliente cerró la conexión', 499);
      throw error;
    }
  }

  @Public()
  @Delete('sesion')
  @HttpCode(204)
  @ApiHeader(SESSION_DOC)
  @ApiOperation({ summary: 'Borrar la conversación de esta sesión (derecho a borrar; en cascada)' })
  @ApiNoContentResponse({ description: 'Borrada, o no había nada que borrar' })
  async removeSession(@Headers(SESSION_HEADER) sessionToken: string | undefined): Promise<void> {
    await this.chat.removeSession(sessionToken);
  }

  @Public()
  @Get('estado')
  @ApiOperation({ summary: 'Si el asistente está disponible y con qué proveedor (caché de 30 s)' })
  @ApiOkResponse({ type: ChatStatusDto })
  status(): Promise<ChatStatusDto> {
    return this.chat.status();
  }

  @Public()
  @Throttle(publicThrottle(10))
  @Post('citas/confirmar')
  @HttpCode(200)
  @ApiHeader(SESSION_DOC)
  @ApiOperation({
    summary: 'Confirmar la propuesta de cita con los datos de contacto (público, 10 por minuto)',
    description: 'Único camino por el que el chat crea una cita. La propuesta es de un solo uso y vence a los 10 minutos.',
  })
  @ApiOkResponse({ type: ConfirmedAppointmentDto })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
  @ApiGoneResponse({ description: 'La propuesta ya se usó, venció, es de otra sesión o no existe' })
  confirm(
    @Body() dto: ConfirmAppointmentDto,
    @Headers(SESSION_HEADER) sessionToken: string | undefined,
  ): Promise<ConfirmedAppointmentDto> {
    return this.confirmation.confirm(sessionToken, dto);
  }
}
