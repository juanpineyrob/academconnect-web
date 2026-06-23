import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '@env/environment';
import { Page } from '@core/http/page';
import type { Criterio } from '../evaluaciones/evaluaciones.models';
import type { Rubrica, RubricaRequest, RubricaResponse } from './rubricas.models';

@Injectable({ providedIn: 'root' })
export class RubricasService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBase;

  /** Rúbricas paginadas por scope: 'MIAS' (propias) o 'PUBLICAS' (públicas de otros). */
  buscar(scope: 'MIAS' | 'PUBLICAS', page: number, size: number): Observable<Page<Rubrica>> {
    const params = new HttpParams().set('scope', scope).set('page', page).set('size', size);
    return this.http
      .get<Page<RubricaResponse>>(`${this.api}/api/templates`, { params })
      .pipe(map((p) => ({ ...p, content: p.content.map((r) => this.toRubrica(r)) })));
  }

  obtener(id: number): Observable<Rubrica> {
    return this.http
      .get<RubricaResponse>(`${this.api}/api/templates/${id}`)
      .pipe(map((r) => this.toRubrica(r)));
  }

  crear(req: RubricaRequest): Observable<RubricaResponse> {
    return this.http.post<RubricaResponse>(`${this.api}/api/templates`, req);
  }

  actualizar(id: number, req: RubricaRequest): Observable<RubricaResponse> {
    return this.http.put<RubricaResponse>(`${this.api}/api/templates/${id}`, req);
  }

  desactivar(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/api/templates/${id}`);
  }

  private toRubrica(r: RubricaResponse): Rubrica {
    let criterios: Criterio[] = [];
    try {
      const parsed = JSON.parse(r.criterios);
      if (Array.isArray(parsed)) criterios = parsed as Criterio[];
    } catch {
      criterios = [];
    }
    return {
      id: r.id,
      nombre: r.nombre,
      descripcion: r.descripcion ?? '',
      visibilidad: r.visibilidad,
      autorId: r.autorId,
      autorNombre: r.autorNombre,
      criterios,
      umbralAprobacion: r.umbralAprobacion,
      activo: r.activo,
    };
  }
}
