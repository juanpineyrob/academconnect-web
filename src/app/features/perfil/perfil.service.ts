import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { environment } from '@env/environment';
import {
  AreaTematica,
  Perfil,
  PerfilPublico,
  PerfilUpdateRequest,
  Reconocimiento,
  StatsEvaluador,
  TrabajoResumen,
  UsuarioAreaTematica,
  UsuarioAreasRequest,
} from './perfil.models';

interface Page<T> {
  content: T[];
  totalElements: number;
}

@Injectable({ providedIn: 'root' })
export class PerfilService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBase;

  getMiPerfil(): Observable<Perfil> {
    return this.http.get<Perfil>(`${this.api}/me/perfil`);
  }

  putMiPerfil(payload: PerfilUpdateRequest): Observable<Perfil> {
    return this.http.put<Perfil>(`${this.api}/me/perfil`, payload);
  }

  uploadFotoPerfil(blob: Blob): Observable<{ fotoUrl: string }> {
    const fd = new FormData();
    const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png';
    fd.append('file', blob, `avatar.${ext}`);
    return this.http.post<{ fotoUrl: string }>(`${this.api}/me/perfil/foto`, fd);
  }

  putMisAreas(payload: UsuarioAreasRequest): Observable<UsuarioAreaTematica[]> {
    return this.http.put<UsuarioAreaTematica[]>(`${this.api}/me/areas`, payload);
  }

  listarAreas(): Observable<AreaTematica[]> {
    return this.http.get<AreaTematica[]>(`${this.api}/api/areas-tematicas`);
  }

  listarReconocimientos(usuarioId: number): Observable<Reconocimiento[]> {
    return this.http
      .get<Reconocimiento[]>(`${this.api}/api/usuarios/${usuarioId}/reconocimientos`)
      .pipe(catchError(() => of([] as Reconocimiento[])));
  }

  getStatsEvaluador(): Observable<StatsEvaluador | null> {
    return this.http
      .get<StatsEvaluador>(`${this.api}/evaluador/me/stats`)
      .pipe(catchError(() => of(null)));
  }

  getPerfilPublico(id: number): Observable<PerfilPublico> {
    return this.http.get<PerfilPublico>(`${this.api}/api/usuarios/${id}/perfil`);
  }

  getTrabajosAprobados(estudianteId: number, max = 5): Observable<TrabajoResumen[]> {
    const params = new HttpParams()
      .set('estudianteId', estudianteId)
      .set('soloPublicos', true)
      .set('size', max);
    return this.http
      .get<Page<TrabajoResumen>>(`${this.api}/api/trabajos/buscar`, { params })
      .pipe(
        map((page) => page.content),
        catchError(() => of([] as TrabajoResumen[])),
      );
  }
}
