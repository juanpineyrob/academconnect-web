import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
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

  listarAsignaciones(estado?: EstadoAsignacion): Observable<Asignacion[]> {
    let params = new HttpParams();
    if (estado) params = params.set('estado', estado);
    return this.http.get<Asignacion[]>(`${this.api}/evaluador/me/asignaciones`, { params });
  }

  obtenerAsignacion(id: number): Observable<Asignacion> {
    return this.http.get<Asignacion>(`${this.api}/api/asignaciones/${id}`);
  }

  cargarEvaluacion(asignacionId: number): Observable<Evaluacion> {
    return this.http.get<Evaluacion>(`${this.api}/api/asignaciones/${asignacionId}/evaluacion`);
  }

  enviarEvaluacion(req: EvaluacionRequest): Observable<Evaluacion> {
    return this.http.post<Evaluacion>(`${this.api}/api/evaluaciones`, req);
  }

  parseSnapshot(json: string): TemplateSnapshot | null {
    try {
      const obj = JSON.parse(json);
      if (!obj || !Array.isArray(obj.criterios)) return null;
      return obj as TemplateSnapshot;
    } catch {
      return null;
    }
  }
}
