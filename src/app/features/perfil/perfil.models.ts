import { Rol } from '@core/auth/models';

export type NivelExperticia = 'BAJO' | 'MEDIO' | 'ALTO';
export type ThesaurusOrigen = 'INTERNO' | 'EXTERNO' | string;
export type TipoTrabajo = 'TCC' | 'TESIS' | 'PAPER' | 'MONOGRAFIA' | 'PROYECTO_INVESTIGACION' | string;
export type EstadoTrabajo =
  | 'BORRADOR'
  | 'ABIERTO'
  | 'EN_DESARROLLO'
  | 'EN_EVALUACION'
  | 'APROBADO'
  | 'RECHAZADO'
  | 'CANCELADO'
  | string;

export interface UsuarioAreaTematica {
  areaId: number;
  areaNombre: string;
  nivelExperticia: NivelExperticia | null;
}

export interface AreaTematica {
  id: number;
  codigoExterno: string | null;
  nombre: string;
  parentId: number | null;
  thesaurusOrigen: ThesaurusOrigen;
  activo: boolean;
}

export interface Perfil {
  id: number;
  email: string;
  nombre: string;
  activo: boolean;
  rol: Rol;
  edad: number | null;
  ubicacion: string | null;
  biografia: string | null;
  fotoUrl: string | null;
  titulacion: string | null;
  cargo: string | null;
  institucion: string | null;
  titulo: string | null;
  areas: UsuarioAreaTematica[];
  trabajosPublicados: number;
  createdAt: string;
  updatedAt: string;
}

export interface PerfilPublico {
  id: number;
  nombre: string;
  rol: Rol;
  biografia: string | null;
  ubicacion: string | null;
  fotoUrl: string | null;
  titulacion: string | null;
  cargo: string | null;
  institucion: string | null;
  titulo: string | null;
  areas: UsuarioAreaTematica[];
  trabajosPublicados: number;
  createdAt: string;
}

export interface PerfilUpdateRequest {
  nombre: string;
  edad?: number | null;
  ubicacion?: string | null;
  biografia?: string | null;
  fotoUrl?: string | null;
  password?: string | null;
  titulacion?: string | null;
  cargo?: string | null;
  institucion?: string | null;
  titulo?: string | null;
}

export interface UsuarioAreasRequest {
  areas: { areaId: number; nivelExperticia: NivelExperticia }[];
}

export interface StatsEvaluador {
  evaluacionesCompletadas: number;
  tiempoMedioRespuestaDias: number;
  scoreMedioDado: number;
  aprobadosAportados: number;
  rechazadosAportados: number;
}

export interface TrabajoResumen {
  id: number;
  titulo: string;
  descripcion: string | null;
  tipo: TipoTrabajo;
  estado: EstadoTrabajo;
  orientadorNombre: string | null;
  areas: AreaTematica[];
  keywords: string[];
  puntajeAgregado: number | null;
  evaluadoEn: string | null;
  createdAt: string;
  updatedAt: string;
}
