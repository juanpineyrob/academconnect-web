# Recomendación de orientadores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recomendar orientadores al alumno (ranking por afinidad de áreas + carga) al invitar, manteniendo la libre elección de cualquier profesor.

**Architecture:** Backend nuevo en `RecomendadorService.sugerirOrientadores` (mirror del recomendador de evaluadores, sin disponibilidad ni persistencia) expuesto por un endpoint dueño-only en `MeTrabajoController`. El frontend reemplaza el `<select>` plano del `invitar-orientador-form` por "★ Recomendados" (top 3) + buscador con todos, alimentados por una sola llamada.

**Tech Stack:** Backend Spring Boot (Java, JPA, Mockito/JUnit5) en `/home/ignacio/Projects/academconnect`. Frontend Angular v20 (signals, reactive forms, Karma) en `/home/ignacio/Projects/academconnect-web`.

**Dos repos.** Los comandos `git` usan `git -C <repo>`. Backend = `/home/ignacio/Projects/academconnect`. Frontend = `/home/ignacio/Projects/academconnect-web`.

**Spec:** `docs/superpowers/specs/2026-06-24-recomendacion-orientadores-design.md`

---

## Task 1: DTO `SugerenciaOrientadorResponse` (backend)

**Files:**
- Create: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/dto/SugerenciaOrientadorResponse.java`

- [ ] **Step 1: Crear el record DTO**

```java
package com.academconnect.dto;

import java.math.BigDecimal;
import java.util.List;

public record SugerenciaOrientadorResponse(
        Long id,
        String nombre,
        String email,
        List<String> areasNombres,
        long cargaActiva,
        BigDecimal afinidad,
        BigDecimal score) {
}
```

- [ ] **Step 2: Compilar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q compile`
Expected: BUILD SUCCESS.

- [ ] **Step 3: Commit**

```bash
git -C /home/ignacio/Projects/academconnect add src/main/java/com/academconnect/dto/SugerenciaOrientadorResponse.java
git -C /home/ignacio/Projects/academconnect commit -m "feat(recomendador): DTO de sugerencia de orientador"
```

---

## Task 2: Repo `countByOrientadorIdAndEstadoNotIn` (backend)

**Files:**
- Modify: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/repository/TrabajoRepository.java`

- [ ] **Step 1: Agregar el método derivado**

Debajo de la línea existente `long countByOrientadorIdAndEstado(Long orientadorId, EstadoTrabajo estado);` agregar:

```java
    /** Carga de un orientador: trabajos suyos cuyo estado NO está en la lista dada (los activos). */
    long countByOrientadorIdAndEstadoNotIn(Long orientadorId, java.util.Collection<EstadoTrabajo> estados);
```

- [ ] **Step 2: Compilar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q compile`
Expected: BUILD SUCCESS (Spring Data deriva la query del nombre).

- [ ] **Step 3: Commit**

```bash
git -C /home/ignacio/Projects/academconnect add src/main/java/com/academconnect/repository/TrabajoRepository.java
git -C /home/ignacio/Projects/academconnect commit -m "feat(recomendador): conteo de carga activa de orientador"
```

---

## Task 3: `RecomendadorService.sugerirOrientadores` (backend, TDD)

**Files:**
- Modify: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/service/RecomendadorService.java`
- Test: `/home/ignacio/Projects/academconnect/src/test/java/com/academconnect/service/RecomendadorServiceTests.java`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir estos campos de pesos al `setup()` existente (junto a los `w1/w2/w3`):

```java
        ReflectionTestUtils.setField(service, "wo1", 0.7);
        ReflectionTestUtils.setField(service, "wo2", 0.3);
