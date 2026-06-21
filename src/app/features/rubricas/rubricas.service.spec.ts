import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RubricasService } from './rubricas.service';
import { environment } from '@env/environment';

const api = environment.apiBase;

describe('RubricasService', () => {
  let service: RubricasService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RubricasService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('listar parsea criterios de cada rúbrica', () => {
    let result: number[] = [];
    service.listar().subscribe((rs) => (result = rs.map((r) => r.criterios.length)));
    const req = http.expectOne(`${api}/api/templates`);
    expect(req.request.method).toBe('GET');
    req.flush([
      {
        id: 1, nombre: 'R', descripcion: null, visibilidad: 'PUBLICO', autorId: 7, autorNombre: 'A',
        criterios: '[{"codigo":"c1","nombre":"X","tipo":"ESCALA","peso":1,"escalaMin":0,"escalaMax":10}]',
        activo: true, umbralAprobacion: 6,
      },
    ]);
    expect(result).toEqual([1]);
  });

  it('crear postea el request tal cual', () => {
    const reqBody = {
      nombre: 'R', descripcion: '', visibilidad: 'PRIVADO' as const,
      criterios: '[]', activo: true, umbralAprobacion: 6,
    };
    service.crear(reqBody).subscribe();
    const req = http.expectOne(`${api}/api/templates`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(reqBody);
    req.flush({ ...reqBody, id: 1, autorId: 7, autorNombre: 'A', descripcion: null });
  });
});
