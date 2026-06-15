import type { Actividad } from './actividad.models';

export interface GrupoActividad {
  label: 'Hoy' | 'Ayer' | 'Esta semana' | 'Antes';
  items: Actividad[];
}

export function groupByDay(items: Actividad[]): GrupoActividad[] {
  if (items.length === 0) return [];
  const now = new Date();
  const startToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();
  const startYesterday = startToday - 24 * 3600 * 1000;
  const startWeek = startToday - 7 * 24 * 3600 * 1000;

  const buckets: Record<GrupoActividad['label'], Actividad[]> = {
    Hoy: [], Ayer: [], 'Esta semana': [], Antes: [],
  };
  for (const a of items) {
    const t = new Date(a.createdAt).getTime();
    if (Number.isNaN(t)) { buckets.Antes.push(a); continue; }
    if (t >= startToday) buckets.Hoy.push(a);
    else if (t >= startYesterday) buckets.Ayer.push(a);
    else if (t >= startWeek) buckets['Esta semana'].push(a);
    else buckets.Antes.push(a);
  }

  const order: GrupoActividad['label'][] = ['Hoy', 'Ayer', 'Esta semana', 'Antes'];
  return order
    .filter((label) => buckets[label].length > 0)
    .map((label) => ({ label, items: buckets[label] }));
}
