import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import { Page } from '@core/http/page';
import { RespuestaInvitacionRequest, EstadoInvitacion } from './invitacion-orientacion.models';
import { InstanciaEvaluacion } from './instancia-evaluacion.models';
import {
  SolicitudEvaluacion,
  SolicitudEvaluacionRequest,
  SugerenciaBanca,
} from './solicitud-evaluacion.models';

@Injectable({ providedIn: 'root' })
export class SolicitudEvaluacionService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBase;
  private readonly base = `${this.api}/api/solicitudes-evaluacion`;

  crear(payload: SolicitudEvaluacionRequest): Observable<SolicitudEvaluacion> {
    return this.http.post<SolicitudEvaluacion>(this.base, payload);
  }

  aceptar(id: number, body?: RespuestaInvitacionRequest): Observable<SolicitudEvaluacion> {
    return this.http.post<SolicitudEvaluacion>(`${this.base}/${id}/aceptar`, body ?? {});
  }

  rechazar(id: number, body?: RespuestaInvitacionRequest): Observable<SolicitudEvaluacion> {
    return this.http.post<SolicitudEvaluacion>(`${this.base}/${id}/rechazar`, body ?? {});
  }

  cancelar(id: number): Observable<SolicitudEvaluacion> {
    return this.http.post<SolicitudEvaluacion>(`${this.base}/${id}/cancelar`, {});
  }

  listarRecibidas(
    estado: EstadoInvitacion | undefined, page: number, size: number,
  ): Observable<Page<SolicitudEvaluacion>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (estado) params = params.set('estado', estado);
    return this.http.get<Page<SolicitudEvaluacion>>(this.base, { params });
  }

  listarPorTrabajo(trabajoId: number): Observable<SolicitudEvaluacion[]> {
    return this.http.get<SolicitudEvaluacion[]>(`${this.base}/trabajos/${trabajoId}`);
  }

  sugerirEvaluadores(trabajoId: number): Observable<SugerenciaBanca> {
    return this.http.get<SugerenciaBanca>(
      `${this.api}/api/me/trabajos/${trabajoId}/sugerir-evaluadores`);
  }

  listarInstancias(trabajoId: number): Observable<InstanciaEvaluacion[]> {
    return this.http.get<InstanciaEvaluacion[]>(
      `${this.api}/api/me/trabajos/${trabajoId}/instancias-evaluacion`);
  }
}
