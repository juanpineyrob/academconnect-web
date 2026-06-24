import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { MisTrabajosService } from './mis-trabajos.service';
import { environment } from '@env/environment';

const api = environment.apiBase;

describe('MisTrabajosService', () => {
  let service: MisTrabajosService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MisTrabajosService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sugerirOrientadores pega a /api/me/trabajos/{id}/sugerir-orientadores', () => {
    service.sugerirOrientadores(7).subscribe((res) => {
      expect(res.length).toBe(1);
      expect(res[0].nombre).toBe('Ana');
    });
    const req = http.expectOne(`${api}/api/me/trabajos/7/sugerir-orientadores`);
    expect(req.request.method).toBe('GET');
    req.flush([{
      id: 1, nombre: 'Ana', email: 'a@x.com',
      areasNombres: ['IA'], cargaActiva: 2, afinidad: 0.8, score: 0.74,
    }]);
  });
});
