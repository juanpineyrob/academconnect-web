import {
  buildEvaluacionForm,
  contarCompletos,
  mapPuntaje,
  proyeccionMax,
  proyeccionNota,
  toEvaluacionRequest,
} from './evaluacion-form.builder';
import type { Criterio, TemplateSnapshot } from './evaluaciones.models';

function snap(criterios: Criterio[]): TemplateSnapshot {
  return { criterios, umbralAprobacion: 6 };
}

const escala: Criterio = { codigo: 'C1', nombre: 'Claridad', tipo: 'ESCALA', peso: 0.5, escalaMin: 0, escalaMax: 10 };
const slider: Criterio = { codigo: 'C2', nombre: 'Rigor', tipo: 'SLIDER', peso: 0.5, escalaMin: 0, escalaMax: 10 };
const seleccion: Criterio = { codigo: 'C3', nombre: 'Nivel', tipo: 'SELECCION', peso: 1, escalaMin: 0, escalaMax: 10, opciones: ['malo', 'regular', 'bueno'] };
const booleano: Criterio = { codigo: 'C4', nombre: 'Apto', tipo: 'BOOLEANO', peso: 1, escalaMin: 0, escalaMax: 10 };
const texto: Criterio = { codigo: 'C5', nombre: 'Notas', tipo: 'TEXTO', peso: 0, escalaMin: 0, escalaMax: 10 };

describe('evaluacion-form.builder', () => {
  it('crea un grupo por criterio + comentarioGeneral', () => {
    const form = buildEvaluacionForm(snap([escala, slider]));
    expect(form.controls.criterios.length).toBe(2);
    expect(form.controls.criterios.at(0).controls.criterioCodigo.value).toBe('C1');
    expect(form.controls.criterios.at(0).controls.comentarioPrivado.value).toBe(true);
  });

  it('ESCALA es required y respeta min/max', () => {
    const form = buildEvaluacionForm(snap([escala]));
    const ctrl = form.controls.criterios.at(0).controls.puntaje;
    expect(ctrl.valid).toBe(false); // null
    ctrl.setValue(11);
    expect(ctrl.valid).toBe(false); // > max
    ctrl.setValue(7);
    expect(ctrl.valid).toBe(true);
  });

  it('SELECCION exige una opción válida', () => {
    const form = buildEvaluacionForm(snap([seleccion]));
    const ctrl = form.controls.criterios.at(0).controls.puntaje;
    ctrl.setValue('inexistente');
    expect(ctrl.valid).toBe(false);
    ctrl.setValue('bueno');
    expect(ctrl.valid).toBe(true);
  });

  it('TEXTO arranca en 0 y siempre es válido', () => {
    const form = buildEvaluacionForm(snap([texto]));
    const ctrl = form.controls.criterios.at(0).controls.puntaje;
    expect(ctrl.value).toBe(0);
    expect(ctrl.valid).toBe(true);
  });

  it('mapPuntaje: BOOLEANO y SELECCION lineal', () => {
    expect(mapPuntaje(booleano, true)).toBe(10);
    expect(mapPuntaje(booleano, false)).toBe(0);
    expect(mapPuntaje(seleccion, 'malo')).toBe(0);
    expect(mapPuntaje(seleccion, 'regular')).toBe(5);
    expect(mapPuntaje(seleccion, 'bueno')).toBe(10);
    expect(mapPuntaje(texto, 'cualquier cosa')).toBe(0);
  });

  it('proyeccionNota pondera y excluye los de peso 0', () => {
    const form = buildEvaluacionForm(snap([escala, slider, texto]));
    form.controls.criterios.at(0).controls.puntaje.setValue(8); // peso 0.5
    form.controls.criterios.at(1).controls.puntaje.setValue(6); // peso 0.5
    form.controls.criterios.at(2).controls.comentario.setValue('hola'); // peso 0
    expect(proyeccionNota(snap([escala, slider, texto]), form)).toBeCloseTo(7, 5);
  });

  it('toEvaluacionRequest arma calificaciones numéricas para todos los criterios', () => {
    const form = buildEvaluacionForm(snap([booleano, texto]));
    form.controls.criterios.at(0).controls.puntaje.setValue(true);
    form.controls.criterios.at(0).controls.comentario.setValue('ok');
    form.controls.comentarioGeneral.setValue('general');
    const req = toEvaluacionRequest(99, snap([booleano, texto]), form);
    expect(req.asignacionId).toBe(99);
    expect(req.comentarioGeneral).toBe('general');
    expect(req.calificaciones).toEqual([
      { criterioCodigo: 'C4', puntaje: 10, comentario: 'ok', comentarioPrivado: true },
      { criterioCodigo: 'C5', puntaje: 0, comentario: '', comentarioPrivado: true },
    ]);
  });

  it('proyeccionMax es el techo ponderado y excluye los de peso 0', () => {
    // escala 0.5 * 10 + slider 0.5 * 10 = 10; texto (peso 0) no suma
    expect(proyeccionMax(snap([escala, slider, texto]))).toBeCloseTo(10, 5);
  });

  it('contarCompletos cuenta los criterios puntuables con valor válido y excluye TEXTO', () => {
    const form = buildEvaluacionForm(snap([escala, slider, texto]));
    expect(contarCompletos(snap([escala, slider, texto]), form)).toEqual({ hechos: 0, total: 2 });
    form.controls.criterios.at(0).controls.puntaje.setValue(8);
    expect(contarCompletos(snap([escala, slider, texto]), form)).toEqual({ hechos: 1, total: 2 });
    form.controls.criterios.at(1).controls.puntaje.setValue(99); // fuera de rango → inválido
    expect(contarCompletos(snap([escala, slider, texto]), form)).toEqual({ hechos: 1, total: 2 });
  });
});
