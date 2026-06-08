import { EstadoTrabajo, TipoTrabajo } from '@features/perfil/perfil.models';

export interface AdminUsuarioOption {
  id: number;
  nombre: string;
  email: string;
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