```

Agregar estos tests al final de la clase `RecomendadorServiceTests` (reusa los fixtures `trabajoConAreas`, `profesor1..4`, `area1/area2/otraArea` ya construidos en `setup()`):

```java
    @Test
    void sugerirOrientadores_rankeaPorAfinidadJaccard() {
        Mockito.when(trabajoRepository.findById(trabajoId)).thenReturn(Optional.of(trabajoConAreas));
        Mockito.when(profesorRepository.findByActivo(true))
                .thenReturn(List.of(profesor1, profesor2));
        // profesor1 comparte area1+area2 (afinidad alta); profesor2 sólo otraArea (afinidad 0)
        Mockito.when(uatRepository.findByIdUsuarioId(profesor1.getId()))
                .thenReturn(List.of(uat(profesor1, area1), uat(profesor1, area2)));
        Mockito.when(uatRepository.findByIdUsuarioId(profesor2.getId()))
                .thenReturn(List.of(uat(profesor2, otraArea)));
        Mockito.when(trabajoRepository.countByOrientadorIdAndEstadoNotIn(
                Mockito.anyLong(), Mockito.anyCollection())).thenReturn(0L);

        var res = service.sugerirOrientadores(trabajoId);

        Assertions.assertEquals(2, res.size());
        Assertions.assertEquals(profesor1.getId(), res.get(0).id());
        Assertions.assertTrue(
                res.get(0).afinidad().compareTo(res.get(1).afinidad()) > 0);
    }

    @Test
    void sugerirOrientadores_aIgualAfinidadPrefiereMenorCarga() {
        Mockito.when(trabajoRepository.findById(trabajoId)).thenReturn(Optional.of(trabajoConAreas));
        Mockito.when(profesorRepository.findByActivo(true))
                .thenReturn(List.of(profesor1, profesor2));
        // misma afinidad (ambos comparten area1+area2)
        Mockito.when(uatRepository.findByIdUsuarioId(Mockito.anyLong()))
                .thenReturn(List.of(uat(profesor1, area1), uat(profesor1, area2)));
        Mockito.when(trabajoRepository.countByOrientadorIdAndEstadoNotIn(
                Mockito.eq(profesor1.getId()), Mockito.anyCollection())).thenReturn(5L);
        Mockito.when(trabajoRepository.countByOrientadorIdAndEstadoNotIn(
                Mockito.eq(profesor2.getId()), Mockito.anyCollection())).thenReturn(0L);

        var res = service.sugerirOrientadores(trabajoId);

        Assertions.assertEquals(profesor2.getId(), res.get(0).id());
        Assertions.assertEquals(0L, res.get(0).cargaActiva());
    }

    @Test
    void sugerirOrientadores_excluyeAlOrientadorActual() {
        trabajoConAreas.setOrientador(profesor1);
        Mockito.when(trabajoRepository.findById(trabajoId)).thenReturn(Optional.of(trabajoConAreas));
        Mockito.when(profesorRepository.findByActivo(true))
                .thenReturn(List.of(profesor1, profesor2));
        Mockito.when(uatRepository.findByIdUsuarioId(Mockito.anyLong()))
                .thenReturn(List.of(uat(profesor2, area1)));
        Mockito.when(trabajoRepository.countByOrientadorIdAndEstadoNotIn(
                Mockito.anyLong(), Mockito.anyCollection())).thenReturn(0L);

        var res = service.sugerirOrientadores(trabajoId);

        Assertions.assertEquals(1, res.size());
        Assertions.assertEquals(profesor2.getId(), res.get(0).id());
    }
```

Agregar este helper privado al final de la clase de test:

```java
    private com.academconnect.domain.UsuarioAreaTematica uat(
            Profesor p, AreaTematica area) {
        return new com.academconnect.domain.UsuarioAreaTematica(
                p, area, com.academconnect.domain.NivelExperticia.INTERMEDIO);
    }
```

> Nota: si `NivelExperticia` no tiene el valor `INTERMEDIO`, usá el primer valor del enum (`NivelExperticia.values()[0]`). Verificá con: `grep -A6 "enum NivelExperticia" /home/ignacio/Projects/academconnect/src/main/java/com/academconnect/domain/NivelExperticia.java`

- [ ] **Step 2: Correr los tests para verlos fallar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=RecomendadorServiceTests`
Expected: FAIL — `sugerirOrientadores` no existe / no compila.

- [ ] **Step 3: Implementar `sugerirOrientadores`**

En `RecomendadorService`, agregar los pesos junto a los `@Value` existentes:

```java
    @Value("${academconnect.algoritmo.orientador.w1:0.7}")
    private double wo1;

    @Value("${academconnect.algoritmo.orientador.w2:0.3}")
    private double wo2;
```

