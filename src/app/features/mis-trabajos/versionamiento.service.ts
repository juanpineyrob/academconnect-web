import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import { Versionamiento } from './versionamiento.models';

@Injectable({ providedIn: 'root' })
export class VersionamientoService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBase;

  listar(trabajoId: number, includeDeleted = false): Observable<Versionamiento[]> {
    let params = new HttpParams();
    if (includeDeleted) params = params.set('includeDeleted', 'true');
    return this.http.get<Versionamiento[]>(
      `${this.api}/api/trabajos/${trabajoId}/versiones`,
      { params },
    );
  }

  crear(trabajoId: number, file: File, comentario?: string | null): Observable<Versionamiento> {
    const fd = new FormData();
    fd.append('file', file);
    if (comentario) fd.append('comentario', comentario);
    return this.http.post<Versionamiento>(
      `${this.api}/api/trabajos/${trabajoId}/versiones`,
      fd,
    );
  }

  reemplazar(
    trabajoId: number,
    versionId: number,
    file: File,
    comentario?: string | null,
  ): Observable<Versionamiento> {
    const fd = new FormData();
    fd.append('file', file);
    if (comentario) fd.append('comentario', comentario);
    return this.http.put<Versionamiento>(
      `${this.api}/api/trabajos/${trabajoId}/versiones/${versionId}`,
      fd,
    );
  }

  eliminar(trabajoId: number, versionId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.api}/api/trabajos/${trabajoId}/versiones/${versionId}`,
    );
  }

  downloadUrl(trabajoId: number, versionId: number): string {
    return `${this.api}/api/trabajos/${trabajoId}/versiones/${versionId}/documento`;
  }
}
