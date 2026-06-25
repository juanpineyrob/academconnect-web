import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import {
  TipoTrabajo,
  TipoTrabajoConfig,
  TipoTrabajoConfigPayload,
} from './tipos-trabajo-config.models';

@Injectable({ providedIn: 'root' })
export class TiposTrabajoConfigService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/admin/tipos-trabajo-config`;

  listar(): Observable<TipoTrabajoConfig[]> {
    return this.http.get<TipoTrabajoConfig[]>(this.base);
  }

  buscarPorTipo(tipo: TipoTrabajo): Observable<TipoTrabajoConfig> {
    return this.http.get<TipoTrabajoConfig>(`${this.base}/${tipo}`);
  }

  guardar(tipo: TipoTrabajo, payload: TipoTrabajoConfigPayload): Observable<TipoTrabajoConfig> {
    return this.http.put<TipoTrabajoConfig>(`${this.base}/${tipo}`, payload);
  }
}
