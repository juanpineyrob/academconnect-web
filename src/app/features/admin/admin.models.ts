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

// ---- Solicitudes de cuenta ----

export type EstadoSolicitud = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';

export interface SolicitudCuenta {
  id: number;
  matricula: string;
  email: string;
  nombre: string;
  estado: EstadoSolicitud;
  motivoRechazo: string | null;
  createdAt: string;
}

// ---- Importación masiva de usuarios ----

export type ResultadoFila =
  | 'NUEVO'
  | 'EXISTE_ACTIVA'
  | 'EXISTE_INVITADA'
  | 'COLISION_EMAIL'
  | 'COLISION_MATRICULA'
  | 'ERROR_FORMATO';

export interface ImportItem {
  linea: number;
  matricula: string;
  email: string;
  nombre: string;
  resultado: ResultadoFila;
  detalle: string | null;
}

export interface ImportPreview {
  loteId: number;
  total: number;
  nuevos: number;
  existentes: number;
  errores: number;
  items: ImportItem[];
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

// ---- Métricas ----

export interface TrabajosPorEstado {
  estado: EstadoTrabajo;
  cantidad: number;
}

export interface CargaEvaluador {
  evaluadorId: number;
  nombre: string;
  cargaActiva: number;
}

export interface Metricas {
  trabajosPorEstado: TrabajosPorEstado[];
  tiempoPromedioEvaluacionHoras: number | null;
  cargaPorEvaluador: CargaEvaluador[];
  giniCarga: number;
}
