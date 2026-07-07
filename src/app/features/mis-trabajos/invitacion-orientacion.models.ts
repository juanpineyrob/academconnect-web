export type EstadoInvitacion = 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA' | 'CANCELADA';

export interface InvitacionOrientacion {
  id: number;
  trabajoId: number;
  trabajoTitulo: string;
  solicitanteId: number;
  solicitanteNombre: string;
  profesorId: number;
  profesorNombre: string;
  estado: EstadoInvitacion;
  motivo: string | null;
  respuesta: string | null;
  resueltaEn: string | null;
  createdAt: string;
}

export interface InvitacionOrientacionRequest {
  trabajoId: number;
  profesorId: number;
  motivo?: string | null;
}

export interface RespuestaInvitacionRequest {
  respuesta?: string | null;
}
