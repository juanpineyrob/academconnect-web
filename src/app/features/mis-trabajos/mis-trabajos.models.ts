import { TipoTrabajo } from '@features/perfil/perfil.models';

export interface TrabajoEstudianteRequest {
  titulo: string;
  descripcion?: string | null;
  tipo: TipoTrabajo;
  areaIds?: number[];
  keywords: string[];
}

export interface OrientadorSugerido {
  id: number;
  nombre: string;
  email: string;
  areasNombres: string[];
  cargaActiva: number;
  afinidad: number;
  score: number;
}
