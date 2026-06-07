import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import { Page } from '@core/http/page';
import { TrabajoListItem, TrabajoSearchParams } from '@features/repositorio/repositorio.models';

@Injectable({ providedIn: 'root' })
export class HubService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBase;

  buscarAbiertos(params: TrabajoSearchParams): Observable<Page<TrabajoListItem>> {
    let p = new HttpParams().set('estado', 'ABIERTO');
    if (params.q && params.q.trim()) p = p.set('q', params.q.trim());
    for (const id of params.areaId ?? []) p = p.append('areaId', String(id));
    for (const a of params.anio ?? []) p = p.append('anio', String(a));
    if (params.tipo) p = p.set('tipo', params.tipo);
    p = p.set('page', String(params.page ?? 0));
    p = p.set('size', String(params.size ?? 12));
    p = p.set('sort', params.sort ?? 'createdAt,desc');
    return this.http.get<Page<TrabajoListItem>>(`${this.api}/api/trabajos/buscar`, { params: p });
  }
}
