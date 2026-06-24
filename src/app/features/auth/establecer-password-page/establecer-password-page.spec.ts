import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { convertToParamMap } from '@angular/router';
import { EstablecerPasswordPage } from './establecer-password-page';
import { environment } from '@env/environment';

const api = environment.apiBase;

function routeStub(token: string | null) {
  return {
    snapshot: {
      queryParamMap: convertToParamMap(token === null ? {} : { token }),
    },
  };
}

describe('EstablecerPasswordPage', () => {
  function create(token: string | null) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: routeStub(token) },
      ],
    });
    const fixture = TestBed.createComponent(EstablecerPasswordPage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    return { fixture, http };
  }

  it('marca el estado inválido cuando no hay token', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: routeStub(null) },
      ],
    });
    const fixture = TestBed.createComponent(EstablecerPasswordPage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    expect(fixture.componentInstance['estado']()).toBe('invalido');
    http.verify();
  });

  it('verifica el token al iniciar y pasa a valido', () => {
    const { fixture, http } = create('tok');
    const req = http.expectOne(`${api}/auth/token/verificar`);
    expect(req.request.body).toEqual({ token: 'tok' });
    req.flush({ valido: true, proposito: 'RESET' });
    expect(fixture.componentInstance['estado']()).toBe('valido');
    expect(fixture.componentInstance['heading']()).toBe('Restablecer contraseña');
    http.verify();
  });

  it('token inválido pasa a estado invalido', () => {
    const { fixture, http } = create('tok');
    http.expectOne(`${api}/auth/token/verificar`).flush({ valido: false, proposito: null });
    expect(fixture.componentInstance['estado']()).toBe('invalido');
    http.verify();
  });

  it('establece la contraseña y pasa a completado', () => {
    const { fixture, http } = create('tok');
    http.expectOne(`${api}/auth/token/verificar`).flush({ valido: true, proposito: 'ACTIVACION' });
    const cmp = fixture.componentInstance;
    cmp['form'].setValue({ password: 'NuevaPass1', confirm: 'NuevaPass1' });
    cmp['onSubmit']();
    const req = http.expectOne(`${api}/auth/password/establecer`);
    expect(req.request.body).toEqual({ token: 'tok', password: 'NuevaPass1' });
    req.flush(null);
    expect(cmp['estado']()).toBe('completado');
    http.verify();
  });

  it('no envía si las contraseñas no coinciden', () => {
    const { fixture, http } = create('tok');
    http.expectOne(`${api}/auth/token/verificar`).flush({ valido: true, proposito: 'ACTIVACION' });
    const cmp = fixture.componentInstance;
    cmp['form'].setValue({ password: 'NuevaPass1', confirm: 'otra' });
    cmp['onSubmit']();
    http.expectNone(`${api}/auth/password/establecer`);
    http.verify();
  });
});
