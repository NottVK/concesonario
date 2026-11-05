import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RELATION_RECORDS } from '../src/database/seeds/relaciones-data.js';
import { VIN_RECORDS } from '../src/database/seeds/vin-data.js';
import { ContactCrypto } from '../src/relaciones/contact-crypto.js';
import { Relationship } from '../src/relaciones/entities/relationship.entity.js';
import { WorkshopPartnerService } from '../src/taller/partner/workshop-partner.service.js';
import type { SimulatedWorkshopClient } from '../src/taller/simulated-workshop.client.js';
import { WORKSHOP_CLIENT } from '../src/taller/workshop.types.js';
import { UserRole } from '../src/usuarios/entities/user.entity.js';
import { VinRecord } from '../src/vin/entities/vin-record.entity.js';
import { auth, createTestContext, createUser, resetDatabase, type TestContext } from './helpers/app.js';

type TextResult = { content: { type: string; text: string }[]; isError?: boolean };

/**
 * Lo que el taller llama en NUESTRO MCP (decisión 134), por HTTP y con un cliente MCP real: solo un bot con el permiso
 * `taller` ve y usa las herramientas con datos de clientes, y la auditoría no guarda la cédula ni el teléfono.
 */
describe('MCP: herramientas del taller (e2e)', () => {
  let ctx: TestContext;
  let base: string;
  let workshopKey: string;
  let friendKey: string;

  const connect = async (key: string): Promise<Client> => {
    const client = new Client({ name: 'bot-del-taller', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }));
    return client;
  };
  const json = (result: unknown): unknown => JSON.parse((result as TextResult).content[0]!.text);
  const rows = async (sql: string) => (await ctx.dataSource.query(sql)) as Record<string, unknown>[];

  beforeAll(async () => {
    ctx = await createTestContext({ listen: true });
    base = `http://127.0.0.1:${(ctx.server.address() as AddressInfo).port}`;
    await resetDatabase(ctx.dataSource);
    await ctx.dataSource.getRepository(VinRecord).insert(VIN_RECORDS.map((row) => ({ ...row })));
    const crypto = ContactCrypto.fromEnv();
    await ctx.dataSource.getRepository(Relationship).insert(
      RELATION_RECORDS.map(({ cedula, nombre, telefono, ...row }) => ({ ...row, cedulaHmac: crypto.cedulaHmac(cedula), encryptedContact: crypto.seal(row.id, { cedula, nombre, telefono }) })),
    );
    const admin = auth(await ctx.tokenFor(await createUser(ctx.dataSource, UserRole.ADMIN)));
    const workshop = await request(ctx.server).post('/api/admin/bots').set(admin).send({ name: 'Taller Pulgas Locas', permissions: ['taller'], limitPerMinute: 600 }).expect(201);
    expect(workshop.body.bot.permissions).toEqual(['taller']);
    workshopKey = workshop.body.apiKey as string;
    const friend = await request(ctx.server).post('/api/admin/bots').set(admin).send({ name: 'Bot Amigo', limitPerMinute: 600 }).expect(201);
    expect(friend.body.bot.permissions).toEqual([]);
    friendKey = friend.body.apiKey as string;
    await request(ctx.server).post('/api/admin/bots').set(admin).send({ name: 'Bot Raro', permissions: ['admin'] }).expect(400);
    ctx.app.get(WorkshopPartnerService).deliveryDelaysMs = [0, 0, 0];
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('un bot SIN el permiso taller solo ve el catálogo y no puede llamar las del taller', async () => {
    const client = await connect(friendKey);
    expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual(['consultar_precio', 'consultar_stock', 'listar_marcas']);
    await expect(client.callTool({ name: 'consultar_relacion', arguments: { id_relacion: 'REL-1005' } })).rejects.toThrow(/Herramienta desconocida/);
    await client.close();
  });

  it('el bot del taller ve las 7; consultar_relacion responde en camelCase (o null) y decodificar_vin la ficha y el código', async () => {
    const client = await connect(workshopKey);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['consultar_precio', 'consultar_relacion', 'consultar_stock', 'decodificar_vin', 'listar_marcas', 'notificar_estado_vehiculo', 'validar_garantia']);
    expect(tools.find((t) => t.name === 'validar_garantia')!.annotations).toMatchObject({ readOnlyHint: false });

    const relation = json(await client.callTool({ name: 'consultar_relacion', arguments: { id_relacion: 'REL-1005' } }));
    expect(relation).toMatchObject({
      idRelacion: 'REL-1005', cedula: '39765432', cliente: 'Marta Gil', vin: '9FBHJD204LM500005', placa: 'MGL630',
      cabeceraVin: { marca: 'Renault', modelo: 'Duster', anio: 2020 }, garantia: { vigente: false },
    });
    expect(json(await client.callTool({ name: 'consultar_relacion', arguments: { id_relacion: 'REL-9999' } }))).toBeNull();

    const vin = json(await client.callTool({ name: 'decodificar_vin', arguments: { vin: '9fbhjd204lm500005' } }));
    expect(vin).toMatchObject({ vin: '9FBHJD204LM500005', registrado: true, marca: 'Renault', version: 'Intens 1.3 Turbo', estructura: { pais: 'Colombia', digitoVerificadorValido: true } });

    const bad = (await client.callTool({ name: 'consultar_relacion', arguments: { id_relacion: '1; DROP TABLE relaciones' } })) as TextResult;
    expect(bad.isError).toBe(true);
    expect(bad.content[0]!.text).toMatch(/^Parámetros no válidos/);
    await client.close();
  });

  it('validar_garantia decide cada servicio, responde el acuse y registra el resultado en el taller', async () => {
    const client = await connect(workshopKey);
    const ack = json(await client.callTool({
      name: 'validar_garantia',
      arguments: {
        codigo: 'OT-0021', id_relacion: 'REL-1001', vin: '9FBHJD204PM100001', por_garantia: true, motivo_reclamo: 'Los frenos chillan',
        servicios: [
          { tarea_id: 1, sku: 'FRE-DISCOS', especialidad: 'frenos', causa: 'defecto_fabrica', aplica: true, motivo: 'Disco con defecto', evidencias: ['https://taller.example/f1.jpg'] },
          { tarea_id: 2, sku: 'FRE-LIQUIDO', especialidad: 'frenos', causa: 'desgaste_normal', aplica: false },
        ],
        campo_de_mas: 'se descarta',
      },
    })) as { recibido: boolean; resultados: { tarea_id: number; valida: boolean; motivo: string }[] };
    expect(ack.recibido).toBe(true);
    expect(ack.resultados).toEqual([
      { tarea_id: 1, valida: true, motivo: expect.stringMatching(/^Garantía vigente hasta/) },
      { tarea_id: 2, valida: false, motivo: 'Según el diagnóstico es desgaste normal: la garantía no lo cubre' },
    ]);
    await ctx.app.get(WorkshopPartnerService).lastDelivery;
    const sim = ctx.app.get<SimulatedWorkshopClient>(WORKSHOP_CLIENT);
    expect(sim.warrantyResults.get('OT-0021')).toMatchObject({ codigo: 'OT-0021', resultados: ack.resultados, id_mensaje: expect.stringMatching(/-garantia$/) });
    expect(await rows(`SELECT estado_envio, intentos FROM validaciones_garantia WHERE codigo = 'OT-0021'`)).toEqual([{ estado_envio: 'enviado', intentos: 1 }]);

    // Garantía vencida (REL-1005): ninguna línea es válida.
    const expired = json(await client.callTool({
      name: 'validar_garantia',
      arguments: { codigo: 'OT-0018', id_relacion: 'REL-1005', vin: '9FBHJD204LM500005', servicios: [{ tarea_id: 9, especialidad: 'frenos', causa: 'defecto_fabrica', aplica: true }] },
    })) as { resultados: { valida: boolean; motivo: string }[] };
    expect(expired.resultados).toEqual([{ tarea_id: 9, valida: false, motivo: 'La garantía venció el 2023-02-17' }]);

    // Vigente, pero el taller (simulado) registra que los frenos de REL-1008 ya se intervinieron en otro taller (decisión 135).
    const tampered = json(await client.callTool({
      name: 'validar_garantia',
      arguments: { codigo: 'OT-0040', id_relacion: 'REL-1008', vin: 'KMHCT41DBRU800008', servicios: [{ tarea_id: 4, especialidad: 'frenos', causa: 'defecto_fabrica', aplica: true }] },
    })) as { resultados: { valida: boolean; motivo: string }[] };
    expect(tampered.resultados).toEqual([{ tarea_id: 4, valida: false, motivo: 'El componente de frenos ya tuvo un trabajo en otro taller el 2026-06-10: la garantía no lo cubre' }]);
    // La línea válida de arriba lleva la nota de que falta la tienda de repuestos (todavía sin conexión).
    expect(ack.resultados[0]!.motivo).toMatch(/falta verificar con la tienda de repuestos/);
    await client.close();
  });

  it('notificar_estado_vehiculo actualiza nuestra copia de la orden', async () => {
    await ctx.dataSource.query(
      `INSERT INTO ordenes_taller (codigo, id_relacion, sede_codigo, sede_nombre, fecha_cita, estado, por_garantia, origen) VALUES ('OT-0018', 'REL-1005', 'PL-FRENOS', 'Pulgas Locas Frenos y Suspensión', '2026-11-05T19:00:00Z', 'agendada', true, 'taller')`,
    );
    const client = await connect(workshopKey);
    const ack = json(await client.callTool({
      name: 'notificar_estado_vehiculo',
      arguments: { codigo: 'OT-0018', id_relacion: 'REL-1005', placa: 'MGL630', sede: 'PL-FRENOS', estado: 'en_diagnostico', nota: 'Un mecánico tomó la orden', fecha: '2026-11-05T14:05:00-05:00' },
    }));
    expect(ack).toEqual({ recibido: true, codigo: 'OT-0018', conocida: true, estado: 'en_diagnostico' });
    expect(await rows(`SELECT estado, ultima_nota FROM ordenes_taller WHERE codigo = 'OT-0018'`)).toEqual([{ estado: 'en_diagnostico', ultima_nota: 'Un mecánico tomó la orden' }]);
    await client.close();
  });

  it('la auditoría guarda solo identificadores: ni cédula, ni nombre, ni teléfono, ni VIN', async () => {
    const audit = await rows(`SELECT herramienta, args_resumen, pregunta, respuesta FROM intercambios_bots WHERE herramienta IN ('consultar_relacion', 'decodificar_vin', 'validar_garantia', 'notificar_estado_vehiculo')`);
    expect(audit.length).toBeGreaterThanOrEqual(5);
    expect(audit.find((r) => r.herramienta === 'consultar_relacion')!.args_resumen).toBe('id_relacion=REL-1005');
    expect(JSON.stringify(audit)).not.toMatch(/39765432|Marta|3009998877|9FBHJD204LM500005|1020304050|Laura/);
  });
});
