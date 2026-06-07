import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import { Page } from '@core/http/page';
import { TrabajoListItem } from '@features/repositorio/repositorio.models';
import { PublicarTrabajoRequest } from './mis-publicaciones.models';

@Injectable({ providedIn: 'root' })
export class MisPublicacionesService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBase;

  listarPorOrientador(orientadorId: number): Observable<Page<TrabajoListItem>> {
    const params = new HttpParams()
      .set('orientadorId', String(orientadorId))
      .set('size', '100')
      .set('sort', 'createdAt,desc');
    return this.http.get<Page<TrabajoListItem>>(`${this.api}/api/trabajos/buscar`, { params });
  }

  getById(id: number): Observable<TrabajoListItem> {
    return this.http.get<TrabajoListItem>(`${this.api}/api/trabajos/${id}`);
  }

  publicar(id: number, payload: PublicarTrabajoRequest): Observable<TrabajoListItem> {
    return this.http.post<TrabajoListItem>(
      `${this.api}/api/trabajos/${id}/publicar`, payload);
  }

  cerrar(id: number): Observable<TrabajoListItem> {
    return this.http.post<TrabajoListItem>(`${this.api}/api/trabajos/${id}/cerrar`, {});
  }
}
