import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { SolicitarCuentaPage } from './solicitar-cuenta-page';
import { environment } from '@env/environment';

const api = environment.apiBase;

describe('SolicitarCuentaPage', () => {
  function create() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(SolicitarCuentaPage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    return { fixture, http };
  }

  it('no envía si el formulario es inválido', () => {
    const { fixture, http } = create();
    fixture.componentInstance['onSubmit']();
    http.expectNone(`${api}/auth/solicitudes`);
  });

  it('muestra confirmación tras enviar', () => {
    const { fixture, http } = create();
    const cmp = fixture.componentInstance;
    cmp['form'].setValue({ matricula: 'A1', nombre: 'Ana', email: 'a@x.test' });
    cmp['onSubmit']();
    http.expectOne(`${api}/auth/solicitudes`).flush({ mensaje: 'ok' });
    expect(cmp['enviado']()).toBe(true);
    http.verify();
  });

  it('muestra la misma confirmación aunque el backend falle (anti-enumeración)', () => {
    const { fixture, http } = create();
    const cmp = fixture.componentInstance;
    cmp['form'].setValue({ matricula: 'A1', nombre: 'Ana', email: 'a@x.test' });
    cmp['onSubmit']();
    http.expectOne(`${api}/auth/solicitudes`).flush('boom', { status: 500, statusText: 'Error' });
    expect(cmp['enviado']()).toBe(true);
    http.verify();
  });
});