Agregar la constante de estados finalizados (cerca del tope de la clase, tras `OBJECT_MAPPER`):

```java
    private static final List<com.academconnect.domain.EstadoTrabajo> ESTADOS_FINALIZADOS = List.of(
            com.academconnect.domain.EstadoTrabajo.APROBADO,
            com.academconnect.domain.EstadoTrabajo.RECHAZADO,
            com.academconnect.domain.EstadoTrabajo.CANCELADO);
```

Agregar los imports necesarios al tope: `import com.academconnect.domain.AreaTematica;`, `import com.academconnect.domain.Profesor;`, `import com.academconnect.dto.SugerenciaOrientadorResponse;`.

Agregar los métodos (junto a `sugerirRevisores`):

```java
    @Transactional(readOnly = true)
    public List<SugerenciaOrientadorResponse> sugerirOrientadores(Long trabajoId) {
        var trabajo = trabajoRepository.findById(trabajoId)
                .orElseThrow(() -> new ResourceNotFoundException("Trabajo", trabajoId));

        Set<Long> areasTrabajoIds = trabajo.getAreas().stream()
                .map(AreaTematica::getId)
                .collect(Collectors.toSet());

        Long orientadorActualId = trabajo.getOrientador() == null
                ? null : trabajo.getOrientador().getId();

        List<Profesor> candidatos = profesorRepository.findByActivo(true).stream()
                .filter(p -> orientadorActualId == null || !p.getId().equals(orientadorActualId))
                .toList();

        Map<Long, Long> cargas = candidatos.stream()
                .collect(Collectors.toMap(
                        Profesor::getId,
                        p -> trabajoRepository.countByOrientadorIdAndEstadoNotIn(
                                p.getId(), ESTADOS_FINALIZADOS)));

        long maxCarga = cargas.values().stream().max(Comparator.naturalOrder()).orElse(0L);

        return candidatos.stream()
                .map(p -> puntuarOrientador(p, areasTrabajoIds, cargas.get(p.getId()), maxCarga))
                .sorted((a, b) -> {
                    int c = b.score().compareTo(a.score());
                    return c != 0 ? c : a.nombre().compareTo(b.nombre());
                })
                .toList();
    }

    private SugerenciaOrientadorResponse puntuarOrientador(
            Profesor p, Set<Long> areasTrabajoIds, long carga, long maxCarga) {

        var uats = uatRepository.findByIdUsuarioId(p.getId());
        Set<Long> areasProfe = uats.stream()
                .map(u -> u.getId().getAreaId())
                .collect(Collectors.toSet());
        List<String> areasNombres = uats.stream()
                .map(u -> u.getArea().getNombre())
                .sorted()
                .toList();

        double afinidad = jaccard(areasTrabajoIds, areasProfe);
        double cargaNorm = maxCarga == 0 ? 0.0 : (double) carga / maxCarga;
        double score = wo1 * afinidad + wo2 * (1.0 - cargaNorm);

        return new SugerenciaOrientadorResponse(
                p.getId(), p.getNombre(), p.getEmail(),
                areasNombres, carga, bd4(afinidad), bd4(score));
    }
```

- [ ] **Step 4: Correr los tests para verlos pasar**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest=RecomendadorServiceTests`
Expected: PASS (todos los tests, viejos y nuevos).

- [ ] **Step 5: Commit**

```bash
git -C /home/ignacio/Projects/academconnect add src/main/java/com/academconnect/service/RecomendadorService.java src/test/java/com/academconnect/service/RecomendadorServiceTests.java
git -C /home/ignacio/Projects/academconnect commit -m "feat(recomendador): sugerencia de orientadores por afinidad y carga"
```

---

## Task 4: Endpoint dueño-only en `MeTrabajoController` (backend)

**Files:**
- Modify: `/home/ignacio/Projects/academconnect/src/main/java/com/academconnect/controller/MeTrabajoController.java`

- [ ] **Step 1: Inyectar el recomendador y agregar el endpoint**

Agregar el campo (junto a `private final TrabajoService service;`):

```java
    private final com.academconnect.service.RecomendadorService recomendadorService;
