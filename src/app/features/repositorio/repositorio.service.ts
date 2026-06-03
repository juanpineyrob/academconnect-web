import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import { Page } from '@core/http/page';
import { AreaTematica } from '@features/perfil/perfil.models';
import { TrabajoListItem, TrabajoSearchParams } from './repositorio.models';

@Injectable({ providedIn: 'root' })
export class RepositorioService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBase;

  buscar(params: TrabajoSearchParams): Observable<Page<TrabajoListItem>> {
    let httpParams = new HttpParams();
    if (params.q && params.q.trim().length > 0) {
      httpParams = httpParams.set('q', params.q.trim());
    }
    for (const id of params.areaId ?? []) {
      httpParams = httpParams.append('areaId', String(id));
    }
    for (const anio of params.anio ?? []) {
      httpParams = httpParams.append('anio', String(anio));
    }
    if (params.tipo) httpParams = httpParams.set('tipo', params.tipo);
    if (params.estado) httpParams = httpParams.set('estado', params.estado);
    httpParams = httpParams.set('page', String(params.page ?? 0));
    httpParams = httpParams.set('size', String(params.size ?? 12));
    if (params.sort) httpParams = httpParams.set('sort', params.sort);

    return this.http.get<Page<TrabajoListItem>>(`${this.api}/api/trabajos/buscar`, {
      params: httpParams,
    });
  }

  getById(id: number): Observable<TrabajoListItem> {
    return this.http.get<TrabajoListItem>(`${this.api}/api/trabajos/${id}`);
  }

  listarAreas(): Observable<AreaTematica[]> {
    return this.http.get<AreaTematica[]>(`${this.api}/api/areas-tematicas`);
  }
}
