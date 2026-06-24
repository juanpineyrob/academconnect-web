import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '@env/environment';
import { Rol } from '@core/auth/models';
import { Page } from '@core/http/page';
import { AreaTematica } from '@features/perfil/perfil.models';
import { TrabajoListItem } from '@features/repositorio/repositorio.models';
import {
  AdminUsuario,
  AdminUsuarioCreateRequest,
  AdminUsuarioOption,
  AdminUsuarioUpdateRequest,
  AreaTematicaRequest,
  EstadoSolicitud,
  ImportPreview,
  SolicitudCuenta,
  TrabajoAdminImportRequest,
} from './admin.models';

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

  /** Áreas (incluidas inactivas) paginadas y filtradas por texto (admin). */
  buscarAreas(opts: { q?: string; page?: number; size?: number }): Observable<Page<AreaTematica>> {
    let params = new HttpParams();
    const q = opts.q?.trim();
    if (q) params = params.set('q', q);
    params = params.set('page', String(opts.page ?? 0)).set('size', String(opts.size ?? 10));
    return this.http.get<Page<AreaTematica>>(`${this.api}/api/areas-tematicas/todas`, { params });
  }

  /** Lista completa (sin paginar) para poblar el selector de área padre. */
  listarAreasParaPadre(): Observable<AreaTematica[]> {
    const params = new HttpParams().set('size', '2000');
    return this.http
      .get<Page<AreaTematica>>(`${this.api}/api/areas-tematicas/todas`, { params })
      .pipe(map((p) => p.content));
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

  // ---- Usuarios ----

  buscarUsuarios(opts: { q?: string; rol?: Rol | ''; page?: number; size?: number }): Observable<Page<AdminUsuario>> {
    let params = new HttpParams();
    const q = opts.q?.trim();
    if (q) params = params.set('q', q);
    if (opts.rol) params = params.set('rol', opts.rol);
    params = params.set('page', String(opts.page ?? 0)).set('size', String(opts.size ?? 10));
    return this.http.get<Page<AdminUsuario>>(`${this.api}/admin/usuarios`, { params });
  }

  crearUsuario(req: AdminUsuarioCreateRequest): Observable<AdminUsuario> {
    return this.http.post<AdminUsuario>(`${this.api}/admin/usuarios`, req);
  }

  actualizarUsuario(id: number, req: AdminUsuarioUpdateRequest): Observable<AdminUsuario> {
    return this.http.put<AdminUsuario>(`${this.api}/admin/usuarios/${id}`, req);
  }

  activarUsuario(id: number): Observable<AdminUsuario> {
    return this.http.post<AdminUsuario>(`${this.api}/admin/usuarios/${id}/activar`, {});
  }

  desactivarUsuario(id: number): Observable<AdminUsuario> {
    return this.http.post<AdminUsuario>(`${this.api}/admin/usuarios/${id}/desactivar`, {});
  }

  resetPasswordUsuario(id: number, password: string): Observable<void> {
    return this.http.post<void>(`${this.api}/admin/usuarios/${id}/reset-password`, { password });
  }

  // ---- Solicitudes de cuenta ----

  buscarSolicitudes(opts: {
    estado?: EstadoSolicitud | '';
    q?: string;
    page?: number;
    size?: number;
  }): Observable<Page<SolicitudCuenta>> {
    let params = new HttpParams();
    if (opts.estado) params = params.set('estado', opts.estado);
    const q = opts.q?.trim();
    if (q) params = params.set('q', q);
    params = params.set('page', String(opts.page ?? 0)).set('size', String(opts.size ?? 10));
    return this.http.get<Page<SolicitudCuenta>>(`${this.api}/admin/solicitudes`, { params });
  }

  aprobarSolicitud(id: number): Observable<SolicitudCuenta> {
    return this.http.post<SolicitudCuenta>(`${this.api}/admin/solicitudes/${id}/aprobar`, {});
  }

  rechazarSolicitud(id: number, motivo: string): Observable<SolicitudCuenta> {
    return this.http.post<SolicitudCuenta>(`${this.api}/admin/solicitudes/${id}/rechazar`, {
      motivo,
    });
  }

  // ---- Importación masiva de usuarios ----

  previewImportacion(file: File): Observable<ImportPreview> {
    const data = new FormData();
    data.append('file', file);
    return this.http.post<ImportPreview>(`${this.api}/admin/importaciones/preview`, data);
  }

  confirmarImportacion(loteId: number, reenviarInvitadas: boolean): Observable<ImportPreview> {
    return this.http.post<ImportPreview>(
      `${this.api}/admin/importaciones/${loteId}/confirmar`,
      { reenviarInvitadas },
    );
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
