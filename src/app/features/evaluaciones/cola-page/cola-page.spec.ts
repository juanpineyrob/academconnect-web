import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { ColaPage } from './cola-page';
import { environment } from '@env/environment';
import type { Asignacion } from '../evaluaciones.models';

const api = environment.apiBase;

function mk(id: number, estado: Asignacion['estado'] = 'ACTIVA'): Asignacion {
  return {
    id, trabajoId: 10, trabajoTitulo: `T${id}`, versionamientoId: 5, versionNumero: 1,
    evaluadorId: 1, evaluadorNombre: 'E', templateSnapshot: '{}',
    asignadaEn: '2026-06-01T00:00:00Z', vencimientoEn: '2026-06-20T00:00:00Z',
    estado, createdAt: '2026-06-01T00:00:00Z',
  };
}

describe('ColaPage', () => {
  let http: HttpTestingController;

  function create() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(ColaPage);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('carga ACTIVA al iniciar', () => {
    const fixture = create();
    const req = http.expectOne(`${api}/evaluador/me/asignaciones?estado=ACTIVA`);
    req.flush([mk(1)]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('ac-asignacion-card').length).toBe(1);
  });

  it('cambiar de tab refetch con estado COMPLETADA', () => {
    const fixture = create();
    http.expectOne(`${api}/evaluador/me/asignaciones?estado=ACTIVA`).flush([mk(1)]);
    fixture.detectChanges();
    const tabs = (fixture.nativeElement as HTMLElement).querySelectorAll('[role="tab"]');
    (tabs[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne(`${api}/evaluador/me/asignaciones?estado=COMPLETADA`).flush([mk(2, 'COMPLETADA')]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('T2');
  });
});
