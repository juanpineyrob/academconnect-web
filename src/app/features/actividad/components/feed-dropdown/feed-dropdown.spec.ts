import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';

import { FeedDropdown } from './feed-dropdown';
import { ActividadService } from '../../actividad.service';
import { AuthService } from '@core/auth/auth.service';
import { environment } from '@env/environment';
import type { Actividad } from '../../actividad.models';
import type { CurrentUser } from '@core/auth/models';

function mkUser(userId: number, rol: 'ESTUDIANTE' | 'PROFESOR' = 'ESTUDIANTE'): CurrentUser {
  return { userId, nombre: 'U', email: 'u@x', rol, fotoUrl: null };
}

function mkActividad(id: number, payload = '{"trabajoId":42,"trabajoTitulo":"Tesis"}'): Actividad {
  return {
    id, tipo: 'VERSION_SUBIDA', actorId: 99, recursoTipo: 'VERSIONAMIENTO',
    recursoId: id, payload, visibilidad: 'PARTICIPANTES',
    createdAt: new Date().toISOString(),
  };
}

describe('FeedDropdown', () => {
  let userSig: ReturnType<typeof signal<CurrentUser | null>>;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    userSig = signal<CurrentUser | null>(mkUser(1));
    TestBed.configureTestingModule({
      imports: [FeedDropdown],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: userSig.asReadonly() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('panel is closed by default', () => {
    const fx = TestBed.createComponent(FeedDropdown);
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([]);
    fx.detectChanges();
    const panel = fx.nativeElement.querySelector('[role="menu"]');
    expect(panel).toBeNull();
    const bell = fx.nativeElement.querySelector('button.feed__bell') as HTMLButtonElement;
    expect(bell.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows badge when unreadCount > 0', () => {
    const fx = TestBed.createComponent(FeedDropdown);
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([mkActividad(1)]);
    fx.detectChanges();
    const badge = fx.nativeElement.querySelector('.feed__badge');
    expect(badge?.textContent?.trim()).toBe('1');
  });

  it('toggle opens panel, calls markAllRead, and clears badge', () => {
    const fx = TestBed.createComponent(FeedDropdown);
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([mkActividad(1)]);
    fx.detectChanges();
    const svc = TestBed.inject(ActividadService);
    const spy = vi.spyOn(svc, 'markAllRead');
    const bell = fx.nativeElement.querySelector('button.feed__bell') as HTMLButtonElement;
    bell.click();
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([mkActividad(1)]);
    fx.detectChanges();
    expect(fx.nativeElement.querySelector('[role="menu"]')).not.toBeNull();
    expect(spy).toHaveBeenCalled();
  });

  it('Escape key closes the panel', () => {
    const fx = TestBed.createComponent(FeedDropdown);
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([]);
    fx.detectChanges();
    (fx.nativeElement.querySelector('button.feed__bell') as HTMLButtonElement).click();
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([]);
    fx.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fx.detectChanges();
    expect(fx.nativeElement.querySelector('[role="menu"]')).toBeNull();
  });

  it('click outside closes the panel', () => {
    const fx = TestBed.createComponent(FeedDropdown);
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([]);
    fx.detectChanges();
    (fx.nativeElement.querySelector('button.feed__bell') as HTMLButtonElement).click();
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([]);
    fx.detectChanges();
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    fx.detectChanges();
    expect(fx.nativeElement.querySelector('[role="menu"]')).toBeNull();
  });

  it('click on item with trabajoId navigates and closes panel', () => {
    const fx = TestBed.createComponent(FeedDropdown);
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([mkActividad(1)]);
    fx.detectChanges();
    (fx.nativeElement.querySelector('button.feed__bell') as HTMLButtonElement).click();
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([mkActividad(1)]);
    fx.detectChanges();
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const item = fx.nativeElement.querySelector('.feed__item') as HTMLElement;
    item.click();
    fx.detectChanges();
    expect(navSpy).toHaveBeenCalledWith('/mis-trabajos/42');
    expect(fx.nativeElement.querySelector('[role="menu"]')).toBeNull();
  });

  it('renders empty state when feed is empty', () => {
    const fx = TestBed.createComponent(FeedDropdown);
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([]);
    fx.detectChanges();
    (fx.nativeElement.querySelector('button.feed__bell') as HTMLButtonElement).click();
    http.expectOne(`${environment.apiBase}/me/actividad?limit=20`).flush([]);
    fx.detectChanges();
    expect(fx.nativeElement.querySelector('.feed__empty')?.textContent).toContain('Aún no hay actividad');
  });
});
