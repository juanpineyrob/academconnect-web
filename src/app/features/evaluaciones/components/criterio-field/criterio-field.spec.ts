import { TestBed } from '@angular/core/testing';
import { CriterioField } from './criterio-field';
import { buildCriterioGroup } from '../../evaluacion-form.builder';
import type { Criterio } from '../../evaluaciones.models';

const escala: Criterio = { codigo: 'C1', nombre: 'Claridad', tipo: 'ESCALA', peso: 0.5, escalaMin: 0, escalaMax: 5 };
const seleccion: Criterio = {
  codigo: 'C3', nombre: 'Nivel', tipo: 'SELECCION', peso: 1, escalaMin: 0, escalaMax: 10,
  opciones: ['malo', 'bueno'],
};

describe('CriterioField', () => {
  function render(criterio: Criterio, readonly = false, indice = 1, valor?: number) {
    const fixture = TestBed.createComponent(CriterioField);
    const group = buildCriterioGroup(criterio);
    if (valor !== undefined) group.controls.puntaje.setValue(valor);
    fixture.componentRef.setInput('criterio', criterio);
    fixture.componentRef.setInput('group', group);
    fixture.componentRef.setInput('indice', indice);
    fixture.componentRef.setInput('readonly', readonly);
    fixture.detectChanges();
    return fixture;
  }

  it('ESCALA editable renderiza un control segmentado (un radio por paso)', () => {
    const el: HTMLElement = render(escala).nativeElement;
    const radios = el.querySelectorAll('.seg input[type="radio"]');
    expect(radios.length).toBe(6); // 0..5 inclusive
  });

  it('SELECCION editable renderiza una pill por opción', () => {
    const el: HTMLElement = render(seleccion).nativeElement;
    expect(el.querySelectorAll('.pills input[type="radio"]').length).toBe(2);
  });

  it('muestra el índice con dos dígitos', () => {
    const el: HTMLElement = render(escala, false, 3).nativeElement;
    expect(el.querySelector('.criterio__index')?.textContent).toContain('03');
  });

  it('marca el check cuando el criterio queda completo', () => {
    const fixture = render(escala);
    expect(fixture.nativeElement.querySelector('.criterio__check--on')).toBeNull();
    fixture.componentInstance.group().controls.puntaje.setValue(4);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.criterio__check--on')).toBeTruthy();
  });

  it('en readonly muestra el valor y no controles editables', () => {
    const el: HTMLElement = render(escala, true, 1, 8).nativeElement;
    expect(el.querySelector('.seg')).toBeNull();
    expect(el.querySelector('.criterio__valor')?.textContent).toContain('8');
  });
});
