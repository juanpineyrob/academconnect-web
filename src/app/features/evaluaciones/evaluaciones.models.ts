export type EstadoAsignacion = 'ACTIVA' | 'COMPLETADA' | 'CANCELADA';
export type CriterioTipo = 'ESCALA' | 'SLIDER' | 'SELECCION' | 'BOOLEANO' | 'TEXTO';

export interface Asignacion {
  id: number;
  trabajoId: number;
  trabajoTitulo: string;
  versionamientoId: number;
  versionNumero: number;
  evaluadorId: number;
  evaluadorNombre: string;
  templateSnapshot: string | null; // JSON crudo; null hasta que el evaluador elige rúbrica
  asignadaEn: string;
  vencimientoEn: string;
  estado: EstadoAsignacion;
  createdAt: string;
}

export interface Criterio {
  codigo: string;
  nombre: string;
  tipo: CriterioTipo;
  peso: number;
  escalaMin: number;
  escalaMax: number;
  opciones?: string[]; // solo SELECCION
}

export interface TemplateSnapshot {
  criterios: Criterio[];
  umbralAprobacion: number;
}

export interface CalificacionCriterio {
  criterioCodigo: string;
  puntaje: number;
  comentario: string;
  comentarioPrivado: boolean;
}

export interface EvaluacionRequest {
  asignacionId: number;
  calificaciones: CalificacionCriterio[];
  comentarioGeneral: string;
}

export interface Evaluacion {
  id: number;
  asignacionId: number;
  estado: string;
  calificacionFinal: number;
  comentarioGeneral: string;
  calificaciones: CalificacionCriterio[];
  completadaEn: string;
}