```

Agregar el endpoint (después de `buscarPorId`):

```java
    @GetMapping("/{id}/sugerir-orientadores")
    @PreAuthorize("hasRole('ESTUDIANTE')")
    public java.util.List<com.academconnect.dto.SugerenciaOrientadorResponse> sugerirOrientadores(
            @PathVariable Long id, Authentication authn) {
        var trabajo = service.buscarPorId(id);
        if (trabajo.estudianteId() == null
                || !trabajo.estudianteId().equals(currentUserId(authn))) {
            throw new ResourceNotFoundException("Trabajo", id);
        }
        return recomendadorService.sugerirOrientadores(id);
    }
```

- [ ] **Step 2: Compilar y correr el suite de controller/web existente**

Run: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test -Dtest='*MeTrabajo*,*RecomendadorService*'`
Expected: BUILD SUCCESS / PASS. Si no hay test de MeTrabajo, basta con `./mvnw -q compile`.

- [ ] **Step 3: Commit**

```bash
git -C /home/ignacio/Projects/academconnect add src/main/java/com/academconnect/controller/MeTrabajoController.java
git -C /home/ignacio/Projects/academconnect commit -m "feat(recomendador): endpoint dueño-only para sugerir orientadores"
```

---

## Task 5: Servicio + modelo frontend (TDD)

**Files:**
- Modify: `/home/ignacio/Projects/academconnect-web/src/app/features/mis-trabajos/mis-trabajos.models.ts`
- Modify: `/home/ignacio/Projects/academconnect-web/src/app/features/mis-trabajos/mis-trabajos.service.ts`
- Test: `/home/ignacio/Projects/academconnect-web/src/app/features/mis-trabajos/mis-trabajos.service.spec.ts` (crear si no existe)

- [ ] **Step 1: Agregar el modelo**

Al final de `mis-trabajos.models.ts` agregar:

```typescript
export interface OrientadorSugerido {
  id: number;
  nombre: string;
  email: string;
  areasNombres: string[];
  cargaActiva: number;
  afinidad: number;
  score: number;
}
```

- [ ] **Step 2: Escribir el test que falla**

Crear/editar `mis-trabajos.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { MisTrabajosService } from './mis-trabajos.service';
import { environment } from '@env/environment';

const api = environment.apiBase;

describe('MisTrabajosService', () => {
  let service: MisTrabajosService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MisTrabajosService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sugerirOrientadores pega a /api/me/trabajos/{id}/sugerir-orientadores', () => {
    service.sugerirOrientadores(7).subscribe((res) => {
      expect(res.length).toBe(1);
      expect(res[0].nombre).toBe('Ana');
    });
    const req = http.expectOne(`${api}/api/me/trabajos/7/sugerir-orientadores`);
    expect(req.request.method).toBe('GET');
    req.flush([{
      id: 1, nombre: 'Ana', email: 'a@x.com',
      areasNombres: ['IA'], cargaActiva: 2, afinidad: 0.8, score: 0.74,
    }]);
  });
});
```

- [ ] **Step 3: Correr el test para verlo fallar**

Run: `cd /home/ignacio/Projects/academconnect-web && npx ng test --watch=false --browsers=ChromeHeadless --include='**/mis-trabajos.service.spec.ts'`
Expected: FAIL — `service.sugerirOrientadores is not a function`.

- [ ] **Step 4: Implementar el método en el servicio**

En `mis-trabajos.service.ts`, agregar el import del modelo y el método:

```typescript
import { OrientadorSugerido, TrabajoEstudianteRequest } from './mis-trabajos.models';
```

```typescript
  sugerirOrientadores(trabajoId: number): Observable<OrientadorSugerido[]> {
    return this.http.get<OrientadorSugerido[]>(
      `${this.api}/api/me/trabajos/${trabajoId}/sugerir-orientadores`);
  }
```

- [ ] **Step 5: Correr el test para verlo pasar**

Run: `cd /home/ignacio/Projects/academconnect-web && npx ng test --watch=false --browsers=ChromeHeadless --include='**/mis-trabajos.service.spec.ts'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -C /home/ignacio/Projects/academconnect-web add src/app/features/mis-trabajos/mis-trabajos.models.ts src/app/features/mis-trabajos/mis-trabajos.service.ts src/app/features/mis-trabajos/mis-trabajos.service.spec.ts
git -C /home/ignacio/Projects/academconnect-web commit -m "feat(mis-trabajos): servicio para sugerir orientadores"
```

