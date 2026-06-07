export type EstadoSolicitud = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA';

export interface SolicitudVinculacion {
  id: number;
  trabajoId: number;
  trabajoTitulo: string;
  estudianteId: number;
  estudianteNombre: string;
  estado: EstadoSolicitud;
  motivo: string | null;
  respuesta: string | null;
  resueltaEn: string | null;
  createdAt: string;
}

export interface SolicitudVinculacionRequest {
  trabajoId: number;
  estudianteId: number;
  motivo?: string | null;
}

export interface RespuestaSolicitudRequest {
  respuesta?: string | null;
}
