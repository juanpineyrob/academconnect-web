# Cola de evaluación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al evaluador (`PROFESOR`/`EXTERNO`) la cola de sus asignaciones (`/evaluaciones`) y la pantalla para evaluar un trabajo contra los criterios de su template (`/evaluaciones/:asignacionId`), con vista split documento+formulario, borrador local y envío con confirmación.

**Architecture:** Feature standalone `src/app/features/evaluaciones/` que sigue el patrón de `mis-trabajos`. El dominio de criterios vive en funciones puras (`evaluacion-form.builder.ts`): snapshot JSON → `FormArray` tipado + validadores + mapeo a `EvaluacionRequest`. Un `criterio-field` polimórfico (`@switch` por tipo) renderiza cada criterio. El borrador se persiste en `localStorage`. Auth por cookie permite embeber el PDF con `<object>` directo.

**Tech Stack:** Angular 21 (standalone, signals, OnPush, native control flow), Reactive Forms tipados, SCSS con design tokens, Vitest (`@angular/build:unit-test`, `HttpTestingController`).

**Spec:** `docs/superpowers/specs/2026-06-18-cola-de-evaluacion-design.md`

---

## File Structure

```
features/evaluaciones/
├── evaluaciones.models.ts            # tipos del contrato backend
├── evaluaciones.service.ts           # listar/obtener/cargar/enviar + parseSnapshot
├── evaluacion-form.builder.ts        # funciones puras: snapshot → form, mapeo, proyección
├── evaluacion-draft.store.ts         # borrador localStorage por asignación
├── unsaved.guard.ts                  # CanDeactivateFn para EvaluarPage
├── evaluaciones.routes.ts            # /evaluaciones, /evaluaciones/:asignacionId
├── cola-page/                        # cola-page.ts / .html / .scss
├── evaluar-page/                     # evaluar-page.ts / .html / .scss
└── components/
    ├── asignacion-card/              # item de la cola
    ├── criterio-field/               # @switch por tipo (editable + readonly)
    ├── documento-viewer/             # <object> del PDF de la versión
    └── confirmar-envio-dialog/       # <dialog> nativo de confirmación
```

Archivos existentes a modificar:
- `src/app/app.routes.ts` — registrar `EVALUACIONES_ROUTES`.
- `src/app/layout/sidebar/sidebar.ts` — cablear "Evaluaciones asignadas" y quitar "Bandeja de revisión".

**Endpoints backend (ya existen):**
- `GET {api}/evaluador/me/asignaciones?estado=` → `AsignacionResponse[]`
- `GET {api}/api/asignaciones/{id}` → `AsignacionResponse`
- `GET {api}/api/asignaciones/{id}/evaluacion` → `EvaluacionResponse`
- `POST {api}/api/evaluaciones` (`EvaluacionRequest`)
- `GET {api}/api/trabajos/{trabajoId}/versiones/{versionId}/documento` (cookie auth)

---

## Task 1: Modelos del contrato

**Files:**
- Create: `src/app/features/evaluaciones/evaluaciones.models.ts`

- [ ] **Step 1: Escribir el archivo de modelos**

```ts
export type EstadoAsignacion = 'ACTIVA' | 'COMPLETADA' | 'CANCELADA';
export type CriterioTipo = 'ESCALA' | 'SLIDER' | 'SELECCION' | 'BOOLEANO' | 'TEXTO';

export interface Asignacion {
  id: number;
  trabajoId: number;
  trabajoTitulo: string;
  versionamientoId: number;
  versionNumero: number;
  evaluadorId: number;
  evaluadorNombre: string;
  templateSnapshot: string; // JSON crudo
  asignadaEn: string;
  vencimientoEn: string;
  estado: EstadoAsignacion;
  createdAt: string;
}

export interface Criterio {
  codigo: string;
  nombre: string;
  tipo: CriterioTipo;
  peso: number;
  escalaMin: number;
  escalaMax: number;
  opciones?: string[]; // solo SELECCION
}

export interface TemplateSnapshot {
  criterios: Criterio[];
  umbralAprobacion: number;
}

export interface CalificacionCriterio {
  criterioCodigo: string;
  puntaje: number;
  comentario: string;
  comentarioPrivado: boolean;
}

export interface EvaluacionRequest {
  asignacionId: number;
  calificaciones: CalificacionCriterio[];
  comentarioGeneral: string;
}

export interface Evaluacion {
  id: number;
  asignacionId: number;
  estado: string;
  calificacionFinal: number;
  comentarioGeneral: string;
  calificaciones: CalificacionCriterio[];
  completadaEn: string;
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores nuevos en `evaluaciones.models.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/app/features/evaluaciones/evaluaciones.models.ts
git commit -m "feat(evaluaciones): tipos TS del contrato de evaluación"
```

---

## Task 2: Servicio + parseSnapshot

**Files:**
- Create: `src/app/features/evaluaciones/evaluaciones.service.ts`
- Test: `src/app/features/evaluaciones/evaluaciones.service.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { EvaluacionesService } from './evaluaciones.service';
import { environment } from '@env/environment';
import type { Asignacion, EvaluacionRequest } from './evaluaciones.models';

const api = environment.apiBase;

function mkAsignacion(id: number): Asignacion {
  return {
    id, trabajoId: 10, trabajoTitulo: 'T', versionamientoId: 5, versionNumero: 2,
    evaluadorId: 1, evaluadorNombre: 'E', templateSnapshot: '{}',
    asignadaEn: '2026-06-01T00:00:00Z', vencimientoEn: '2026-06-20T00:00:00Z',
    estado: 'ACTIVA', createdAt: '2026-06-01T00:00:00Z',
  };
}

