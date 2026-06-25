export type TipoTrabajo = 'TCC' | 'TESIS' | 'PAPER' | 'MONOGRAFIA' | 'PROYECTO_INVESTIGACION';
export type ModoEvaluacion = 'SINCRONO' | 'ASINCRONO' | 'HIBRIDO';

export interface InstanciaConfig {
  orden: number;
  nombre: string;
  evaluadoresRequeridos: number;
}

export interface TipoTrabajoConfig {
  tipo: TipoTrabajo;
  modoEvaluacion: ModoEvaluacion;
  evaluadoresDefault: number;
  instancias: InstanciaConfig[];
}

export interface TipoTrabajoConfigPayload {
  modoEvaluacion: ModoEvaluacion;
  evaluadoresDefault: number;
  instancias: { nombre: string; evaluadoresRequeridos: number }[];
}
