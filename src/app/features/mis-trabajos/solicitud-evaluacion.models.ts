import { EstadoInvitacion } from './invitacion-orientacion.models';

export interface SolicitudEvaluacion {
  id: number;
  trabajoId: number;
  trabajoTitulo: string;
  invitadoId: number;
  invitadoNombre: string;
  estado: EstadoInvitacion;
  motivo: string | null;
  respuesta: string | null;
  resueltaEn: string | null;
  createdAt: string;
}

export interface SolicitudEvaluacionRequest {
  trabajoId: number;
  usuarioId: number;
  motivo?: string | null;
}

export interface EvaluadorSugerido {
  evaluadorId: number;
  nombre: string;
  email: string;
  rol: 'PROFESOR' | 'EXTERNO';
  score: number;
  afinidad: number;
  cargaNorm: number;
  disponibilidad: number;
}

export interface SugerenciaBanca {
  evaluadoresRequeridos: number;
  sugerencias: EvaluadorSugerido[];
}
