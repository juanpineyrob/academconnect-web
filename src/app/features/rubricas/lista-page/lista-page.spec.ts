import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ListaPage } from './lista-page';
import { AuthService } from '@core/auth/auth.service';
import { environment } from '@env/environment';

const api = environment.apiBase;

describe('ListaPage (rubricas)', () => {
  function create() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: AuthService, useValue: { currentUser: () => ({ userId: 7, rol: 'PROFESOR' }) } },
      ],
    });
    const fixture = TestBed.createComponent(ListaPage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    return { fixture, http };
  }

  function page(content: unknown[]) {
    return {
      content, totalElements: content.length, totalPages: 1, number: 0, size: 12,
      first: true, last: true, numberOfElements: content.length, empty: content.length === 0,
    };
  }

  it('carga la pestaña "mías" con scope=MIAS al iniciar', () => {
    const { fixture, http } = create();
    const req = http.expectOne((r) => r.url === `${api}/api/templates`);
    expect(req.request.params.get('scope')).toBe('MIAS');
    req.flush(page([
      { id: 1, nombre: 'Mía', descripcion: null, visibilidad: 'PRIVADO', autorId: 7, autorNombre: 'Yo', criterios: '[]', activo: true, umbralAprobacion: 6 },
    ]));
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    expect(cmp['rubricas']().length).toBe(1);
    expect(cmp['esMia'](cmp['rubricas']()[0])).toBe(true);
    http.verify();
  });

  it('al cambiar a "públicas" pide scope=PUBLICAS', () => {
    const { fixture, http } = create();
    http.expectOne((r) => r.url === `${api}/api/templates`).flush(page([]));
    fixture.detectChanges();
    fixture.componentInstance['cambiarTab']('publicas');
    const req = http.expectOne((r) => r.url === `${api}/api/templates`);
    expect(req.request.params.get('scope')).toBe('PUBLICAS');
    req.flush(page([]));
    http.verify();
  });
});
