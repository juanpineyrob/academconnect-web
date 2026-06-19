import { TestBed } from '@angular/core/testing';
import { CriterioField } from './criterio-field';
import { buildCriterioGroup } from '../../evaluacion-form.builder';
import type { Criterio } from '../../evaluaciones.models';

const escala: Criterio = { codigo: 'C1', nombre: 'Claridad', tipo: 'ESCALA', peso: 0.5, escalaMin: 0, escalaMax: 10 };

describe('CriterioField', () => {
  function render(criterio: Criterio, readonly = false) {
    const fixture = TestBed.createComponent(CriterioField);
    fixture.componentRef.setInput('criterio', criterio);
    fixture.componentRef.setInput('group', buildCriterioGroup(criterio));
    fixture.componentRef.setInput('readonly', readonly);
    fixture.detectChanges();
    return fixture;
  }

  it('renderiza un input number para ESCALA en modo editable', () => {
    const el: HTMLElement = render(escala).nativeElement;
    expect(el.querySelector('input[type="number"]')).toBeTruthy();
  });

  it('en readonly muestra el valor y no inputs editables', () => {
    const fixture = render(escala, true);
    fixture.componentInstance.group().controls.puntaje.setValue(8);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('input[type="number"]')).toBeNull();
    expect(el.querySelector('.criterio__valor')?.textContent).toContain('8');
  });
});
