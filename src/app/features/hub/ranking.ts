import { Perfil } from '@features/perfil/perfil.models';
import { TrabajoListItem } from '@features/repositorio/repositorio.models';

/** Camino 2.2 — score client-side por overlap de áreas + match léxico de keywords. */
export function scoreTrabajo(t: TrabajoListItem, perfil: Perfil | null): number {
  if (!perfil) return 0;
  const perfilAreaIds = new Set(perfil.areas.map((a) => a.areaId));
  const trabajoAreaIds = new Set((t.areas ?? []).map((a) => a.id));
  let intersect = 0;
  trabajoAreaIds.forEach((id) => { if (perfilAreaIds.has(id)) intersect++; });

  const perfilAreaNombres = perfil.areas.map((a) => a.areaNombre.toLowerCase());
  let lexical = 0;
  for (const kw of t.keywords ?? []) {
    const k = kw.toLowerCase();
    if (perfilAreaNombres.some((n) => n.includes(k) || k.includes(n))) lexical++;
  }
  return intersect * 10 + lexical;
}

/** Comparator: score desc, empate por createdAt desc. */
export function compareTrabajos(a: TrabajoListItem, b: TrabajoListItem, perfil: Perfil | null): number {
  const diff = scoreTrabajo(b, perfil) - scoreTrabajo(a, perfil);
  if (diff !== 0) return diff;
  return b.createdAt.localeCompare(a.createdAt);
}
