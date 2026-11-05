import type { Prediagnosis, Site } from './workshop.types.js';

export interface RoutedSite {
  site: Site;
  /** Por qué esa sede, en una frase para el cliente. */
  reason: string;
}

const isMaintenance = (site: Site): boolean => site.tipo === 'mantenimiento' || (site.especialidades ?? []).includes('mantenimiento_general');

/**
 * A qué sede va el carro según el prediagnóstico (decisión 131): la que sugiere el taller; si no sugiere una activa,
 * «revisión general» va a mantenimiento y «especializada» a la primera sede activa con esa especialidad.
 */
export function pickSite(prediagnosis: Prediagnosis, sites: Site[]): RoutedSite | null {
  const active = sites.filter((site) => site.activo !== false);
  const suggested = prediagnosis.sede_sugerida;
  if (suggested && (active.length === 0 || active.some((site) => site.codigo === suggested.codigo))) {
    return { site: active.find((site) => site.codigo === suggested.codigo) ?? suggested, reason: 'Es la sede que sugiere el taller para este caso' };
  }
  const specialist = active.find((site) => (site.especialidades ?? []).includes(prediagnosis.especialidad));
  if (prediagnosis.ruta === 'especializada' && specialist) {
    return { site: specialist, reason: `Es la sede especializada en ${prediagnosis.especialidad.replace(/_/g, ' ')}` };
  }
  const maintenance = active.find(isMaintenance);
  if (maintenance) return { site: maintenance, reason: 'Primero va a revisión general en mantenimiento; si hace falta, el taller lo remite a la sede especializada' };
  return specialist ? { site: specialist, reason: `Es la sede especializada en ${prediagnosis.especialidad.replace(/_/g, ' ')}` } : null;
}
