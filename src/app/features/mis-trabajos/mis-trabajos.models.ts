import { TipoTrabajo } from '@features/perfil/perfil.models';

export interface TrabajoEstudianteRequest {
  titulo: string;
  descripcion?: string | null;
  tipo: TipoTrabajo;
  areaIds?: number[];
  keywords: string[];
}
