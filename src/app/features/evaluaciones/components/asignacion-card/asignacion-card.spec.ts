import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AsignacionCard } from './asignacion-card';
import type { Asignacion } from '../../evaluaciones.models';

function mk(over: Partial<Asignacion> = {}): Asignacion {
  return {
    id: 1, trabajoId: 10, trabajoTitulo: 'Trabajo X', versionamientoId: 5, versionNumero: 2,
    evaluadorId: 1, evaluadorNombre: 'E', templateSnapshot: '{}',
    asignadaEn: '2026-06-01T00:00:00Z', vencimientoEn: '2026-06-20T00:00:00Z',
    estado: 'ACTIVA', createdAt: '2026-06-01T00:00:00Z', ...over,
  };
}

describe('AsignacionCard', () => {
  function render(a: Asignacion) {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(AsignacionCard);
    fixture.componentRef.setInput('asignacion', a);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('muestra el título y linkea a /evaluaciones/:id', () => {
    const el = render(mk());
    expect(el.querySelector('.card__titulo')?.textContent).toContain('Trabajo X');
    expect(el.querySelector('a')?.getAttribute('href')).toContain('/evaluaciones/1');
  });

  it('marca como vencida una ACTIVA con vencimiento pasado', () => {
    const el = render(mk({ vencimientoEn: '2000-01-01T00:00:00Z' }));
    expect(el.querySelector('.card__venc--alerta')).toBeTruthy();
  });

  it('no marca como vencida una asignación sin fecha límite', () => {
    const el = render(mk({ vencimientoEn: null }));
    expect(el.querySelector('.card__venc--alerta')).toBeFalsy();
    expect(el.querySelector('.card__venc')?.textContent).toContain('Sin fecha límite');
  });
});
