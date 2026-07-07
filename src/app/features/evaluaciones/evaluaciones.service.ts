import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import { Page } from '@core/http/page';
import type {
  Asignacion,
  EstadoAsignacion,
  Evaluacion,
  EvaluacionRequest,
  TemplateSnapshot,
} from './evaluaciones.models';

@Injectable({ providedIn: 'root' })
export class EvaluacionesService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBase;

  listarAsignaciones(estado: EstadoAsignacion, page: number, size: number): Observable<Page<Asignacion>> {
    const params = new HttpParams().set('estado', estado).set('page', page).set('size', size);
    return this.http.get<Page<Asignacion>>(`${this.api}/evaluador/me/asignaciones`, { params });
  }

  obtenerAsignacion(id: number): Observable<Asignacion> {
    return this.http.get<Asignacion>(`${this.api}/api/asignaciones/${id}`);
  }

  /** El evaluador elige/cambia la rúbrica de su asignación. templateId undefined ⇒ rúbrica por defecto. */
  seleccionarRubrica(asignacionId: number, templateId?: number): Observable<Asignacion> {
    return this.http.post<Asignacion>(
      `${this.api}/api/asignaciones/${asignacionId}/rubrica`,
      { templateEvaluacionId: templateId ?? null },
    );
  }

  cargarEvaluacion(asignacionId: number): Observable<Evaluacion> {
    return this.http.get<Evaluacion>(`${this.api}/api/asignaciones/${asignacionId}/evaluacion`);
  }

  enviarEvaluacion(req: EvaluacionRequest): Observable<Evaluacion> {
    return this.http.post<Evaluacion>(`${this.api}/api/evaluaciones`, req);
  }

  parseSnapshot(json: string | null): TemplateSnapshot | null {
    if (!json) return null;
    try {
      const obj = JSON.parse(json);
      if (!obj || !Array.isArray(obj.criterios)) return null;
      return obj as TemplateSnapshot;
    } catch {
      return null;
    }
  }
}
