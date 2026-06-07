import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import {
  RespuestaSolicitudRequest,
  SolicitudVinculacion,
  SolicitudVinculacionRequest,
} from './solicitud-vinculacion.models';

@Injectable({ providedIn: 'root' })
export class SolicitudVinculacionService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBase;

  listarPorTrabajo(trabajoId: number): Observable<SolicitudVinculacion[]> {
    return this.http.get<SolicitudVinculacion[]>(
      `${this.api}/api/trabajos/${trabajoId}/solicitudes`);
  }

  listarMis(): Observable<SolicitudVinculacion[]> {
    return this.http.get<SolicitudVinculacion[]>(`${this.api}/api/me/solicitudes`);
  }

  listarRecibidas(): Observable<SolicitudVinculacion[]> {
    return this.http.get<SolicitudVinculacion[]>(
      `${this.api}/api/me/solicitudes-recibidas`);
  }

  enviar(payload: SolicitudVinculacionRequest): Observable<SolicitudVinculacion> {
    return this.http.post<SolicitudVinculacion>(`${this.api}/api/solicitudes`, payload);
  }

  aceptar(id: number, body?: RespuestaSolicitudRequest): Observable<SolicitudVinculacion> {
    return this.http.post<SolicitudVinculacion>(
      `${this.api}/api/solicitudes/${id}/aceptar`, body ?? {});
  }

  rechazar(id: number, body?: RespuestaSolicitudRequest): Observable<SolicitudVinculacion> {
    return this.http.post<SolicitudVinculacion>(
      `${this.api}/api/solicitudes/${id}/rechazar`, body ?? {});
  }

  cancelar(id: number): Observable<SolicitudVinculacion> {
    return this.http.post<SolicitudVinculacion>(
      `${this.api}/api/solicitudes/${id}/cancelar`, {});
  }
}
