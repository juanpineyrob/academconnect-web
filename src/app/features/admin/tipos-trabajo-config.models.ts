export type TipoTrabajo = 'TCC' | 'TESIS' | 'PAPER' | 'MONOGRAFIA' | 'PROYECTO_INVESTIGACION';
export type ModoEvaluacion = 'SINCRONO' | 'ASINCRONO' | 'HIBRIDO';

export interface InstanciaConfig {
  orden: number;
  nombre: string;
  evaluadoresRequeridos: number;
  maxIntentos: number;
}

export interface TipoTrabajoConfig {
  tipo: TipoTrabajo;
  modoEvaluacion: ModoEvaluacion;
  evaluadoresDefault: number;
  instancias: InstanciaConfig[];
  secuencial: boolean;
}

export interface TipoTrabajoConfigPayload {
  modoEvaluacion: ModoEvaluacion;
  evaluadoresDefault: number;
  secuencial: boolean;
  instancias: { nombre: string; evaluadoresRequeridos: number; maxIntentos: number }[];
}
