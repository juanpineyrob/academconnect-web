import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '@env/environment';
import { TrabajoListItem } from '@features/repositorio/repositorio.models';
import { AdminUsuarioOption, TrabajoAdminImportRequest } from './admin.models';

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
