import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, firstValueFrom, of, tap } from 'rxjs';

import { environment } from '@env/environment';
import { AuthResponse, CurrentUser, LoginRequest, Rol } from './models';

interface BootstrapResponse {
  id: number;
  email: string;
  nombre: string;
  rol: Rol;
  fotoUrl: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _currentUser = signal<CurrentUser | null>(null);
  readonly currentUser = this._currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this._currentUser() !== null);

  login(payload: LoginRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${environment.apiBase}/auth/login`, payload, { withCredentials: true })
      .pipe(
        tap((res) => {
          this._currentUser.set({
            userId: res.userId,
            nombre: res.nombre,
            email: res.email,
            rol: res.rol,
            fotoUrl: res.fotoUrl,
          });
        }),
      );
  }

  logout(): Observable<void> {
    return this.http
      .post<void>(`${environment.apiBase}/auth/logout`, {}, { withCredentials: true })
      .pipe(
        catchError(() => of(void 0)),
        tap(() => {
          this.clearSession();
          void this.router.navigate(['/login']);
        }),
      );
  }

  async bootstrap(): Promise<void> {
    try {
      const me = await firstValueFrom(
        this.http.get<BootstrapResponse>(`${environment.apiBase}/me/perfil`, {
          withCredentials: true,
        }),
      );
      this._currentUser.set({
        userId: me.id,
        nombre: me.nombre,
        email: me.email,
        rol: me.rol,
        fotoUrl: me.fotoUrl,
      });
    } catch {
      this._currentUser.set(null);
    }
  }

  clearSession(): void {
    this._currentUser.set(null);
  }

  patchCurrentUser(partial: Partial<CurrentUser>): void {
    const current = this._currentUser();
    if (current) {
      this._currentUser.set({ ...current, ...partial });
    }
  }
}
