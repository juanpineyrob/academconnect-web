import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { SolicitarEvaluadoresForm } from './solicitar-evaluadores-form';
import { environment } from '@env/environment';

const api = environment.apiBase;

const BANCA = {
  evaluadoresRequeridos: 3,
  sugerencias: [
    { evaluadorId: 30, nombre: 'Eval A', email: 'a@x', rol: 'PROFESOR', score: 0.8, afinidad: 0.8, cargaNorm: 0.2, disponibilidad: 1 },
    { evaluadorId: 20, nombre: 'Orientador', email: 'o@x', rol: 'PROFESOR', score: 0.5, afinidad: 0.5, cargaNorm: 0.1, disponibilidad: 1 },
    { evaluadorId: 40, nombre: 'Eval B', email: 'b@x', rol: 'EXTERNO', score: 0.4, afinidad: 0.3, cargaNorm: 0.3, disponibilidad: 1 },
  ],
};

describe('SolicitarEvaluadoresForm', () => {
  let fixture: ComponentFixture<SolicitarEvaluadoresForm>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SolicitarEvaluadoresForm],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SolicitarEvaluadoresForm);
    fixture.componentRef.setInput('trabajoId', 7);
    fixture.componentRef.setInput('orientadorId', 20);
    fixture.componentRef.setInput('excluidos', [40]);
    fixture.detectChanges();
    http.expectOne(`${api}/api/me/trabajos/7/sugerir-evaluadores`).flush(BANCA);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('excluye al orientador y a los excluidos de los candidatos', () => {
    const items = fixture.nativeElement.querySelectorAll('.eval-form__item');
    expect(items.length).toBe(1); // 30; 20 (orientador) y 40 (excluido) fuera
    expect(items[0].textContent).toContain('Eval A');
  });

  it('al seleccionar y enviar emite { usuarioId, motivo }', () => {
    const cmp = fixture.componentInstance as unknown as {
      seleccionar: (id: number) => void; onSubmit: () => void;
      enviar: { subscribe: (cb: (v: { usuarioId: number; motivo: string | null }) => void) => void };
    };
    let emitted: { usuarioId: number; motivo: string | null } | undefined;
    cmp.enviar.subscribe((v) => (emitted = v));
    cmp.seleccionar(30);
    cmp.onSubmit();
    expect(emitted).toEqual({ usuarioId: 30, motivo: null });
  });
});
