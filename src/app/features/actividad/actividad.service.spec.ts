import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';

import { ActividadService } from './actividad.service';
import { AuthService } from '@core/auth/auth.service';
import { environment } from '@env/environment';
import type { Actividad } from './actividad.models';
import type { CurrentUser } from '@core/auth/models';

function mkUser(userId: number): CurrentUser {
  return { userId, nombre: 'U', email: 'u@x', rol: 'ESTUDIANTE', fotoUrl: null };
}

function mkActividad(id: number, createdAt: string): Actividad {
  return {
    id, tipo: 'VERSION_SUBIDA', actorId: 1, recursoTipo: 'VERSIONAMIENTO',
    recursoId: id, payload: '{}', visibilidad: 'PARTICIPANTES', createdAt,
  };
}

describe('ActividadService', () => {
  let service: ActividadService;
  let http: HttpTestingController;
  let userSig: ReturnType<typeof signal<CurrentUser | null>>;

  beforeEach(() => {
    localStorage.clear();
    userSig = signal<CurrentUser | null>(null);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser: userSig.asReadonly() } },
      ],
    });
    service = TestBed.inject(ActividadService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts with empty feed, no loading, no error', () => {
    expect(service.feed()).toEqual([]);
    expect(service.loading()).toBe(false);
    expect(service.error()).toBeNull();
  });

  it('refetch() loads items', () => {
    userSig.set(mkUser(1));
    TestBed.tick();
    const req = http.expectOne(`${environment.apiBase}/me/actividad?limit=20`);
    expect(req.request.method).toBe('GET');
    const items = [mkActividad(1, '2026-06-15T10:00:00Z')];
    req.flush(items);
    expect(service.feed()).toEqual(items);
    expect(service.loading()).toBe(false);
    expect(service.error()).toBeNull();
  });

  it('refetch() sets error on HTTP failure', () => {
    userSig.set(mkUser(1));
    TestBed.tick();
    const req = http.expectOne(`${environment.apiBase}/me/actividad?limit=20`);
    req.flush({ detail: 'boom' }, { status: 500, statusText: 'Server Error' });
    expect(service.feed()).toEqual([]);
    expect(service.error()).toBeTruthy();
  });

  it('unreadCount counts items newer than lastOpenedAt', () => {
    userSig.set(mkUser(1));
    TestBed.tick();
    const req = http.expectOne(`${environment.apiBase}/me/actividad?limit=20`);
    req.flush([
      mkActividad(1, '2026-06-15T10:00:00Z'),
      mkActividad(2, '2026-06-15T09:00:00Z'),
      mkActividad(3, '2026-06-14T10:00:00Z'),
    ]);
    expect(service.unreadCount()).toBe(3);
  });

  it('markAllRead() persists timestamp per userId and zeroes unreadCount', () => {
    userSig.set(mkUser(42));
    TestBed.tick();
    const req = http.expectOne(`${environment.apiBase}/me/actividad?limit=20`);
    req.flush([mkActividad(1, '2026-06-15T10:00:00Z')]);
    service.markAllRead();
    expect(service.unreadCount()).toBe(0);
    expect(localStorage.getItem('feed:lastOpenedAt:42')).toBeTruthy();
  });

  it('clear() empties feed when user logs out', () => {
    userSig.set(mkUser(1));
    TestBed.tick();
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`)
        .flush([mkActividad(1, '2026-06-15T10:00:00Z')]);
    userSig.set(null);
    TestBed.tick();
    expect(service.feed()).toEqual([]);
  });

  it('uses per-user lastOpenedAt key (no leak between users)', () => {
    localStorage.setItem('feed:lastOpenedAt:7', '2099-01-01T00:00:00Z');
    userSig.set(mkUser(1));
    TestBed.tick();
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`)
        .flush([mkActividad(1, '2026-06-15T10:00:00Z')]);
    expect(service.unreadCount()).toBe(1);
  });
});
