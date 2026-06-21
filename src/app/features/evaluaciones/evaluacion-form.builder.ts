import {
  FormArray,
  FormControl,
  FormGroup,
  ValidatorFn,
  Validators,
} from '@angular/forms';

import type {
  Criterio,
  EvaluacionRequest,
  TemplateSnapshot,
} from './evaluaciones.models';

export type PuntajeValue = number | string | boolean | null;

export interface CriterioControls {
  criterioCodigo: FormControl<string>;
  puntaje: FormControl<PuntajeValue>;
  comentario: FormControl<string>;
  comentarioPrivado: FormControl<boolean>;
}

export type EvaluacionForm = FormGroup<{
  criterios: FormArray<FormGroup<CriterioControls>>;
  comentarioGeneral: FormControl<string>;
}>;

function opcionValida(opciones: string[]): ValidatorFn {
  return (c) =>
    c.value == null || opciones.includes(c.value as string) ? null : { opcionInvalida: true };
}

function validadoresDe(criterio: Criterio): ValidatorFn[] {
  switch (criterio.tipo) {
    case 'ESCALA':
    case 'SLIDER':
      return [Validators.required, Validators.min(criterio.escalaMin), Validators.max(criterio.escalaMax)];
    case 'SELECCION':
      return [Validators.required, opcionValida(criterio.opciones ?? [])];
    case 'BOOLEANO':
      return [Validators.required];
    case 'TEXTO':
      return [];
  }
}

export function buildCriterioGroup(criterio: Criterio): FormGroup<CriterioControls> {
  const valorInicial: PuntajeValue = criterio.tipo === 'TEXTO' ? 0 : null;
  return new FormGroup<CriterioControls>({
    criterioCodigo: new FormControl(criterio.codigo, { nonNullable: true }),
    puntaje: new FormControl<PuntajeValue>(valorInicial, { validators: validadoresDe(criterio) }),
    comentario: new FormControl('', { nonNullable: true }),
    comentarioPrivado: new FormControl(true, { nonNullable: true }),
  });
}

export function buildEvaluacionForm(snapshot: TemplateSnapshot): EvaluacionForm {
  return new FormGroup({
    criterios: new FormArray(snapshot.criterios.map(buildCriterioGroup)),
    comentarioGeneral: new FormControl('', { nonNullable: true }),
  });
}

export function mapPuntaje(criterio: Criterio, value: PuntajeValue): number {
  switch (criterio.tipo) {
    case 'ESCALA':
    case 'SLIDER':
      return Number(value ?? 0);
    case 'BOOLEANO':
      return value ? criterio.escalaMax : criterio.escalaMin;
    case 'SELECCION': {
      const opciones = criterio.opciones ?? [];
      const idx = opciones.indexOf(value as string);
      const ultimo = opciones.length - 1;
      if (idx < 0 || ultimo <= 0) return criterio.escalaMin;
      return criterio.escalaMin + (idx / ultimo) * (criterio.escalaMax - criterio.escalaMin);
    }
    case 'TEXTO':
      return 0;
  }
}

// Promedio ponderado (asume que los pesos de los criterios con peso > 0 suman 1,
// según el contrato del backend); los criterios de peso 0 (p. ej. TEXTO) no cuentan.
export function proyeccionNota(snapshot: TemplateSnapshot, form: EvaluacionForm): number {
  return snapshot.criterios.reduce((total, criterio, i) => {
    if (criterio.peso <= 0) return total;
    const value = form.controls.criterios.at(i).controls.puntaje.value;
    return total + mapPuntaje(criterio, value) * criterio.peso;
  }, 0);
}

// Techo de la proyección ponderada: la mejor nota alcanzable con los pesos del
// template. Sirve para escalar el anillo de progreso de la pantalla de evaluar.
export function proyeccionMax(snapshot: TemplateSnapshot): number {
  return snapshot.criterios.reduce(
    (total, c) => (c.peso > 0 ? total + c.escalaMax * c.peso : total),
    0,
  );
}

export interface AvanceRubrica {
  hechos: number;
  total: number;
}

// Avance de la rúbrica: cuántos criterios puntuables ya tienen un valor válido.
// TEXTO es cualitativo (peso 0, sin validador) y queda fuera del recuento.
export function contarCompletos(snapshot: TemplateSnapshot, form: EvaluacionForm): AvanceRubrica {
  let hechos = 0;
  let total = 0;
  snapshot.criterios.forEach((criterio, i) => {
    if (criterio.tipo === 'TEXTO') return;
    total += 1;
    if (form.controls.criterios.at(i).controls.puntaje.valid) hechos += 1;
  });
  return { hechos, total };
}

export function toEvaluacionRequest(
  asignacionId: number,
  snapshot: TemplateSnapshot,
  form: EvaluacionForm,
): EvaluacionRequest {
  const calificaciones = snapshot.criterios.map((criterio, i) => {
    const group = form.controls.criterios.at(i).controls;
    return {
      criterioCodigo: criterio.codigo,
      puntaje: mapPuntaje(criterio, group.puntaje.value),
      comentario: group.comentario.value,
      comentarioPrivado: group.comentarioPrivado.value,
    };
  });
  return { asignacionId, calificaciones, comentarioGeneral: form.controls.comentarioGeneral.value };
}
