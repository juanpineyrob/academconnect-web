import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { TiposTrabajoConfigService } from './tipos-trabajo-config.service';
import { environment } from '@env/environment';

const api = environment.apiBase;

describe('TiposTrabajoConfigService', () => {
  let service: TiposTrabajoConfigService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TiposTrabajoConfigService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('buscarPorTipo pega GET a /admin/tipos-trabajo-config/{tipo}', () => {
    service.buscarPorTipo('TCC').subscribe();
    const req = http.expectOne(`${api}/admin/tipos-trabajo-config/TCC`);
    expect(req.request.method).toBe('GET');
    req.flush({ tipo: 'TCC', modoEvaluacion: 'SINCRONO', evaluadoresDefault: 2, instancias: [] });
  });

  it('guardar pega PUT con el payload de instancias', () => {
    const payload = {
      modoEvaluacion: 'SINCRONO' as const, evaluadoresDefault: 2,
      instancias: [{ nombre: 'TCC1', evaluadoresRequeridos: 2 }],
    };
    service.guardar('TCC', payload).subscribe();
    const req = http.expectOne(`${api}/admin/tipos-trabajo-config/TCC`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.instancias.length).toBe(1);
    req.flush({ tipo: 'TCC', ...payload, instancias: [{ orden: 0, nombre: 'TCC1', evaluadoresRequeridos: 2 }] });
  });
});
