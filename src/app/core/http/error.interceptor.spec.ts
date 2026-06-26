import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';

import { errorInterceptor } from './error.interceptor';
import { AuthService } from '@core/auth/auth.service';
import type { CurrentUser } from '@core/auth/models';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpCtrl: HttpTestingController;
  let userSig: ReturnType<typeof signal<CurrentUser | null>>;
  const clearSession = vi.fn();
  const navigate = vi.fn();

  beforeEach(() => {
    userSig = signal<CurrentUser | null>(null);
    clearSession.mockClear();
    navigate.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser: userSig.asReadonly(), clearSession } },
        { provide: Router, useValue: { url: '/repositorio', navigate } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpCtrl = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpCtrl.verify());

  it('no redirige ni limpia sesión en 401 si era anónimo', () => {
    http.get('/x').subscribe({ next: () => undefined, error: () => undefined });
    httpCtrl.expectOne('/x').flush('', { status: 401, statusText: 'Unauthorized' });
    expect(navigate).not.toHaveBeenCalled();
    expect(clearSession).not.toHaveBeenCalled();
  });

  it('redirige a /login en 401 si había sesión activa', () => {
    userSig.set({ userId: 1, nombre: 'U', email: 'u@x', rol: 'ESTUDIANTE', fotoUrl: null });
    http.get('/y').subscribe({ next: () => undefined, error: () => undefined });
    httpCtrl.expectOne('/y').flush('', { status: 401, statusText: 'Unauthorized' });
    expect(clearSession).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/repositorio' } });
  });
});
