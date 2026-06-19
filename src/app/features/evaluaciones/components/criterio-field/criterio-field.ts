import { ChangeDetectionStrategy, Component, input } from '@angular/core';
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
  readonly readonly = input<boolean>(false);
}