describe('EvaluacionesService', () => {
  let service: EvaluacionesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EvaluacionesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('listarAsignaciones manda estado como query param', () => {
    service.listarAsignaciones('ACTIVA').subscribe();
    const req = http.expectOne(`${api}/evaluador/me/asignaciones?estado=ACTIVA`);
    expect(req.request.method).toBe('GET');
    req.flush([mkAsignacion(1)]);
  });

  it('listarAsignaciones sin estado no agrega query param', () => {
    service.listarAsignaciones().subscribe();
    const req = http.expectOne(`${api}/evaluador/me/asignaciones`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('obtenerAsignacion pega a /api/asignaciones/{id}', () => {
    service.obtenerAsignacion(7).subscribe();
    http.expectOne(`${api}/api/asignaciones/7`).flush(mkAsignacion(7));
  });

  it('cargarEvaluacion pega a /api/asignaciones/{id}/evaluacion', () => {
    service.cargarEvaluacion(7).subscribe();
    http.expectOne(`${api}/api/asignaciones/7/evaluacion`).flush({});
  });

  it('enviarEvaluacion hace POST a /api/evaluaciones con el body', () => {
    const body: EvaluacionRequest = { asignacionId: 7, calificaciones: [], comentarioGeneral: '' };
    service.enviarEvaluacion(body).subscribe();
    const req = http.expectOne(`${api}/api/evaluaciones`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('parseSnapshot devuelve el objeto cuando el JSON es válido', () => {
    const snap = service.parseSnapshot('{"criterios":[],"umbralAprobacion":6}');
    expect(snap).toEqual({ criterios: [], umbralAprobacion: 6 });
  });

  it('parseSnapshot devuelve null con JSON inválido o sin criterios', () => {
    expect(service.parseSnapshot('no-json')).toBeNull();
    expect(service.parseSnapshot('{"umbralAprobacion":6}')).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx ng test --include='**/evaluaciones.service.spec.ts'`
Expected: FAIL — `EvaluacionesService` no existe.

- [ ] **Step 3: Implementar el servicio**

```ts
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import type {
  Asignacion,
  EstadoAsignacion,
  Evaluacion,
  EvaluacionRequest,
  TemplateSnapshot,
} from './evaluaciones.models';

@Injectable({ providedIn: 'root' })
export class EvaluacionesService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBase;

  listarAsignaciones(estado?: EstadoAsignacion): Observable<Asignacion[]> {
    let params = new HttpParams();
    if (estado) params = params.set('estado', estado);
    return this.http.get<Asignacion[]>(`${this.api}/evaluador/me/asignaciones`, { params });
  }

  obtenerAsignacion(id: number): Observable<Asignacion> {
    return this.http.get<Asignacion>(`${this.api}/api/asignaciones/${id}`);
  }

  cargarEvaluacion(asignacionId: number): Observable<Evaluacion> {
    return this.http.get<Evaluacion>(`${this.api}/api/asignaciones/${asignacionId}/evaluacion`);
  }

  enviarEvaluacion(req: EvaluacionRequest): Observable<Evaluacion> {
    return this.http.post<Evaluacion>(`${this.api}/api/evaluaciones`, req);
  }

  parseSnapshot(json: string): TemplateSnapshot | null {
    try {
      const obj = JSON.parse(json);
      if (!obj || !Array.isArray(obj.criterios)) return null;
      return obj as TemplateSnapshot;
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx ng test --include='**/evaluaciones.service.spec.ts'`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/features/evaluaciones/evaluaciones.service.ts src/app/features/evaluaciones/evaluaciones.service.spec.ts
git commit -m "feat(evaluaciones): EvaluacionesService con fetch + parseSnapshot (tests)"
```

---

## Task 3: Form builder (funciones puras) — el corazón

**Files:**
- Create: `src/app/features/evaluaciones/evaluacion-form.builder.ts`
- Test: `src/app/features/evaluaciones/evaluacion-form.builder.spec.ts`

Notas de dominio:
- Cada criterio produce un `FormGroup` con `criterioCodigo`, `puntaje`, `comentario`, `comentarioPrivado` (default `true`).
- `puntaje` inicial es `null` salvo `TEXTO`, que es `0` fijo (el backend exige `puntaje` no nulo en cada calificación; `TEXTO` tiene `peso=0`, no aporta a la nota).
- Validadores: `ESCALA`/`SLIDER` → `required` + `min` + `max`; `SELECCION` → `required` + opción válida; `BOOLEANO` → `required`; `TEXTO` → sin validador en `puntaje`.
- Mapeo a número: `ESCALA`/`SLIDER` el valor; `BOOLEANO` `false→escalaMin`, `true→escalaMax`; `SELECCION` reparto lineal por índice en `[escalaMin..escalaMax]`; `TEXTO` `0`.
- Proyección de nota: `Σ(puntaje × peso)` solo sobre criterios con `peso > 0`.

- [ ] **Step 1: Escribir el test que falla**

```ts
import {
  buildEvaluacionForm,
  mapPuntaje,
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
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx ng test --include='**/evaluacion-form.builder.spec.ts'`
Expected: FAIL — el módulo no exporta esas funciones.

- [ ] **Step 3: Implementar el builder**

```ts
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

export function proyeccionNota(snapshot: TemplateSnapshot, form: EvaluacionForm): number {
  return snapshot.criterios.reduce((total, criterio, i) => {
    if (criterio.peso <= 0) return total;
    const value = form.controls.criterios.at(i).controls.puntaje.value;
    return total + mapPuntaje(criterio, value) * criterio.peso;
  }, 0);
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
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx ng test --include='**/evaluacion-form.builder.spec.ts'`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/features/evaluaciones/evaluacion-form.builder.ts src/app/features/evaluaciones/evaluacion-form.builder.spec.ts
git commit -m "feat(evaluaciones): form builder puro (snapshot→form, mapeo, proyección) con tests"
```

---

## Task 4: Draft store (localStorage)

**Files:**
- Create: `src/app/features/evaluaciones/evaluacion-draft.store.ts`
- Test: `src/app/features/evaluaciones/evaluacion-draft.store.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
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
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx ng test --include='**/evaluacion-draft.store.spec.ts'`
Expected: FAIL — `EvaluacionDraftStore` no existe.

- [ ] **Step 3: Implementar el store**

```ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class EvaluacionDraftStore {
  private key(asignacionId: number): string {
    return `eval-draft:${asignacionId}`;
  }

  save(asignacionId: number, value: unknown): void {
    localStorage.setItem(this.key(asignacionId), JSON.stringify(value));
  }

  load(asignacionId: number): unknown | null {
    const raw = localStorage.getItem(this.key(asignacionId));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  clear(asignacionId: number): void {
    localStorage.removeItem(this.key(asignacionId));
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx ng test --include='**/evaluacion-draft.store.spec.ts'`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/features/evaluaciones/evaluacion-draft.store.ts src/app/features/evaluaciones/evaluacion-draft.store.spec.ts
git commit -m "feat(evaluaciones): EvaluacionDraftStore (localStorage por asignación) con tests"
```

---

## Task 5: `criterio-field` (componente polimórfico)

**Files:**
- Create: `src/app/features/evaluaciones/components/criterio-field/criterio-field.ts`
- Create: `src/app/features/evaluaciones/components/criterio-field/criterio-field.html`
- Create: `src/app/features/evaluaciones/components/criterio-field/criterio-field.scss`
- Test: `src/app/features/evaluaciones/components/criterio-field/criterio-field.spec.ts`

- [ ] **Step 1: Escribir el componente**

`criterio-field.ts`:

```ts
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
```

`criterio-field.html`:

```html
@let c = criterio();
@let g = group();
<fieldset class="criterio" [formGroup]="g">
  <legend class="criterio__nombre">
    {{ c.nombre }}
    @if (c.peso > 0) {
      <span class="criterio__peso">peso {{ c.peso * 100 | number: '1.0-0' }}%</span>
    }
  </legend>

  @if (readonly()) {
    <p class="criterio__valor">{{ g.controls.puntaje.value }}</p>
    @if (g.controls.comentario.value) {
      <p class="criterio__comentario-ro">{{ g.controls.comentario.value }}</p>
    }
  } @else {
    @switch (c.tipo) {
      @case ('ESCALA') {
        <label class="sr-only" [for]="c.codigo">{{ c.nombre }}</label>
        <input [id]="c.codigo" type="number" formControlName="puntaje"
               [min]="c.escalaMin" [max]="c.escalaMax" step="1" />
      }
      @case ('SLIDER') {
        <input [id]="c.codigo" type="range" formControlName="puntaje"
               [min]="c.escalaMin" [max]="c.escalaMax" step="1"
               [attr.aria-valuetext]="g.controls.puntaje.value" />
        <output>{{ g.controls.puntaje.value }}</output>
      }
      @case ('SELECCION') {
        <select [id]="c.codigo" formControlName="puntaje" [attr.aria-label]="c.nombre">
          <option [ngValue]="null" disabled>Elegí una opción</option>
          @for (op of c.opciones; track op) {
            <option [ngValue]="op">{{ op }}</option>
          }
        </select>
      }
      @case ('BOOLEANO') {
        <label class="criterio__check">
          <input type="checkbox" formControlName="puntaje" />
          Cumple
        </label>
      }
      @case ('TEXTO') {
        <!-- TEXTO solo cualitativo: el comentario es la respuesta -->
      }
    }

    <label class="sr-only" [for]="c.codigo + '-com'">Comentario</label>
    <textarea [id]="c.codigo + '-com'" formControlName="comentario"
              rows="2" placeholder="Comentario (opcional)"></textarea>
    <label class="criterio__check">
      <input type="checkbox" formControlName="comentarioPrivado" />
      Comentario privado (no visible al estudiante)
    </label>
  }
</fieldset>
```

`criterio-field.scss`:

```scss
.criterio {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  margin: 0 0 var(--space-3);
  display: grid;
  gap: var(--space-2);

  &__nombre {
    font-weight: 600;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-2);
  }
  &__peso {
    font-size: 0.75rem;
    color: var(--color-text-faint);
    font-weight: 400;
  }
  &__valor {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
  }
  &__comentario-ro {
    color: var(--color-text-muted);
    margin: 0;
  }
  &__check {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.875rem;
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

> Nota: `[ngValue]` requiere importar `ReactiveFormsModule` (ya incluido). Si alguna variable de tokens SCSS (`--color-border`, `--space-3`, etc.) no existe, reemplazá por el token equivalente del proyecto inspeccionando `src/styles` o un `.scss` vecino.

- [ ] **Step 2: Escribir el test que falla**

`criterio-field.spec.ts`:

```ts
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
```

- [ ] **Step 3: Correr el test y verificar que falla, luego que pasa**

Run: `npx ng test --include='**/criterio-field.spec.ts'`
Expected: primero FAIL (componente no existe), tras crear los archivos del Step 1 → PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add src/app/features/evaluaciones/components/criterio-field/
git commit -m "feat(evaluaciones): criterio-field polimórfico (editable + readonly) con tests"
```

---

## Task 6: `documento-viewer`

**Files:**
- Create: `src/app/features/evaluaciones/components/documento-viewer/documento-viewer.ts`
- Create: `src/app/features/evaluaciones/components/documento-viewer/documento-viewer.html`
- Create: `src/app/features/evaluaciones/components/documento-viewer/documento-viewer.scss`

- [ ] **Step 1: Escribir el componente**

`documento-viewer.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { environment } from '@env/environment';

@Component({
  selector: 'ac-documento-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './documento-viewer.html',
  styleUrl: './documento-viewer.scss',
})
export class DocumentoViewer {
  readonly trabajoId = input.required<number>();
  readonly versionId = input.required<number>();

  protected readonly url = computed(
    () => `${environment.apiBase}/api/trabajos/${this.trabajoId()}/versiones/${this.versionId()}/documento`,
  );
}
```

`documento-viewer.html`:

```html
<object class="doc" [data]="url()" type="application/pdf">
  <p class="doc__fallback">
    No se pudo mostrar el documento.
    <a [href]="url()" target="_blank" rel="noopener">Abrir en una pestaña nueva</a>
  </p>
</object>
```

`documento-viewer.scss`:

```scss
.doc {
  width: 100%;
  height: 100%;
  min-height: 60vh;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);

  &__fallback {
    padding: var(--space-4);
  }
}
```

- [ ] **Step 2: Verificar compilación**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/app/features/evaluaciones/components/documento-viewer/
git commit -m "feat(evaluaciones): documento-viewer (<object> PDF con fallback)"
```

---

## Task 7: `asignacion-card`

**Files:**
- Create: `src/app/features/evaluaciones/components/asignacion-card/asignacion-card.ts`
- Create: `src/app/features/evaluaciones/components/asignacion-card/asignacion-card.html`
- Create: `src/app/features/evaluaciones/components/asignacion-card/asignacion-card.scss`
- Test: `src/app/features/evaluaciones/components/asignacion-card/asignacion-card.spec.ts`

- [ ] **Step 1: Escribir el componente**

`asignacion-card.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import type { Asignacion } from '../../evaluaciones.models';

@Component({
  selector: 'ac-asignacion-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe],
  templateUrl: './asignacion-card.html',
  styleUrl: './asignacion-card.scss',
})
export class AsignacionCard {
  readonly asignacion = input.required<Asignacion>();

  protected readonly vencida = computed(() => {
    const a = this.asignacion();
    return a.estado === 'ACTIVA' && new Date(a.vencimientoEn).getTime() < Date.now();
  });
}
```

`asignacion-card.html`:

```html
@let a = asignacion();
<a class="card" [routerLink]="['/evaluaciones', a.id]">
  <h3 class="card__titulo">{{ a.trabajoTitulo }}</h3>
  <p class="card__meta">
    <span>v{{ a.versionNumero }}</span>
    <span>Asignada {{ a.asignadaEn | date: 'mediumDate' }}</span>
  </p>
  <p class="card__venc" [class.card__venc--alerta]="vencida()">
    @if (vencida()) { Vencida · } Vence {{ a.vencimientoEn | date: 'mediumDate' }}
  </p>
</a>
```

`asignacion-card.scss`:

```scss
.card {
  display: block;
  text-decoration: none;
  color: inherit;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  transition: border-color 0.15s ease;

  &:hover,
  &:focus-visible {
    border-color: var(--color-accent);
  }

  &__titulo {
    margin: 0 0 var(--space-2);
    font-size: 1rem;
  }
  &__meta {
    display: flex;
    gap: var(--space-3);
    color: var(--color-text-muted);
    font-size: 0.8125rem;
    margin: 0 0 var(--space-1);
  }
  &__venc {
    font-size: 0.8125rem;
    color: var(--color-text-faint);
    margin: 0;

    &--alerta {
      color: var(--color-accent);
      font-weight: 600;
    }
  }
}
```

- [ ] **Step 2: Escribir el test que falla**

`asignacion-card.spec.ts`:

```ts
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
});
```

- [ ] **Step 3: Correr el test (FAIL → PASS)**

Run: `npx ng test --include='**/asignacion-card.spec.ts'`
Expected: PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add src/app/features/evaluaciones/components/asignacion-card/
git commit -m "feat(evaluaciones): asignacion-card con badge de vencida (tests)"
```

---

## Task 8: `ColaPage`

**Files:**
- Create: `src/app/features/evaluaciones/cola-page/cola-page.ts`
- Create: `src/app/features/evaluaciones/cola-page/cola-page.html`
- Create: `src/app/features/evaluaciones/cola-page/cola-page.scss`
- Test: `src/app/features/evaluaciones/cola-page/cola-page.spec.ts`

- [ ] **Step 1: Escribir el componente**

`cola-page.ts`:

```ts
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';

import { EvaluacionesService } from '../evaluaciones.service';
import type { Asignacion, EstadoAsignacion } from '../evaluaciones.models';
import { AsignacionCard } from '../components/asignacion-card/asignacion-card';

@Component({
  selector: 'ac-cola-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AsignacionCard],
  templateUrl: './cola-page.html',
  styleUrl: './cola-page.scss',
})
export class ColaPage {
  private readonly service = inject(EvaluacionesService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tab = signal<EstadoAsignacion>('ACTIVA');
  protected readonly asignaciones = signal<Asignacion[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.cargar('ACTIVA');
  }

  protected cambiarTab(estado: EstadoAsignacion): void {
    if (this.tab() === estado) return;
    this.tab.set(estado);
    this.cargar(estado);
  }

  protected cargar(estado: EstadoAsignacion): void {
    this.loading.set(true);
    this.error.set(null);
    this.service
      .listarAsignaciones(estado)
      .pipe(
        catchError((err: HttpErrorResponse) => {
          this.error.set(err.status === 0 ? 'Sin conexión.' : 'No se pudieron cargar tus evaluaciones.');
          return of<Asignacion[]>([]);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => {
        this.asignaciones.set(items);
        this.loading.set(false);
      });
  }
}
```

`cola-page.html`:

```html
<header class="cola__head">
  <h1>Evaluaciones asignadas</h1>
  <div class="cola__tabs" role="tablist">
    <button type="button" role="tab" [attr.aria-selected]="tab() === 'ACTIVA'"
            [class.is-active]="tab() === 'ACTIVA'" (click)="cambiarTab('ACTIVA')">Activas</button>
    <button type="button" role="tab" [attr.aria-selected]="tab() === 'COMPLETADA'"
            [class.is-active]="tab() === 'COMPLETADA'" (click)="cambiarTab('COMPLETADA')">Completadas</button>
  </div>
</header>

@if (loading()) {
  <p class="cola__estado">Cargando…</p>
} @else if (error()) {
  <p class="cola__estado cola__estado--error">
    {{ error() }} <button type="button" (click)="cargar(tab())">Reintentar</button>
  </p>
} @else if (asignaciones().length === 0) {
  <p class="cola__estado">
    @if (tab() === 'ACTIVA') { No tenés evaluaciones activas. }
    @else { No tenés evaluaciones completadas. }
  </p>
} @else {
  <ul class="cola__list">
    @for (a of asignaciones(); track a.id) {
      <li><ac-asignacion-card [asignacion]="a" /></li>
    }
  </ul>
}
```

`cola-page.scss`:

```scss
.cola {
  &__head {
    margin-bottom: var(--space-4);
  }
  &__tabs {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-3);

    button {
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: transparent;
      cursor: pointer;

      &.is-active {
        border-color: var(--color-accent);
        color: var(--color-accent);
        font-weight: 600;
      }
    }
  }
  &__list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: var(--space-3);
  }
  &__estado {
    color: var(--color-text-muted);

    &--error {
      color: var(--color-danger);
    }
  }
}
```

- [ ] **Step 2: Escribir el test que falla**

`cola-page.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { ColaPage } from './cola-page';
import { environment } from '@env/environment';
import type { Asignacion } from '../evaluaciones.models';

const api = environment.apiBase;

function mk(id: number, estado: Asignacion['estado'] = 'ACTIVA'): Asignacion {
  return {
    id, trabajoId: 10, trabajoTitulo: `T${id}`, versionamientoId: 5, versionNumero: 1,
    evaluadorId: 1, evaluadorNombre: 'E', templateSnapshot: '{}',
    asignadaEn: '2026-06-01T00:00:00Z', vencimientoEn: '2026-06-20T00:00:00Z',
    estado, createdAt: '2026-06-01T00:00:00Z',
  };
}

describe('ColaPage', () => {
  let http: HttpTestingController;

  function create() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(ColaPage);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('carga ACTIVA al iniciar', () => {
    const fixture = create();
    const req = http.expectOne(`${api}/evaluador/me/asignaciones?estado=ACTIVA`);
    req.flush([mk(1)]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('ac-asignacion-card').length).toBe(1);
  });

  it('cambiar de tab refetch con estado COMPLETADA', () => {
    const fixture = create();
    http.expectOne(`${api}/evaluador/me/asignaciones?estado=ACTIVA`).flush([mk(1)]);
    fixture.detectChanges();
    const tabs = (fixture.nativeElement as HTMLElement).querySelectorAll('[role="tab"]');
    (tabs[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne(`${api}/evaluador/me/asignaciones?estado=COMPLETADA`).flush([mk(2, 'COMPLETADA')]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('T2');
  });
});
```

- [ ] **Step 3: Correr el test (FAIL → PASS)**

Run: `npx ng test --include='**/cola-page.spec.ts'`
Expected: PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add src/app/features/evaluaciones/cola-page/
git commit -m "feat(evaluaciones): ColaPage con tabs Activas/Completadas (tests)"
```

---

## Task 9: `confirmar-envio-dialog`

**Files:**
- Create: `src/app/features/evaluaciones/components/confirmar-envio-dialog/confirmar-envio-dialog.ts`
- Create: `src/app/features/evaluaciones/components/confirmar-envio-dialog/confirmar-envio-dialog.html`
- Create: `src/app/features/evaluaciones/components/confirmar-envio-dialog/confirmar-envio-dialog.scss`

Usa `<dialog>` nativo (focus trap y Esc gratis). El componente reacciona al input `open` para llamar `showModal()`/`close()`.

- [ ] **Step 1: Escribir el componente**

`confirmar-envio-dialog.ts`:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';

@Component({
  selector: 'ac-confirmar-envio-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './confirmar-envio-dialog.html',
  styleUrl: './confirmar-envio-dialog.scss',
})
export class ConfirmarEnvioDialog {
  readonly open = input<boolean>(false);
  readonly proyeccion = input<number | null>(null);
  readonly umbral = input<number | null>(null);
  readonly submitting = input<boolean>(false);

  readonly confirmar = output<void>();
  readonly cancelar = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.open() && !el.open) el.showModal();
      else if (!this.open() && el.open) el.close();
    });
  }
}
```

`confirmar-envio-dialog.html`:

```html
<dialog #dialog class="confirm" (cancel)="$event.preventDefault(); cancelar.emit()">
  <h2 class="confirm__title">Enviar evaluación</h2>
  <p>Esto es <strong>definitivo</strong>: cierra tu evaluación y no podrás editarla.</p>
  @if (proyeccion() !== null && umbral() !== null) {
    <p class="confirm__nota">
      Proyección: {{ proyeccion() | number: '1.1-2' }} / umbral {{ umbral() | number: '1.1-2' }}
    </p>
  }
  <div class="confirm__actions">
    <button type="button" (click)="cancelar.emit()" [disabled]="submitting()">Cancelar</button>
    <button type="button" class="confirm__primary" (click)="confirmar.emit()" [disabled]="submitting()">
      @if (submitting()) { Enviando… } @else { Enviar }
    </button>
  </div>
</dialog>
```

`confirmar-envio-dialog.scss`:

```scss
.confirm {
  border: none;
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  max-width: 28rem;

  &::backdrop {
    background: rgba(0, 0, 0, 0.4);
  }
  &__title {
    margin: 0 0 var(--space-3);
  }
  &__nota {
    color: var(--color-text-muted);
  }
  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-4);

    button {
      padding: var(--space-2) var(--space-4);
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
      background: transparent;
      cursor: pointer;
    }
  }
  &__primary {
    background: var(--color-accent);
    color: var(--color-on-accent, #fff);
    border-color: var(--color-accent);
  }
}
```

> Nota: `@number` pipe requiere importar `DecimalPipe`. Como el template lo usa, agregá `imports: [DecimalPipe]` al decorador y el import `import { DecimalPipe } from '@angular/common';` en `confirmar-envio-dialog.ts`.

- [ ] **Step 2: Aplicar la nota anterior**

Editar `confirmar-envio-dialog.ts`: agregar `import { DecimalPipe } from '@angular/common';` e `imports: [DecimalPipe]` en el `@Component`.

- [ ] **Step 3: Verificar compilación**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add src/app/features/evaluaciones/components/confirmar-envio-dialog/
git commit -m "feat(evaluaciones): confirmar-envio-dialog (<dialog> nativo accesible)"
```

---

## Task 10: `unsavedGuard` (CanDeactivate)

**Files:**
- Create: `src/app/features/evaluaciones/unsaved.guard.ts`

- [ ] **Step 1: Escribir el guard**

```ts
import { CanDeactivateFn } from '@angular/router';

export interface ConfirmaSalida {
  canDeactivate(): boolean;
}

export const unsavedGuard: CanDeactivateFn<ConfirmaSalida> = (component) => {
  if (component.canDeactivate()) return true;
  return confirm('Tenés cambios sin enviar. ¿Salir igual?');
};
```

- [ ] **Step 2: Verificar compilación**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/app/features/evaluaciones/unsaved.guard.ts
git commit -m "feat(evaluaciones): unsavedGuard para EvaluarPage"
```

---

## Task 11: `EvaluarPage`

**Files:**
- Create: `src/app/features/evaluaciones/evaluar-page/evaluar-page.ts`
- Create: `src/app/features/evaluaciones/evaluar-page/evaluar-page.html`
- Create: `src/app/features/evaluaciones/evaluar-page/evaluar-page.scss`
- Test: `src/app/features/evaluaciones/evaluar-page/evaluar-page.spec.ts`

Comportamiento:
- Lee `asignacionId` de la ruta → `obtenerAsignacion(id)`.
- `parseSnapshot`; si es `null` → estado de error, no arma form.
- `ACTIVA`: `buildEvaluacionForm`; restaura borrador si existe (aviso); `valueChanges` (debounce 500ms) guarda borrador; `proyeccion` calculada; submit abre el dialog → `enviarEvaluacion` → limpia borrador + navega a `/evaluaciones`.
- `COMPLETADA`: `cargarEvaluacion`; arma form, patch de puntajes/comentarios desde la evaluación, `form.disable()`, modo readonly.
- `CANCELADA`: aviso, sin form.
- Implementa `ConfirmaSalida.canDeactivate()` (true si no editable, no `dirty`, o ya enviado).

- [ ] **Step 1: Escribir el componente**

`evaluar-page.ts`:

```ts
import { HttpErrorResponse } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime } from 'rxjs';

import { EvaluacionesService } from '../evaluaciones.service';
import { EvaluacionDraftStore } from '../evaluacion-draft.store';
import {
  buildEvaluacionForm,
  proyeccionNota,
  toEvaluacionRequest,
  type EvaluacionForm,
} from '../evaluacion-form.builder';
import type { Asignacion, TemplateSnapshot } from '../evaluaciones.models';
import { CriterioField } from '../components/criterio-field/criterio-field';
import { DocumentoViewer } from '../components/documento-viewer/documento-viewer';
import { ConfirmarEnvioDialog } from '../components/confirmar-envio-dialog/confirmar-envio-dialog';
import type { ConfirmaSalida } from '../unsaved.guard';

@Component({
  selector: 'ac-evaluar-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DecimalPipe, CriterioField, DocumentoViewer, ConfirmarEnvioDialog],
  templateUrl: './evaluar-page.html',
  styleUrl: './evaluar-page.scss',
})
export class EvaluarPage implements ConfirmaSalida {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(EvaluacionesService);
  private readonly draft = inject(EvaluacionDraftStore);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly asignacion = signal<Asignacion | null>(null);
  protected readonly snapshot = signal<TemplateSnapshot | null>(null);
  protected readonly form = signal<EvaluacionForm | null>(null);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected readonly submitting = signal<boolean>(false);
  protected readonly confirmOpen = signal<boolean>(false);
  protected readonly enviado = signal<boolean>(false);
  protected readonly proyeccion = signal<number | null>(null);

  protected readonly readonly = computed(() => this.asignacion()?.estado !== 'ACTIVA');

  private id = 0;

  constructor() {
    this.id = Number(this.route.snapshot.paramMap.get('asignacionId'));
    this.service
      .obtenerAsignacion(this.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (a) => this.inicializar(a),
        error: (err: HttpErrorResponse) => {
          this.error.set(err.status === 404 ? 'No encontramos esta asignación.' : 'No se pudo cargar la asignación.');
          this.loading.set(false);
        },
      });
  }

  private inicializar(a: Asignacion): void {
    this.asignacion.set(a);
    const snap = this.service.parseSnapshot(a.templateSnapshot);
    if (!snap) {
      this.error.set('El template de esta evaluación está corrupto.');
      this.loading.set(false);
      return;
    }
    this.snapshot.set(snap);

    if (a.estado === 'CANCELADA') {
      this.loading.set(false);
      return;
    }

    const form = buildEvaluacionForm(snap);

    if (a.estado === 'COMPLETADA') {
      this.service
        .cargarEvaluacion(a.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((ev) => {
          ev.calificaciones.forEach((cal) => {
            const i = snap.criterios.findIndex((c) => c.codigo === cal.criterioCodigo);
            if (i < 0) return;
            const g = form.controls.criterios.at(i).controls;
            g.puntaje.setValue(cal.puntaje);
            g.comentario.setValue(cal.comentario ?? '');
            g.comentarioPrivado.setValue(cal.comentarioPrivado);
          });
          form.controls.comentarioGeneral.setValue(ev.comentarioGeneral ?? '');
          form.disable();
          this.form.set(form);
          this.loading.set(false);
        });
      return;
    }

    // ACTIVA
    const borrador = this.draft.load(a.id);
    if (borrador) {
      form.patchValue(borrador as never);
      this.aviso.set('Borrador restaurado.');
    }
    this.proyeccion.set(proyeccionNota(snap, form));
    form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.proyeccion.set(proyeccionNota(snap, form)));
    form.valueChanges
      .pipe(debounceTime(500), takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => this.draft.save(a.id, v));
    this.form.set(form);
    this.loading.set(false);
  }

  protected abrirConfirmacion(): void {
    if (this.form()?.invalid) {
      this.form()?.markAllAsTouched();
      return;
    }
    this.confirmOpen.set(true);
  }

  protected cancelarConfirmacion(): void {
    this.confirmOpen.set(false);
  }

  protected enviar(): void {
    const snap = this.snapshot();
    const form = this.form();
    if (!snap || !form) return;
    this.submitting.set(true);
    this.service
      .enviarEvaluacion(toEvaluacionRequest(this.id, snap, form))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.draft.clear(this.id);
          this.enviado.set(true);
          this.router.navigate(['/evaluaciones']);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.confirmOpen.set(false);
          this.error.set(
            err.status === 409 || err.status === 422
              ? 'Esta asignación ya no admite evaluación (completada o vencida).'
              : 'No se pudo enviar la evaluación. Volvé a intentar.',
          );
        },
      });
  }

  canDeactivate(): boolean {
    const form = this.form();
    return this.readonly() || this.enviado() || !form || !form.dirty;
  }
}
```

`evaluar-page.html`:

```html
@if (loading()) {
  <p class="eval__estado">Cargando…</p>
} @else if (error()) {
  <p class="eval__estado eval__estado--error">
    {{ error() }} <a routerLink="/evaluaciones">Volver a la cola</a>
  </p>
} @else if (asignacion(); as a) {
  @if (a.estado === 'CANCELADA') {
    <p class="eval__estado">Esta asignación fue cancelada. <a routerLink="/evaluaciones">Volver</a></p>
  } @else {
    <div class="eval">
      <section class="eval__doc">
        <ac-documento-viewer [trabajoId]="a.trabajoId" [versionId]="a.versionamientoId" />
      </section>

      <section class="eval__form">
        <header class="eval__head">
          <h1>{{ a.trabajoTitulo }}</h1>
          <p>v{{ a.versionNumero }}</p>
          @if (readonly()) { <p class="eval__badge">Evaluación enviada</p> }
        </header>

        @if (aviso()) { <p class="eval__aviso">{{ aviso() }}</p> }

        @if (form(); as f) {
          <form [formGroup]="f" (ngSubmit)="abrirConfirmacion()">
            <div formArrayName="criterios">
              @for (c of snapshot()!.criterios; track c.codigo; let i = $index) {
                <ac-criterio-field
                  [criterio]="c"
                  [group]="$any(f.controls.criterios.at(i))"
                  [readonly]="readonly()" />
              }
            </div>

            <label class="eval__general">
              Comentario general
              <textarea formControlName="comentarioGeneral" rows="3"></textarea>
            </label>

            @if (!readonly()) {
              <p class="eval__proyeccion">
                Proyección: {{ proyeccion() | number: '1.1-2' }} / umbral
                {{ snapshot()!.umbralAprobacion | number: '1.1-2' }}
              </p>
              <button type="submit" class="eval__enviar" [disabled]="submitting()">Enviar evaluación</button>
            }
          </form>
        }
      </section>
    </div>

    <ac-confirmar-envio-dialog
      [open]="confirmOpen()"
      [proyeccion]="proyeccion()"
      [umbral]="snapshot()?.umbralAprobacion ?? null"
      [submitting]="submitting()"
      (confirmar)="enviar()"
      (cancelar)="cancelarConfirmacion()" />
  }
}
```

> Nota: el template usa `routerLink` → agregar `RouterLink` a `imports` del `@Component` y `import { RouterLink } from '@angular/router';`.

`evaluar-page.scss`:

```scss
.eval {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
  align-items: start;

  &__doc {
    position: sticky;
    top: var(--space-4);
    height: calc(100vh - var(--space-6));
  }
  &__head h1 {
    margin: 0 0 var(--space-1);
  }
  &__badge {
    display: inline-block;
    color: var(--color-accent);
    font-weight: 600;
  }
  &__aviso {
    color: var(--color-accent);
  }
  &__general {
    display: block;
    margin: var(--space-3) 0;

    textarea {
      width: 100%;
    }
  }
  &__proyeccion {
    font-weight: 600;
  }
  &__estado--error {
    color: var(--color-danger);
  }
}

@media (max-width: 900px) {
  .eval {
    grid-template-columns: 1fr;
  }
  .eval__doc {
    position: static;
    height: auto;
  }
}
```

- [ ] **Step 2: Aplicar la nota del template**

Editar `evaluar-page.ts`: agregar `RouterLink` a `imports` del `@Component` e `import { RouterLink } from '@angular/router';`.

- [ ] **Step 3: Escribir el test que falla**

`evaluar-page.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute } from '@angular/router';

import { EvaluarPage } from './evaluar-page';
import { environment } from '@env/environment';
import type { Asignacion } from '../evaluaciones.models';

const api = environment.apiBase;

const SNAP = JSON.stringify({
  criterios: [{ codigo: 'C1', nombre: 'Claridad', tipo: 'ESCALA', peso: 1, escalaMin: 0, escalaMax: 10 }],
  umbralAprobacion: 6,
});

function mk(estado: Asignacion['estado']): Asignacion {
  return {
    id: 7, trabajoId: 10, trabajoTitulo: 'T7', versionamientoId: 5, versionNumero: 2,
    evaluadorId: 1, evaluadorNombre: 'E', templateSnapshot: SNAP,
    asignadaEn: '2026-06-01T00:00:00Z', vencimientoEn: '2026-06-20T00:00:00Z',
    estado, createdAt: '2026-06-01T00:00:00Z',
  };
}

describe('EvaluarPage', () => {
  let http: HttpTestingController;

  function create() {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['asignacionId', '7']]) } } },
      ],
    });
    const fixture = TestBed.createComponent(EvaluarPage);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('en ACTIVA arma el formulario editable y proyecta la nota', () => {
    const fixture = create();
    http.expectOne(`${api}/api/asignaciones/7`).flush(mk('ACTIVA'));
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp['form']()!.controls.criterios.at(0).controls.puntaje.setValue(8);
    cmp['form']()!.updateValueAndValidity();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Proyección');
  });

  it('en COMPLETADA carga la evaluación y queda readonly', () => {
    const fixture = create();
    http.expectOne(`${api}/api/asignaciones/7`).flush(mk('COMPLETADA'));
    http.expectOne(`${api}/api/asignaciones/7/evaluacion`).flush({
      id: 1, asignacionId: 7, estado: 'COMPLETADA', calificacionFinal: 8, comentarioGeneral: 'ok',
      calificaciones: [{ criterioCodigo: 'C1', puntaje: 8, comentario: 'bien', comentarioPrivado: true }],
      completadaEn: '2026-06-10T00:00:00Z',
    });
    fixture.detectChanges();
    expect(fixture.componentInstance['readonly']()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Evaluación enviada');
  });

  it('snapshot corrupto muestra error', () => {
    const fixture = create();
    const a = mk('ACTIVA');
    a.templateSnapshot = 'no-json';
    http.expectOne(`${api}/api/asignaciones/7`).flush(a);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('corrupto');
  });
});
```

- [ ] **Step 4: Correr el test (FAIL → PASS)**

Run: `npx ng test --include='**/evaluar-page.spec.ts'`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/features/evaluaciones/evaluar-page/
git commit -m "feat(evaluaciones): EvaluarPage (split, borrador, confirmación, readonly) con tests"
```

---

## Task 12: Routes + registro en app.routes + sidebar

**Files:**
- Create: `src/app/features/evaluaciones/evaluaciones.routes.ts`
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/layout/sidebar/sidebar.ts`

- [ ] **Step 1: Crear `evaluaciones.routes.ts`**

```ts
import { Routes } from '@angular/router';

import { authGuard } from '@core/auth/auth.guard';
import { roleGuard } from '@core/auth/role.guard';
import { unsavedGuard } from './unsaved.guard';

export const EVALUACIONES_ROUTES: Routes = [
  {
    path: 'evaluaciones',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['PROFESOR', 'EXTERNO'] },
    loadComponent: () => import('./cola-page/cola-page').then((m) => m.ColaPage),
    title: 'Evaluaciones · AcademConnect',
  },
  {
    path: 'evaluaciones/:asignacionId',
    canActivate: [authGuard, roleGuard],
    canDeactivate: [unsavedGuard],
    data: { roles: ['PROFESOR', 'EXTERNO'] },
    loadComponent: () => import('./evaluar-page/evaluar-page').then((m) => m.EvaluarPage),
    title: 'Evaluar · AcademConnect',
  },
];
```

- [ ] **Step 2: Registrar en `app.routes.ts`**

Agregar el import junto a los otros:

```ts
import { EVALUACIONES_ROUTES } from '@features/evaluaciones/evaluaciones.routes';
```

Y dentro de `children` del shell, junto a las demás features:

```ts
      ...EVALUACIONES_ROUTES,
```

- [ ] **Step 3: Cablear el sidebar**

En `src/app/layout/sidebar/sidebar.ts`, dentro de `SECTIONS_EVALUADOR` → sección `'Trabajo'`, reemplazar:

```ts
      { label: 'Evaluaciones asignadas' },
      { label: 'Bandeja de revisión' },
```

por:

```ts
      { label: 'Evaluaciones asignadas', route: '/evaluaciones', exact: false },
```

- [ ] **Step 4: Verificar compilación y build de rutas**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/evaluaciones/evaluaciones.routes.ts src/app/app.routes.ts src/app/layout/sidebar/sidebar.ts
git commit -m "feat(evaluaciones): rutas + registro en shell + link en sidebar del evaluador"
```

---

## Task 13: Verificación final

- [ ] **Step 1: Correr toda la suite de la feature**

Run: `npx ng test --include='**/evaluaciones/**/*.spec.ts'`
Expected: PASS (todas: service 7, builder 7, draft 4, criterio-field 2, asignacion-card 2, cola-page 2, evaluar-page 3).

- [ ] **Step 2: Lint**

Run: `npx ng lint` (si el proyecto tiene lint configurado; si no, omitir)
Expected: sin errores nuevos en `features/evaluaciones`.

- [ ] **Step 3: Build de producción**

Run: `npx ng build`
Expected: build OK, chunk lazy de `evaluaciones` generado.

- [ ] **Step 4: Verificación manual (checklist)**

Levantar la app (`npx ng serve`), login como `PROFESOR`:
- Sidebar muestra "Evaluaciones asignadas" linkeando a `/evaluaciones`.
- La cola lista asignaciones activas; el tab "Completadas" refetch.
- Abrir una activa: se ve el PDF a la izquierda y el formulario a la derecha.
- Puntuar criterios → la proyección de nota se actualiza en vivo.
- Recargar la página → el borrador se restaura ("Borrador restaurado").
- Enviar → diálogo de confirmación → al confirmar vuelve a la cola.
- Abrir una completada: formulario en readonly con badge "Evaluación enviada".

- [ ] **Step 5: Commit final (si hubo ajustes)**

```bash
git add -A
git commit -m "chore(evaluaciones): ajustes de verificación final"
```

---

## Notas para quien implementa

- **Tokens SCSS:** los nombres de variables (`--color-border`, `--space-3`, `--color-accent`, `--color-danger`, `--radius-md`, etc.) deben existir en el sistema de design tokens del proyecto. Si alguno no existe, inspeccioná `src/styles` o un componente vecino (`trabajo-card.scss`, `asignacion-card` del repo) y usá el equivalente. No inventes valores hardcodeados.
- **`$any(...)` en el template** de `EvaluarPage` es para evitar fricción de tipos al pasar el `FormGroup` indexado del `FormArray` al `criterio-field`; es el mismo patrón pragmático que se usa con forms tipados + componentes hijos.
- **Accesibilidad (requisito del proyecto):** todos los inputs llevan label asociado (visible o `.sr-only`); el `<dialog>` nativo aporta focus trap y cierre con Esc; los tabs usan `role="tab"` + `aria-selected`. Pasá AXE antes de cerrar.
- **Fuera de alcance** (no implementar acá): carga/stats del evaluador, sesiones, disponibilidad, reconocimientos, sugerencia/creación de asignaciones (admin).
```
