import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { SolicitudEvaluacionService } from './solicitud-evaluacion.service';
import { environment } from '@env/environment';

const api = environment.apiBase;

describe('SolicitudEvaluacionService', () => {
  let service: SolicitudEvaluacionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SolicitudEvaluacionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('crear pega POST a /api/solicitudes-evaluacion', () => {
    service.crear({ trabajoId: 7, usuarioId: 30, motivo: 'x' }).subscribe();
    const req = http.expectOne(`${api}/api/solicitudes-evaluacion`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('sugerirEvaluadores pega a /api/me/trabajos/{id}/sugerir-evaluadores', () => {
    let res: { evaluadoresRequeridos: number } | undefined;
    service.sugerirEvaluadores(7).subscribe((r) => (res = r));
    const req = http.expectOne(`${api}/api/me/trabajos/7/sugerir-evaluadores`);
    expect(req.request.method).toBe('GET');
    req.flush({ evaluadoresRequeridos: 3, sugerencias: [] });
    expect(res?.evaluadoresRequeridos).toBe(3);
  });

  it('listarPorTrabajo pega a /trabajos/{id}', () => {
    service.listarPorTrabajo(7).subscribe();
    http.expectOne(`${api}/api/solicitudes-evaluacion/trabajos/7`).flush([]);
  });
});
