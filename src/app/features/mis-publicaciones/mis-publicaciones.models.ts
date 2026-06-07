export type DuracionPublicacion = 7 | 15 | 30 | 60;

export interface PublicarTrabajoRequest {
  duracionDias: DuracionPublicacion;
}
