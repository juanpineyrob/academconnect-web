import { Rol } from '@core/auth/models';
import { EstadoTrabajo, ThesaurusOrigen, TipoTrabajo } from '@features/perfil/perfil.models';

export interface AdminUsuarioOption {
  id: number;
  nombre: string;
  email: string;
}

export interface AdminUsuario {
  id: number;
  email: string;
  matricula: string | null;
  nombre: string;
  rol: Rol;
  activo: boolean;
  edad: number | null;
  ubicacion: string | null;
  topeAsignaciones: number;
  titulacion: string | null;
  cargo: string | null;
  institucion: string | null;
  titulo: string | null;
}

export interface AdminUsuarioCreateRequest {
  rol: Rol;
  email: string;
  matricula: string;
  password: string;
  nombre: string;
  edad?: number | null;
  ubicacion?: string | null;
  titulacion?: string | null;
  cargo?: string | null;
  institucion?: string | null;
  titulo?: string | null;
}

export interface AdminUsuarioUpdateRequest {
  email: string;
  matricula: string;
  nombre: string;
  edad?: number | null;
  ubicacion?: string | null;
  topeAsignaciones?: number | null;
  titulacion?: string | null;
  cargo?: string | null;
  institucion?: string | null;
  titulo?: string | null;
}

export interface AreaTematicaRequest {
  nombre: string;
  codigoExterno?: string | null;
  thesaurusOrigen: ThesaurusOrigen;
  parentId?: number | null;
}

export interface TrabajoAdminImportRequest {
  titulo: string;
  descripcion?: string | null;
  tipo: TipoTrabajo;
  estado: EstadoTrabajo;
  orientadorId: number;
  estudianteId?: number | null;
  areaIds?: number[];
  keywords: string[];
  puntajeAgregado?: number | null;
  evaluadoEn?: string | null;
  archivoStorageKey?: string | null;
}
