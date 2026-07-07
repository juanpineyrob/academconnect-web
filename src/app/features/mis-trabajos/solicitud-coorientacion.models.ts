import { EstadoInvitacion } from './invitacion-orientacion.models';

export interface SolicitudCoorientacion {
  id: number;
  trabajoId: number;
  trabajoTitulo: string;
  solicitanteId: number;
  solicitanteNombre: string;
  invitadoId: number;
  invitadoNombre: string;
  estado: EstadoInvitacion;
  motivo: string | null;
  respuesta: string | null;
  resueltaEn: string | null;
  createdAt: string;
}

export interface SolicitudCoorientacionRequest {
  trabajoId: number;
  usuarioId: number;
  motivo?: string | null;
}

export interface CandidatoCoorientador {
  id: number;
  nombre: string;
  email: string;
  rol: 'PROFESOR' | 'EXTERNO';
}
