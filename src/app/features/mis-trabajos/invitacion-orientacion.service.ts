import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import { Page } from '@core/http/page';
import {
  EstadoInvitacion,
  InvitacionOrientacion,
  InvitacionOrientacionRequest,
  RespuestaInvitacionRequest,
} from './invitacion-orientacion.models';

@Injectable({ providedIn: 'root' })
export class InvitacionOrientacionService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBase;

  enviar(payload: InvitacionOrientacionRequest): Observable<InvitacionOrientacion> {
    return this.http.post<InvitacionOrientacion>(`${this.api}/api/invitaciones-orientacion`, payload);
  }

  aceptar(id: number, body?: RespuestaInvitacionRequest): Observable<InvitacionOrientacion> {
    return this.http.post<InvitacionOrientacion>(
      `${this.api}/api/invitaciones-orientacion/${id}/aceptar`,
      body ?? {},
    );
  }

  rechazar(id: number, body?: RespuestaInvitacionRequest): Observable<InvitacionOrientacion> {
    return this.http.post<InvitacionOrientacion>(
      `${this.api}/api/invitaciones-orientacion/${id}/rechazar`,
      body ?? {},
    );
  }

  cancelar(id: number): Observable<InvitacionOrientacion> {
    return this.http.post<InvitacionOrientacion>(
      `${this.api}/api/invitaciones-orientacion/${id}/cancelar`, {});
  }

  listarRecibidas(
    estado: EstadoInvitacion | undefined, page: number, size: number,
  ): Observable<Page<InvitacionOrientacion>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (estado) params = params.set('estado', estado);
    return this.http.get<Page<InvitacionOrientacion>>(
      `${this.api}/api/invitaciones-orientacion`, { params });
  }

  listarPorTrabajo(trabajoId: number): Observable<InvitacionOrientacion[]> {
    return this.http.get<InvitacionOrientacion[]>(
      `${this.api}/api/trabajos/${trabajoId}/invitaciones`);
  }
}
