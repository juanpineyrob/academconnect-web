import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '@env/environment';
import { Page } from '@core/http/page';
import { AreaTematica } from '@features/perfil/perfil.models';
import { TrabajoListItem } from '@features/repositorio/repositorio.models';
import { AdminUsuarioOption, AreaTematicaRequest, TrabajoAdminImportRequest } from './admin.models';

interface ProfesorResponse {
  id: number;
  nombre: string;
  email: string;
  activo: boolean;
}

interface EstudianteResponse {
  id: number;
  nombre: string;
  email: string;
  activo: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBase;

  importarTrabajo(payload: TrabajoAdminImportRequest): Observable<TrabajoListItem> {
    return this.http.post<TrabajoListItem>(`${this.api}/admin/trabajos`, payload);
  }

  /** Trabajos aprobados, incluidos los ocultos (para moderación). Soporta texto y paginación. */
  buscarAprobados(opts: { q?: string; page?: number; size?: number }): Observable<Page<TrabajoListItem>> {
    let params = new HttpParams().set('estado', 'APROBADO');
    const q = opts.q?.trim();
    if (q) params = params.set('q', q);
    params = params.set('page', String(opts.page ?? 0)).set('size', String(opts.size ?? 10));
    return this.http.get<Page<TrabajoListItem>>(`${this.api}/api/trabajos/buscar`, { params });
  }

  ocultarTrabajo(id: number): Observable<TrabajoListItem> {
    return this.http.post<TrabajoListItem>(`${this.api}/api/trabajos/${id}/ocultar`, {});
  }

  mostrarTrabajo(id: number): Observable<TrabajoListItem> {
    return this.http.post<TrabajoListItem>(`${this.api}/api/trabajos/${id}/mostrar`, {});
  }

  eliminarTrabajo(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/api/trabajos/${id}`);
  }

  // ---- Áreas temáticas ----

  /** Todas las áreas, incluidas las inactivas (admin). */
  listarAreas(): Observable<AreaTematica[]> {
    return this.http.get<AreaTematica[]>(`${this.api}/api/areas-tematicas/todas`);
  }

  crearArea(req: AreaTematicaRequest): Observable<AreaTematica> {
    return this.http.post<AreaTematica>(`${this.api}/api/areas-tematicas`, req);
  }

  actualizarArea(id: number, req: AreaTematicaRequest): Observable<AreaTematica> {
    return this.http.put<AreaTematica>(`${this.api}/api/areas-tematicas/${id}`, req);
  }

  activarArea(id: number): Observable<AreaTematica> {
    return this.http.post<AreaTematica>(`${this.api}/api/areas-tematicas/${id}/activar`, {});
  }

  desactivarArea(id: number): Observable<AreaTematica> {
    return this.http.post<AreaTematica>(`${this.api}/api/areas-tematicas/${id}/desactivar`, {});
  }

  listarProfesores(): Observable<AdminUsuarioOption[]> {
    return this.http
      .get<ProfesorResponse[]>(`${this.api}/api/profesores`)
      .pipe(map((rs) => rs.filter((r) => r.activo).map(toOption)));
  }

  listarEstudiantes(): Observable<AdminUsuarioOption[]> {
    return this.http
      .get<EstudianteResponse[]>(`${this.api}/api/estudiantes`)
      .pipe(map((rs) => rs.filter((r) => r.activo).map(toOption)));
  }
}

function toOption(r: { id: number; nombre: string; email: string }): AdminUsuarioOption {
  return { id: r.id, nombre: r.nombre, email: r.email };
}
