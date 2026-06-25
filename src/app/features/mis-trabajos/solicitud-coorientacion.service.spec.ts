import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { SolicitudCoorientacionService } from './solicitud-coorientacion.service';
import { environment } from '@env/environment';

const api = environment.apiBase;

describe('SolicitudCoorientacionService', () => {
  let service: SolicitudCoorientacionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SolicitudCoorientacionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('crear pega POST a /api/solicitudes-coorientacion', () => {
    service.crear({ trabajoId: 7, usuarioId: 30, motivo: 'x' }).subscribe();
    const req = http.expectOne(`${api}/api/solicitudes-coorientacion`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('listarCandidatos combina profesores y externos y marca el rol', () => {
    let result: { id: number; rol: string }[] = [];
    service.listarCandidatos().subscribe((c) => (result = c));
    http.expectOne(`${api}/api/profesores`).flush([{ id: 1, nombre: 'P', email: 'p@x', activo: true }]);
    http.expectOne(`${api}/api/externos`).flush([{ id: 2, nombre: 'E', email: 'e@x', activo: true }]);
    expect(result).toEqual([
      { id: 1, nombre: 'P', email: 'p@x', rol: 'PROFESOR' },
      { id: 2, nombre: 'E', email: 'e@x', rol: 'EXTERNO' },
    ]);
  });
});
