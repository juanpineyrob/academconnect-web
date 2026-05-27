import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';

import { environment } from '@env/environment';
import {
  AreaTematica,
  Perfil,
  PerfilUpdateRequest,
  Reconocimiento,
  StatsEvaluador,
  TrabajoResumen,
  UsuarioAreaTematica,
  UsuarioAreasRequest,
} from './perfil.models';

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

  getMisTrabajos(): Observable<TrabajoResumen[] | null> {
    return this.http
      .get<TrabajoResumen[]>(`${this.api}/estudiante/me/trabajos`)
      .pipe(catchError(() => of(null)));
  }
}
