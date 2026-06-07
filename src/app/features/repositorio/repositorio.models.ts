import { AreaTematica, EstadoTrabajo, TipoTrabajo } from '@features/perfil/perfil.models';

export interface TrabajoListItem {
  id: number;
  titulo: string;
  descripcion: string | null;
  tipo: TipoTrabajo;
  estado: EstadoTrabajo;
  orientadorId: number | null;
  orientadorNombre: string | null;
  estudianteId: number | null;
  estudianteNombre: string | null;
  areas: AreaTematica[];
  keywords: string[];
  coorientadoresNombres: string[];
  puntajeAgregado: number | null;
  evaluadoEn: string | null;
  expiraEn: string | null;
  archivoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrabajoSearchParams {
  q?: string | null;
  areaId?: number[];
  anio?: number[];
  tipo?: TipoTrabajo | null;
  estado?: EstadoTrabajo | null;
  page?: number;
  size?: number;
  sort?: string;
}

export const TIPO_LABEL: Record<string, string> = {
  TCC: 'TCC',
  TESIS: 'Tesis',
  PAPER: 'Paper',
  MONOGRAFIA: 'Monografía',
  PROYECTO_INVESTIGACION: 'Proyecto de investigación',
};

export const ESTADO_LABEL: Record<string, string> = {
  BORRADOR: 'Borrador',
  ABIERTO: 'Abierto',
  EN_DESARROLLO: 'En desarrollo',
  EN_EVALUACION: 'En evaluación',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
  CANCELADO: 'Cancelado',
};
