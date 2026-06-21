import type { Criterio } from '../evaluaciones/evaluaciones.models';

export type Visibilidad = 'PUBLICO' | 'PRIVADO';

export interface Rubrica {
  id: number;
  nombre: string;
  descripcion: string;
  visibilidad: Visibilidad;
  autorId: number | null;
  autorNombre: string | null;
  criterios: Criterio[];
  umbralAprobacion: number;
  activo: boolean;
}

/** Lo que devuelve el backend: `criterios` es JSON crudo. */
export interface RubricaResponse {
  id: number;
  nombre: string;
  descripcion: string | null;
  visibilidad: Visibilidad;
  autorId: number | null;
  autorNombre: string | null;
  criterios: string;
  activo: boolean;
  umbralAprobacion: number;
}

export interface RubricaRequest {
  nombre: string;
  descripcion: string;
  visibilidad: Visibilidad;
  criterios: string; // JSON serializado
  activo: boolean;
  umbralAprobacion: number;
}
