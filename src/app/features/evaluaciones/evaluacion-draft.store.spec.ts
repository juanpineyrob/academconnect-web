import { TestBed } from '@angular/core/testing';
import { EvaluacionDraftStore } from './evaluacion-draft.store';

describe('EvaluacionDraftStore', () => {
  let store: EvaluacionDraftStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(EvaluacionDraftStore);
  });

  it('guarda y restaura por asignación', () => {
    store.save(1, { a: 1 });
    expect(store.load(1)).toEqual({ a: 1 });
  });

  it('aísla por asignación', () => {
    store.save(1, { a: 1 });
    expect(store.load(2)).toBeNull();
  });

  it('clear elimina el borrador', () => {
    store.save(1, { a: 1 });
    store.clear(1);
    expect(store.load(1)).toBeNull();
  });

  it('load devuelve null si el contenido está corrupto', () => {
    localStorage.setItem('eval-draft:1', 'no-json');
    expect(store.load(1)).toBeNull();
  });
});
