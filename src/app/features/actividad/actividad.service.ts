import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { Page } from '@core/http/page';
import { isProblemDetail } from '@core/http/problem-detail';
import { environment } from '@env/environment';

import type { Actividad } from './actividad.models';

const EPOCH = '1970-01-01T00:00:00Z';

@Injectable({ providedIn: 'root' })
export class ActividadService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly feed = signal<Actividad[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  private readonly lastOpenedAt = signal<string>(EPOCH);

  readonly unreadCount = computed(() => {
    const cutoff = this.lastOpenedAt();
    return this.feed().filter((a) => a.createdAt > cutoff).length;
  });

  constructor() {
    effect(() => {
      const user = this.auth.currentUser();
      if (user) {
        this.lastOpenedAt.set(this.readStored(user.userId));
        this.refetch();
      } else {
        this.clear();
      }
    });
  }

  refetch(): void {
    this.loading.set(true);
    this.http
      .get<Actividad[]>(`${environment.apiBase}/me/actividad`, {
        params: new HttpParams().set('limit', 20),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.feed.set(items);
          this.loading.set(false);
          this.error.set(null);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          this.error.set(this.mapError(err));
        },
      });
  }

  /** Bitácora global para administración, paginada (no toca el feed reactivo del header). */
  fetchAdmin(page: number, size: number): Observable<Page<Actividad>> {
    return this.http.get<Page<Actividad>>(`${environment.apiBase}/admin/actividad`, {
      params: new HttpParams().set('page', page).set('size', size),
    });
  }

  markAllRead(): void {
    const userId = this.auth.currentUser()?.userId;
    if (userId == null) return;
    const now = new Date().toISOString();
    this.lastOpenedAt.set(now);
    localStorage.setItem(this.keyFor(userId), now);
  }

  clear(): void {
    this.feed.set([]);
    this.error.set(null);
    this.loading.set(false);
    this.lastOpenedAt.set(EPOCH);
  }

  private keyFor(userId: number): string {
    return `feed:lastOpenedAt:${userId}`;
  }

  private readStored(userId: number): string {
    return localStorage.getItem(this.keyFor(userId)) ?? EPOCH;
  }

  private mapError(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Sin conexión.';
    if (isProblemDetail(err.error) && err.error.detail) return err.error.detail;
    return 'No se pudo cargar la actividad.';
  }
}
