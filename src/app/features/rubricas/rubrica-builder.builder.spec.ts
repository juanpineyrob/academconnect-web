import {
  slugify, sumaPesos, distribuirEquitativamente, validarRubrica, toRubricaRequest,
} from './rubrica-builder.builder';
import type { RubricaDraft } from './rubrica-builder.builder';

function draft(over: Partial<RubricaDraft> = {}): RubricaDraft {
  return {
    nombre: 'Mi rúbrica', descripcion: '', visibilidad: 'PRIVADO',
    escalaMin: 0, escalaMax: 10, umbralAprobacion: 6,
    criterios: [
      { nombre: 'Metodología', tipo: 'ESCALA', peso: 0.5, opciones: [] },
      { nombre: 'Originalidad', tipo: 'SLIDER', peso: 0.5, opciones: [] },
    ],
    ...over,
  };
}

describe('rubrica-builder.builder', () => {
  it('slugify normaliza acentos, espacios y mayúsculas', () => {
    expect(slugify('Claridad de Escritura')).toBe('claridad-de-escritura');
    expect(slugify('Metodología')).toBe('metodologia');
  });

  it('sumaPesos ignora TEXTO', () => {
    const d = draft({ criterios: [
      { nombre: 'A', tipo: 'ESCALA', peso: 0.7, opciones: [] },
      { nombre: 'Notas', tipo: 'TEXTO', peso: 0, opciones: [] },
    ]});
    expect(sumaPesos(d.criterios)).toBeCloseTo(0.7, 5);
  });

  it('distribuirEquitativamente reparte 1.0 entre ponderables', () => {
    const pesos = distribuirEquitativamente([
      { nombre: 'A', tipo: 'ESCALA', peso: 0, opciones: [] },
      { nombre: 'B', tipo: 'SLIDER', peso: 0, opciones: [] },
      { nombre: 'N', tipo: 'TEXTO', peso: 0, opciones: [] },
    ]);
    expect(pesos).toEqual([0.5, 0.5, 0]);
  });

  it('validarRubrica detecta pesos que no suman 1, SELECCION sin opciones y umbral fuera de rango', () => {
    expect(validarRubrica(draft())).toEqual([]); // válida

    const malPeso = draft({ criterios: [
      { nombre: 'A', tipo: 'ESCALA', peso: 0.3, opciones: [] },
      { nombre: 'B', tipo: 'SLIDER', peso: 0.3, opciones: [] },
    ]});
    expect(validarRubrica(malPeso).some((e) => e.includes('pesos'))).toBe(true);

    const selSinOpciones = draft({ criterios: [
      { nombre: 'Nivel', tipo: 'SELECCION', peso: 1, opciones: [] },
    ]});
    expect(validarRubrica(selSinOpciones).some((e) => e.includes('opciones'))).toBe(true);

    const umbralFuera = draft({ umbralAprobacion: 20 });
    expect(validarRubrica(umbralFuera).some((e) => e.includes('umbral'))).toBe(true);
  });

  it('toRubricaRequest serializa criterios con codigo slug y escala uniforme', () => {
    const req = toRubricaRequest(draft());
    const criterios = JSON.parse(req.criterios);
    expect(criterios[0]).toEqual({
      codigo: 'metodologia', nombre: 'Metodología', tipo: 'ESCALA',
      peso: 0.5, escalaMin: 0, escalaMax: 10,
    });
    expect(req.visibilidad).toBe('PRIVADO');
    expect(req.umbralAprobacion).toBe(6);
  });

  it('toRubricaRequest incluye opciones solo en SELECCION y peso 0 en TEXTO', () => {
    const req = toRubricaRequest(draft({ criterios: [
      { nombre: 'Nivel', tipo: 'SELECCION', peso: 1, opciones: ['Bajo', 'Alto'] },
      { nombre: 'Notas', tipo: 'TEXTO', peso: 0, opciones: [] },
    ]}));
    const criterios = JSON.parse(req.criterios);
    expect(criterios[0].opciones).toEqual(['Bajo', 'Alto']);
    expect(criterios[1].peso).toBe(0);
    expect(criterios[1].opciones).toBeUndefined();
  });
});
