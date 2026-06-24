import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import { Page } from '@core/http/page';
import { TrabajoListItem } from '@features/repositorio/repositorio.models';
import { OrientadorSugerido, TrabajoEstudianteRequest } from './mis-trabajos.models';

@Injectable({ providedIn: 'root' })
export class MisTrabajosService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBase;

  listar(page: number, size: number): Observable<Page<TrabajoListItem>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<Page<TrabajoListItem>>(`${this.api}/api/me/trabajos`, { params });
  }

  getById(id: number): Observable<TrabajoListItem> {
    return this.http.get<TrabajoListItem>(`${this.api}/api/me/trabajos/${id}`);
  }

  crear(payload: TrabajoEstudianteRequest): Observable<TrabajoListItem> {
    return this.http.post<TrabajoListItem>(`${this.api}/api/me/trabajos`, payload);
  }

  actualizar(id: number, payload: TrabajoEstudianteRequest): Observable<TrabajoListItem> {
    return this.http.put<TrabajoListItem>(`${this.api}/api/me/trabajos/${id}`, payload);
  }

  sugerirOrientadores(trabajoId: number): Observable<OrientadorSugerido[]> {
    return this.http.get<OrientadorSugerido[]>(
      `${this.api}/api/me/trabajos/${trabajoId}/sugerir-orientadores`);
  }
}
