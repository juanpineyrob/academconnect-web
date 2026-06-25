import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { SolicitarCoorientadorForm } from './solicitar-coorientador-form';
import { environment } from '@env/environment';

const api = environment.apiBase;

describe('SolicitarCoorientadorForm', () => {
  let fixture: ComponentFixture<SolicitarCoorientadorForm>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SolicitarCoorientadorForm],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SolicitarCoorientadorForm);
    fixture.componentRef.setInput('orientadorId', 20);
    fixture.detectChanges();
    http.expectOne(`${api}/api/profesores`).flush([
      { id: 20, nombre: 'Orientador', email: 'o@x', activo: true },
      { id: 30, nombre: 'Profe Co', email: 'c@x', activo: true },
    ]);
    http.expectOne(`${api}/api/externos`).flush([
      { id: 40, nombre: 'Externo Co', email: 'e@x', activo: true },
    ]);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('excluye al orientador de los candidatos', () => {
    const el: HTMLElement = fixture.nativeElement;
    const items = el.querySelectorAll('.coorientador-form__item');
    expect(items.length).toBe(2); // 30 y 40, no 20
  });

  it('el buscador filtra por nombre', () => {
    const cmp = fixture.componentInstance as unknown as { query: { set: (v: string) => void } };
    cmp.query.set('externo');
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.coorientador-form__item');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Externo Co');
  });

  it('al seleccionar y enviar emite { usuarioId, motivo }', () => {
    const cmp = fixture.componentInstance as unknown as {
      seleccionar: (id: number) => void; onSubmit: () => void;
      enviar: { subscribe: (cb: (v: { usuarioId: number; motivo: string | null }) => void) => void };
    };
    let emitted: { usuarioId: number; motivo: string | null } | undefined;
    cmp.enviar.subscribe((v) => (emitted = v));
    cmp.seleccionar(40);
    cmp.onSubmit();
    expect(emitted).toEqual({ usuarioId: 40, motivo: null });
  });
});
