import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute } from '@angular/router';

import { EvaluarPage } from './evaluar-page';
import { environment } from '@env/environment';
import type { Asignacion } from '../evaluaciones.models';

const api = environment.apiBase;

const SNAP = JSON.stringify({
  criterios: [{ codigo: 'C1', nombre: 'Claridad', tipo: 'ESCALA', peso: 1, escalaMin: 0, escalaMax: 10 }],
  umbralAprobacion: 6,
});

function mk(estado: Asignacion['estado']): Asignacion {
  return {
    id: 7, trabajoId: 10, trabajoTitulo: 'T7', versionamientoId: 5, versionNumero: 2,
    evaluadorId: 1, evaluadorNombre: 'E', templateSnapshot: SNAP,
    asignadaEn: '2026-06-01T00:00:00Z', vencimientoEn: '2026-06-20T00:00:00Z',
    estado, createdAt: '2026-06-01T00:00:00Z',
  };
}

describe('EvaluarPage', () => {
  let http: HttpTestingController;

  function create() {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['asignacionId', '7']]) } } },
      ],
    });
    const fixture = TestBed.createComponent(EvaluarPage);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('en ACTIVA arma el formulario editable y proyecta la nota', () => {
    const fixture = create();
    http.expectOne(`${api}/api/asignaciones/7`).flush(mk('ACTIVA'));
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp['form']()!.controls.criterios.at(0).controls.puntaje.setValue(8);
    cmp['form']()!.updateValueAndValidity();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Proyección');
  });

  it('en COMPLETADA carga la evaluación y queda readonly', () => {
    const fixture = create();
    http.expectOne(`${api}/api/asignaciones/7`).flush(mk('COMPLETADA'));
    http.expectOne(`${api}/api/asignaciones/7/evaluacion`).flush({
      id: 1, asignacionId: 7, estado: 'COMPLETADA', calificacionFinal: 8, comentarioGeneral: 'ok',
      calificaciones: [{ criterioCodigo: 'C1', puntaje: 8, comentario: 'bien', comentarioPrivado: true }],
      completadaEn: '2026-06-10T00:00:00Z',
    });
    fixture.detectChanges();
    expect(fixture.componentInstance['readonly']()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Evaluación enviada');
  });

  it('snapshot corrupto muestra error', () => {
    const fixture = create();
    const a = mk('ACTIVA');
    a.templateSnapshot = 'no-json';
    http.expectOne(`${api}/api/asignaciones/7`).flush(a);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('corrupto');
  });
});
