import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import { TrabajoListItem } from '@features/repositorio/repositorio.models';
import { TrabajoEstudianteRequest } from './mis-trabajos.models';

@Injectable({ providedIn: 'root' })
export class MisTrabajosService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBase;

  listar(): Observable<TrabajoListItem[]> {
    return this.http.get<TrabajoListItem[]>(`${this.api}/api/me/trabajos`);
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
}
