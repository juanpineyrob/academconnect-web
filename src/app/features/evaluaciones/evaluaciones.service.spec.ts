import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { EvaluacionesService } from './evaluaciones.service';
import { environment } from '@env/environment';
import type { Asignacion, EvaluacionRequest } from './evaluaciones.models';

const api = environment.apiBase;

function mkAsignacion(id: number): Asignacion {
  return {
    id, trabajoId: 10, trabajoTitulo: 'T', versionamientoId: 5, versionNumero: 2,
    evaluadorId: 1, evaluadorNombre: 'E', templateSnapshot: '{}',
    asignadaEn: '2026-06-01T00:00:00Z', vencimientoEn: '2026-06-20T00:00:00Z',
    estado: 'ACTIVA', createdAt: '2026-06-01T00:00:00Z',
  };
}

describe('EvaluacionesService', () => {
  let service: EvaluacionesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EvaluacionesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('listarAsignaciones manda estado como query param', () => {
    service.listarAsignaciones('ACTIVA').subscribe();
    const req = http.expectOne(`${api}/evaluador/me/asignaciones?estado=ACTIVA`);
    expect(req.request.method).toBe('GET');
    req.flush([mkAsignacion(1)]);
  });

  it('listarAsignaciones sin estado no agrega query param', () => {
    service.listarAsignaciones().subscribe();
    const req = http.expectOne(`${api}/evaluador/me/asignaciones`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('obtenerAsignacion pega a /api/asignaciones/{id}', () => {
    service.obtenerAsignacion(7).subscribe();
    http.expectOne(`${api}/api/asignaciones/7`).flush(mkAsignacion(7));
  });

  it('cargarEvaluacion pega a /api/asignaciones/{id}/evaluacion', () => {
    service.cargarEvaluacion(7).subscribe();
    http.expectOne(`${api}/api/asignaciones/7/evaluacion`).flush({});
  });

  it('enviarEvaluacion hace POST a /api/evaluaciones con el body', () => {
    const body: EvaluacionRequest = { asignacionId: 7, calificaciones: [], comentarioGeneral: '' };
    service.enviarEvaluacion(body).subscribe();
    const req = http.expectOne(`${api}/api/evaluaciones`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('parseSnapshot devuelve el objeto cuando el JSON es válido', () => {
    const snap = service.parseSnapshot('{"criterios":[],"umbralAprobacion":6}');
    expect(snap).toEqual({ criterios: [], umbralAprobacion: 6 });
  });

  it('parseSnapshot devuelve null con JSON inválido o sin criterios', () => {
    expect(service.parseSnapshot('no-json')).toBeNull();
    expect(service.parseSnapshot('{"umbralAprobacion":6}')).toBeNull();
  });
});
