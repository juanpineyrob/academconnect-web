import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';

import { environment } from '@env/environment';
import { Page } from '@core/http/page';
import { RespuestaInvitacionRequest, EstadoInvitacion } from './invitacion-orientacion.models';
import {
  CandidatoCoorientador,
  SolicitudCoorientacion,
  SolicitudCoorientacionRequest,
} from './solicitud-coorientacion.models';

interface UsuarioListItem { id: number; nombre: string; email: string; activo: boolean; }

@Injectable({ providedIn: 'root' })
export class SolicitudCoorientacionService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBase;
  private readonly base = `${this.api}/api/solicitudes-coorientacion`;

  crear(payload: SolicitudCoorientacionRequest): Observable<SolicitudCoorientacion> {
    return this.http.post<SolicitudCoorientacion>(this.base, payload);
  }

  aceptar(id: number, body?: RespuestaInvitacionRequest): Observable<SolicitudCoorientacion> {
    return this.http.post<SolicitudCoorientacion>(`${this.base}/${id}/aceptar`, body ?? {});
  }

  rechazar(id: number, body?: RespuestaInvitacionRequest): Observable<SolicitudCoorientacion> {
    return this.http.post<SolicitudCoorientacion>(`${this.base}/${id}/rechazar`, body ?? {});
  }

  cancelar(id: number): Observable<SolicitudCoorientacion> {
    return this.http.post<SolicitudCoorientacion>(`${this.base}/${id}/cancelar`, {});
  }

  listarRecibidas(
    estado: EstadoInvitacion | undefined, page: number, size: number,
  ): Observable<Page<SolicitudCoorientacion>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (estado) params = params.set('estado', estado);
    return this.http.get<Page<SolicitudCoorientacion>>(this.base, { params });
  }

  listarPorTrabajo(trabajoId: number): Observable<SolicitudCoorientacion[]> {
    return this.http.get<SolicitudCoorientacion[]>(`${this.base}/trabajos/${trabajoId}`);
  }

  listarCandidatos(): Observable<CandidatoCoorientador[]> {
    return forkJoin({
      profesores: this.http.get<UsuarioListItem[]>(`${this.api}/api/profesores`),
      externos: this.http.get<UsuarioListItem[]>(`${this.api}/api/externos`),
    }).pipe(
      map(({ profesores, externos }) => [
        ...profesores.map((p) => ({ id: p.id, nombre: p.nombre, email: p.email, rol: 'PROFESOR' as const })),
        ...externos.map((e) => ({ id: e.id, nombre: e.nombre, email: e.email, rol: 'EXTERNO' as const })),
      ]),
    );
  }
}
