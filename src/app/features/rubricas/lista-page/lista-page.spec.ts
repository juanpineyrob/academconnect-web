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

  it('separa mías y públicas según el autor', () => {
    const { fixture, http } = create();
    http.expectOne(`${api}/api/templates`).flush([
      { id: 1, nombre: 'Mía', descripcion: null, visibilidad: 'PRIVADO', autorId: 7, autorNombre: 'Yo', criterios: '[]', activo: true, umbralAprobacion: 6 },
      { id: 2, nombre: 'Ajena pública', descripcion: null, visibilidad: 'PUBLICO', autorId: 8, autorNombre: 'Otro', criterios: '[]', activo: true, umbralAprobacion: 6 },
    ]);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    expect(cmp['mias']().length).toBe(1);
    expect(cmp['publicas']().length).toBe(1);
    http.verify();
  });
});
