import { Inject, Injectable } from '@nestjs/common';
import { clean } from './workshop-text.js';
import { WORKSHOP_CLIENT, WorkshopBusinessError, WorkshopUnavailableError } from './workshop.types.js';
import type { Site, WorkshopClient } from './workshop.types.js';

const SITES_TTL_MS = 10 * 60 * 1000;

/** Sedes del taller (`listar_talleres`) con caché de 10 minutos: casi no cambian y se consultan en cada paso. */
@Injectable()
export class WorkshopSites {
  private cache: { at: number; sites: Site[] } | null = null;

  constructor(@Inject(WORKSHOP_CLIENT) private readonly workshop: WorkshopClient) {}

  async list(now = Date.now()): Promise<Site[]> {
    if (this.cache && now - this.cache.at < SITES_TTL_MS) return this.cache.sites;
    const sites = await this.workshop.listSites();
    this.cache = { at: now, sites };
    return sites;
  }

  /** La sede por código o id (sin importar mayúsculas), o null si el taller no la tiene activa. */
  async find(ref: string): Promise<Site | null> {
    const wanted = ref.trim().toUpperCase();
    const sites = await this.list();
    return sites.find((site) => site.activo !== false && (site.codigo.toUpperCase() === wanted || String(site.id) === wanted)) ?? null;
  }
}

/** Error del taller como dato para el modelo: un texto fijo de AutoMax, más el mensaje saneado si es de negocio. */
export function workshopError(error: unknown): { error: string } {
  if (error instanceof WorkshopBusinessError) return { error: `El taller respondió: «${clean(error.message, 300)}».` };
  if (error instanceof WorkshopUnavailableError) return { error: 'No pude comunicarme con el taller en este momento. Ofrece intentarlo de nuevo en un rato.' };
  throw error;
}
