import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';

import { environment } from '@env/environment';

export interface PublicStats {
  trabajosPublicados: number;
  areasActivas: number;
  evaluadoresActivos: number;
}

@Injectable({ providedIn: 'root' })
export class PublicStatsService {
  private readonly http = inject(HttpClient);

  load(): Observable<PublicStats | null> {
    return this.http
      .get<PublicStats>(`${environment.apiBase}/public/stats`)
      .pipe(catchError(() => of(null)));
  }
}