---

## Task 6: Rework de `invitar-orientador-form` (TDD)

**Files:**
- Modify: `/home/ignacio/Projects/academconnect-web/src/app/features/mis-trabajos/components/invitar-orientador-form/invitar-orientador-form.ts`
- Modify: `/home/ignacio/Projects/academconnect-web/src/app/features/mis-trabajos/components/invitar-orientador-form/invitar-orientador-form.html`
- Test: `/home/ignacio/Projects/academconnect-web/src/app/features/mis-trabajos/components/invitar-orientador-form/invitar-orientador-form.spec.ts` (crear)

- [ ] **Step 1: Escribir el test de componente que falla**

Crear `invitar-orientador-form.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `cd /home/ignacio/Projects/academconnect-web && npx ng test --watch=false --browsers=ChromeHeadless --include='**/invitar-orientador-form.spec.ts'`
Expected: FAIL — el componente todavía llama a `AdminService` y no tiene `query`/`seleccionar`/clases nuevas.

- [ ] **Step 3: Reescribir el componente TS**

Reemplazar el contenido completo de `invitar-orientador-form.ts` por:

```typescript
import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, output, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { Button } from '@shared/ui/button/button';
import { TrabajoListItem } from '@features/repositorio/repositorio.models';
import { MisTrabajosService } from '../../mis-trabajos.service';
import { OrientadorSugerido } from '../../mis-trabajos.models';

const TOP_RECOMENDADOS = 3;

@Component({
  selector: 'ac-invitar-orientador-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Button],
  templateUrl: './invitar-orientador-form.html',
  styleUrl: './invitar-orientador-form.scss',
})
export class InvitarOrientadorForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(MisTrabajosService);
  private readonly destroyRef = inject(DestroyRef);

  readonly trabajo = input.required<TrabajoListItem>();
  readonly submitting = input<boolean>(false);
  readonly enviar = output<{ profesorId: number; motivo: string | null }>();

  protected readonly sugerencias = signal<OrientadorSugerido[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly query = signal<string>('');

  protected readonly form = this.fb.nonNullable.group({
    profesorId: [null as number | null, Validators.required],
    motivo: [''],
  });

  protected readonly recomendados = computed(() => this.sugerencias().slice(0, TOP_RECOMENDADOS));
  protected readonly todos = computed(() => {
    const q = this.query().trim().toLowerCase();
    const base = this.sugerencias();
    return q ? base.filter((s) => s.nombre.toLowerCase().includes(q)) : base;
  });

  ngOnInit(): void {
    this.service.sugerirOrientadores(this.trabajo().id)
      .pipe(catchError(() => of<OrientadorSugerido[]>([])), takeUntilDestroyed(this.destroyRef))
      .subscribe((ss) => { this.sugerencias.set(ss); this.loading.set(false); });
  }

  protected seleccionar(id: number): void {
    this.form.controls.profesorId.setValue(id);
  }

  protected onQuery(value: string): void {
    this.query.set(value);
  }

  protected onSubmit(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.enviar.emit({ profesorId: v.profesorId!, motivo: v.motivo.trim() || null });
  }
}
```

- [ ] **Step 4: Reescribir el template HTML**

Reemplazar el contenido completo de `invitar-orientador-form.html` por:

```html
<form class="invitar-form" [formGroup]="form" (ngSubmit)="onSubmit()" novalidate>
  @if (loading()) {
    <span class="invitar-form__hint" role="status">Buscando orientadores recomendados…</span>
  } @else {
    @if (recomendados().length > 0) {
      <fieldset class="invitar-form__field">
        <legend class="invitar-form__label">★ Recomendados</legend>
        <ul class="invitar-form__recos" role="radiogroup" aria-label="Orientadores recomendados">
          @for (p of recomendados(); track p.id) {
            <li class="invitar-form__reco">
              <label class="invitar-form__reco-label">
                <input type="radio" formControlName="profesorId" [value]="p.id" (change)="seleccionar(p.id)" />
                <span class="invitar-form__reco-nombre">{{ p.nombre }}</span>
                <span class="invitar-form__reco-areas">{{ p.areasNombres.join(', ') }} · {{ p.cargaActiva }} trabajos activos</span>
                <span class="invitar-form__afinidad"
                      [style.--afinidad]="p.afinidad"
                      [attr.aria-label]="'Afinidad ' + (p.afinidad * 100 | number:'1.0-0') + '%'"></span>
              </label>
            </li>
          }
        </ul>
      </fieldset>
    }

    <fieldset class="invitar-form__field">
      <legend class="invitar-form__label">Todos los profesores</legend>
      <input type="search" class="invitar-form__search" placeholder="Buscar por nombre…"
             aria-label="Buscar profesor por nombre"
             [value]="query()" (input)="onQuery($any($event.target).value)" />
      <ul class="invitar-form__todos" role="radiogroup" aria-label="Todos los profesores">
        @for (p of todos(); track p.id) {
          <li class="invitar-form__todos-item">
            <label class="invitar-form__todos-label">
              <input type="radio" formControlName="profesorId" [value]="p.id" (change)="seleccionar(p.id)" />
              <span>{{ p.nombre }}</span>
            </label>
          </li>
        } @empty {
          <li class="invitar-form__hint">No hay profesores que coincidan.</li>
        }
      </ul>
    </fieldset>
  }

  <label class="invitar-form__field">
    <span class="invitar-form__label">Mensaje (opcional)</span>
    <textarea formControlName="motivo" rows="3" maxlength="1000"
              class="invitar-form__textarea"
              placeholder="Contale a tu posible orientador por qué te interesa trabajar con él/ella."></textarea>
  </label>

  <div class="invitar-form__actions">
    <ac-button size="sm" type="submit" [loading]="submitting()"
               [disabled]="submitting() || form.invalid">Enviar invitación</ac-button>
  </div>
