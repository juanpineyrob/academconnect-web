import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RecuperarPasswordPage } from './recuperar-password-page';
import { environment } from '@env/environment';

const api = environment.apiBase;

describe('RecuperarPasswordPage', () => {
  function create() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(RecuperarPasswordPage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    return { fixture, http };
  }

  it('muestra confirmación genérica tras enviar', () => {
    const { fixture, http } = create();
    const cmp = fixture.componentInstance;
    cmp['form'].setValue({ email: 'a@x.test' });
    cmp['onSubmit']();
    const req = http.expectOne(`${api}/auth/password/recuperar`);
    expect(req.request.body).toEqual({ email: 'a@x.test' });
    req.flush({ mensaje: 'ok' });
    expect(cmp['enviado']()).toBe(true);
    http.verify();
  });

  it('muestra confirmación aunque falle (anti-enumeración)', () => {
    const { fixture, http } = create();
    const cmp = fixture.componentInstance;
    cmp['form'].setValue({ email: 'a@x.test' });
    cmp['onSubmit']();
    http.expectOne(`${api}/auth/password/recuperar`).flush('boom', { status: 500, statusText: 'E' });
    expect(cmp['enviado']()).toBe(true);
    http.verify();
  });
});
