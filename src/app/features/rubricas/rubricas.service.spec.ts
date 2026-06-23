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

  it('buscar parsea criterios de cada rúbrica de la página', () => {
    let result: number[] = [];
    service.buscar('MIAS', 0, 12).subscribe((p) => (result = p.content.map((r) => r.criterios.length)));
    const req = http.expectOne((r) => r.url === `${api}/api/templates`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('scope')).toBe('MIAS');
    req.flush({
      content: [
        {
          id: 1, nombre: 'R', descripcion: null, visibilidad: 'PUBLICO', autorId: 7, autorNombre: 'A',
          criterios: '[{"codigo":"c1","nombre":"X","tipo":"ESCALA","peso":1,"escalaMin":0,"escalaMax":10}]',
          activo: true, umbralAprobacion: 6,
        },
      ],
      totalElements: 1, totalPages: 1, number: 0, size: 12, first: true, last: true,
      numberOfElements: 1, empty: false,
    });
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
