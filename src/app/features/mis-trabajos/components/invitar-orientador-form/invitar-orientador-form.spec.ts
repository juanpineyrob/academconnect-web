import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { InvitarOrientadorForm } from './invitar-orientador-form';
import { environment } from '@env/environment';
import { TrabajoListItem } from '@features/repositorio/repositorio.models';

const api = environment.apiBase;

function trabajo(): TrabajoListItem {
  return { id: 7, titulo: 'T', areas: [], keywords: [] } as unknown as TrabajoListItem;
}

const SUGERENCIAS = [
  { id: 1, nombre: 'Ana', email: 'a@x.com', areasNombres: ['IA'], cargaActiva: 2, afinidad: 0.8, score: 0.74 },
  { id: 2, nombre: 'Beto', email: 'b@x.com', areasNombres: ['Redes'], cargaActiva: 5, afinidad: 0.2, score: 0.3 },
  { id: 3, nombre: 'Caro', email: 'c@x.com', areasNombres: ['BD'], cargaActiva: 0, afinidad: 0.1, score: 0.25 },
  { id: 4, nombre: 'Dani', email: 'd@x.com', areasNombres: ['HCI'], cargaActiva: 1, afinidad: 0.05, score: 0.2 },
];

describe('InvitarOrientadorForm', () => {
  let fixture: ComponentFixture<InvitarOrientadorForm>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [InvitarOrientadorForm],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(InvitarOrientadorForm);
    fixture.componentRef.setInput('trabajo', trabajo());
    fixture.detectChanges();
    http = TestBed.inject(HttpTestingController);
    http.expectOne(`${api}/api/me/trabajos/7/sugerir-orientadores`).flush(SUGERENCIAS);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('muestra los 3 recomendados (top por score)', () => {
    const el: HTMLElement = fixture.nativeElement;
    const recos = el.querySelectorAll('.invitar-form__reco');
    expect(recos.length).toBe(3);
    expect(recos[0].textContent).toContain('Ana');
  });

  it('el buscador filtra la lista completa por nombre', () => {
    const cmp = fixture.componentInstance as unknown as { query: { set: (v: string) => void } };
    cmp.query.set('car');
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const items = el.querySelectorAll('.invitar-form__todos-item');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Caro');
  });

  it('al seleccionar y enviar emite { profesorId, motivo }', () => {
    const cmp = fixture.componentInstance as unknown as {
      seleccionar: (id: number) => void;
      enviar: { subscribe: (cb: (v: { profesorId: number; motivo: string | null }) => void) => void };
    };
    let emitted: { profesorId: number; motivo: string | null } | undefined;
    cmp.enviar.subscribe((v) => (emitted = v));
    cmp.seleccionar(2);
    (fixture.componentInstance as unknown as { onSubmit: () => void }).onSubmit();
    expect(emitted).toEqual({ profesorId: 2, motivo: null });
  });
});