</form>
```

> El `import { DecimalPipe }`: el template usa el pipe `number`. Si el build se queja de pipe desconocido, agregá `DecimalPipe` a `imports` del componente y `import { DecimalPipe } from '@angular/common';`. Alternativa sin pipe: cambiar la expresión por `(p.afinidad * 100).toFixed(0)`.

- [ ] **Step 5: Correr el test para verlo pasar**

Run: `cd /home/ignacio/Projects/academconnect-web && npx ng test --watch=false --browsers=ChromeHeadless --include='**/invitar-orientador-form.spec.ts'`
Expected: PASS.

- [ ] **Step 6: Agregar estilos mínimos de la barra de afinidad**

En `invitar-orientador-form.scss`, agregar (la barra usa la variable `--afinidad` 0..1):

```scss
.invitar-form__afinidad {
  display: block;
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(
    to right,
    var(--color-primary, #3b82f6) calc(var(--afinidad, 0) * 100%),
    var(--color-border, #e5e7eb) 0
  );
}
.invitar-form__recos,
.invitar-form__todos { list-style: none; margin: 0; padding: 0; }
.invitar-form__todos { max-height: 240px; overflow-y: auto; }
```

- [ ] **Step 7: Typecheck del frontend**

Run: `cd /home/ignacio/Projects/academconnect-web && npx tsc -p tsconfig.app.json --noEmit`
Expected: sin errores (verifica que ya no queden referencias a `AdminService`/`scoreProfesor`/`ranked`).

- [ ] **Step 8: Commit**

```bash
git -C /home/ignacio/Projects/academconnect-web add src/app/features/mis-trabajos/components/invitar-orientador-form/
git -C /home/ignacio/Projects/academconnect-web commit -m "feat(mis-trabajos): recomendados + buscador en invitar orientador"
```

---

## Verificación final

- [ ] Backend completo: `cd /home/ignacio/Projects/academconnect && ./mvnw -q test` → PASS.
- [ ] Frontend completo: `cd /home/ignacio/Projects/academconnect-web && npx ng test --watch=false --browsers=ChromeHeadless` → PASS.
- [ ] Manual: como estudiante, abrir un trabajo en BORRADOR → "Invitar orientador" muestra recomendados ordenados por afinidad y permite elegir cualquiera vía el buscador.
