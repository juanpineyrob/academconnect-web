import type { Criterio, CriterioTipo } from '../evaluaciones/evaluaciones.models';
import type { RubricaRequest, Visibilidad } from './rubricas.models';

export interface CriterioDraft {
  nombre: string;
  tipo: CriterioTipo;
  peso: number;
  opciones: string[];
}

export interface RubricaDraft {
  nombre: string;
  descripcion: string;
  visibilidad: Visibilidad;
  escalaMin: number;
  escalaMax: number;
  umbralAprobacion: number;
  criterios: CriterioDraft[];
}

const PONDERABLE = (c: CriterioDraft): boolean => c.tipo !== 'TEXTO';

export function slugify(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function sumaPesos(criterios: CriterioDraft[]): number {
  return criterios.filter(PONDERABLE).reduce((t, c) => t + (c.peso || 0), 0);
}

export function distribuirEquitativamente(criterios: CriterioDraft[]): number[] {
  const ponderables = criterios.filter(PONDERABLE).length;
  const cada = ponderables > 0 ? 1 / ponderables : 0;
  return criterios.map((c) => (PONDERABLE(c) ? cada : 0));
}

export function validarRubrica(d: RubricaDraft): string[] {
  const errores: string[] = [];
  if (!d.nombre.trim()) errores.push('El nombre es obligatorio');
  if (d.escalaMin >= d.escalaMax) errores.push('La escala mínima debe ser menor que la máxima');
  if (d.criterios.length === 0) errores.push('Agregá al menos un criterio');

  for (const c of d.criterios) {
    if (!c.nombre.trim()) errores.push('Cada criterio necesita un nombre');
    if (c.tipo === 'SELECCION' && c.opciones.filter((o) => o.trim()).length === 0) {
      errores.push(`El criterio "${c.nombre}" (SELECCIÓN) necesita opciones`);
    }
  }

  const suma = sumaPesos(d.criterios);
  if (d.criterios.some(PONDERABLE) && Math.abs(suma - 1) > 0.001) {
    errores.push(`Los pesos deben sumar 100% (actual: ${Math.round(suma * 100)}%)`);
  }
  if (d.umbralAprobacion < d.escalaMin || d.umbralAprobacion > d.escalaMax) {
    errores.push(`El umbral debe estar entre ${d.escalaMin} y ${d.escalaMax}`);
  }
  return errores;
}

export function toRubricaRequest(d: RubricaDraft): RubricaRequest {
  const criterios: Criterio[] = d.criterios.map((c) => {
    const base: Criterio = {
      codigo: slugify(c.nombre),
      nombre: c.nombre,
      tipo: c.tipo,
      peso: c.tipo === 'TEXTO' ? 0 : c.peso,
      escalaMin: d.escalaMin,
      escalaMax: d.escalaMax,
    };
    if (c.tipo === 'SELECCION') base.opciones = c.opciones.filter((o) => o.trim());
    return base;
  });
  return {
    nombre: d.nombre.trim(),
    descripcion: d.descripcion.trim(),
    visibilidad: d.visibilidad,
    criterios: JSON.stringify(criterios),
    activo: true,
    umbralAprobacion: d.umbralAprobacion,
  };
}
