export type EstadoInstancia = 'PENDIENTE' | 'EN_CURSO' | 'APROBADA' | 'REPROBADA';

export interface InstanciaEvaluacion {
  id: number;
  nombre: string;
  orden: number;
  intento: number;
  estado: EstadoInstancia;
  puntajeAgregado: number | null;
}
