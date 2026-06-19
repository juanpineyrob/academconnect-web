import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';

import type { Criterio } from '../../evaluaciones.models';
import type { CriterioControls } from '../../evaluacion-form.builder';
import type { FormGroup } from '@angular/forms';

@Component({
  selector: 'ac-criterio-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DecimalPipe],
  templateUrl: './criterio-field.html',
  styleUrl: './criterio-field.scss',
})
export class CriterioField {
  readonly criterio = input.required<Criterio>();
  readonly group = input.required<FormGroup<CriterioControls>>();
  readonly indice = input.required<number>();
  readonly readonly = input<boolean>(false);

  /** Índice con dos dígitos para el numerador editorial (01, 02, …). */
  protected readonly etiquetaIndice = computed(() =>
    String(this.indice()).padStart(2, '0'),
  );

  /** Escala de pasos enteros para el control segmentado de ESCALA. */
  protected readonly escala = computed<number[]>(() => {
    const c = this.criterio();
    const pasos: number[] = [];
    for (let v = c.escalaMin; v <= c.escalaMax; v++) pasos.push(v);
    return pasos;
  });

  /** Etiqueta tipada del badge (≈ prototipo: "ESCALA 0–10", "SELECCIÓN", …). */
  protected readonly badge = computed<string>(() => {
    const c = this.criterio();
    switch (c.tipo) {
      case 'ESCALA':
        return `Escala ${c.escalaMin}–${c.escalaMax}`;
      case 'SLIDER':
        return `Slider ${c.escalaMin}–${c.escalaMax}`;
      case 'SELECCION':
        return 'Selección';
      case 'BOOLEANO':
        return 'Sí / No';
      case 'TEXTO':
        return 'Texto';
    }
  });

  /** Un criterio puntuable está completo cuando su puntaje es válido. */
  protected completo(): boolean {
    const c = this.criterio();
    if (c.tipo === 'TEXTO') return false;
    return this.group().controls.puntaje.valid;
  }

  /** Puntaje numérico para el modo readonly (el backend siempre devuelve número). */
  protected puntajeNumerico(): number | null {
    const v = this.group().controls.puntaje.value;
    return typeof v === 'number' ? v : null;
  }
}
