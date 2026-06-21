import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';

import { AuthService } from '@core/auth/auth.service';
import { RubricasService } from '../rubricas.service';
import {
  sumaPesos,
  distribuirEquitativamente,
  validarRubrica,
  toRubricaRequest,
  type RubricaDraft,
  type CriterioDraft,
} from '../rubrica-builder.builder';
import type { Visibilidad } from '../rubricas.models';
import { CriterioField } from '../../evaluaciones/components/criterio-field/criterio-field';
import { buildEvaluacionForm, proyeccionMax } from '../../evaluaciones/evaluacion-form.builder';
import type { Criterio, CriterioTipo, TemplateSnapshot } from '../../evaluaciones/evaluaciones.models';
import type { ConfirmaSalida } from '../../evaluaciones/unsaved.guard';

type CriterioForm = FormGroup<{
  nombre: FormControl<string>;
  tipo: FormControl<CriterioTipo>;
  peso: FormControl<number>;
  opciones: FormControl<string>;
}>;

@Component({
  selector: 'ac-rubricas-builder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, DecimalPipe, CriterioField],
  templateUrl: './builder-page.html',
  styleUrl: './builder-page.scss',
})
export class BuilderPage implements ConfirmaSalida {
  private readonly service = inject(RubricasService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly TIPOS: CriterioTipo[] = ['ESCALA', 'SLIDER', 'SELECCION', 'BOOLEANO', 'TEXTO'];
  protected readonly TIPO_LABELS: Record<CriterioTipo, string> = {
    ESCALA: 'Escala',
    SLIDER: 'Slider',
    SELECCION: 'Selección',
    BOOLEANO: 'Booleano',
    TEXTO: 'Texto',
  };

  protected readonly form = new FormGroup({
    nombre: new FormControl('', { nonNullable: true }),
    descripcion: new FormControl('', { nonNullable: true }),
    visibilidad: new FormControl<Visibilidad>('PRIVADO', { nonNullable: true }),
    escalaMin: new FormControl(0, { nonNullable: true }),
    escalaMax: new FormControl(10, { nonNullable: true }),
    umbralAprobacion: new FormControl(6, { nonNullable: true }),
    criterios: new FormArray<CriterioForm>([]),
  });

  private readonly draft = signal<RubricaDraft>(this.toDraft());
  protected readonly errores = computed(() => validarRubrica(this.draft()));
  protected readonly totalPesos = computed(() => sumaPesos(this.draft().criterios));
  protected readonly puedeGuardar = computed(() => this.errores().length === 0);
  protected readonly enviando = signal(false);
  protected readonly soloLectura = signal(false);

  protected readonly previewSnapshot = computed<TemplateSnapshot>(() => {
    // Prefijar el código por índice garantiza IDs únicos en la preview aun con
    // criterios sin nombre (slug vacío) o nombres repetidos — evita IDs duplicados
    // en `criterio-field` (label[for]/id), que romperían AXE/WCAG.
    const criterios = (JSON.parse(toRubricaRequest(this.draft()).criterios) as Criterio[]).map(
      (c, i) => ({ ...c, codigo: `preview-${i}-${c.codigo}` }),
    );
    return { criterios, umbralAprobacion: this.draft().umbralAprobacion };
  });
  protected readonly previewEval = computed(() => {
    const f = buildEvaluacionForm(this.previewSnapshot());
    f.disable();
    return f;
  });
  protected readonly previewMax = computed(() => proyeccionMax(this.previewSnapshot()));

  protected editId: number | null = null;

  constructor() {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (this.form.controls.criterios.length === 0) this.agregarCriterio();
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.draft.set(this.toDraft()));
    this.draft.set(this.toDraft());

    if (idParam) {
      this.editId = Number(idParam);
      this.service
        .obtener(this.editId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (r) => {
            this.form.controls.criterios.clear();
            this.form.patchValue({
              nombre: r.nombre,
              descripcion: r.descripcion,
              visibilidad: r.visibilidad,
              escalaMin: r.criterios[0]?.escalaMin ?? 0,
              escalaMax: r.criterios[0]?.escalaMax ?? 10,
              umbralAprobacion: r.umbralAprobacion,
            });
            r.criterios.forEach((c) =>
              this.form.controls.criterios.push(
                this.nuevoCriterio({
                  nombre: c.nombre,
                  tipo: c.tipo,
                  peso: c.peso,
                  opciones: (c.opciones ?? []).join(', '),
                }),
              ),
            );
            const usuario = this.auth.currentUser();
            const esMio = r.autorId === usuario?.userId;
            const esAdmin = usuario?.rol === 'ADMINISTRADOR';
            if (!esMio && !esAdmin) {
              this.form.disable();
              this.soloLectura.set(true);
            }
            this.draft.set(this.toDraft());
          },
        });
    }
  }

  private nuevoCriterio(
    init?: Partial<{ nombre: string; tipo: CriterioTipo; peso: number; opciones: string }>,
  ): CriterioForm {
    return new FormGroup({
      nombre: new FormControl(init?.nombre ?? '', { nonNullable: true }),
      tipo: new FormControl<CriterioTipo>(init?.tipo ?? 'ESCALA', { nonNullable: true }),
      peso: new FormControl(init?.peso ?? 0, { nonNullable: true }),
      opciones: new FormControl(init?.opciones ?? '', { nonNullable: true }),
    });
  }

  protected agregarCriterio(): void {
    this.form.controls.criterios.push(this.nuevoCriterio());
  }

  protected quitarCriterio(i: number): void {
    this.form.controls.criterios.removeAt(i);
  }

  protected distribuir(): void {
    const pesos = distribuirEquitativamente(this.toDraft().criterios);
    this.form.controls.criterios.controls.forEach((g, i) => g.controls.peso.setValue(pesos[i]));
  }

  private toDraft(): RubricaDraft {
    const v = this.form.getRawValue();
    const criterios: CriterioDraft[] = v.criterios.map((c) => ({
      nombre: c.nombre,
      tipo: c.tipo,
      // `Number(...)` blinda contra un campo numérico vacío (que el value accessor
      // emite como null) sin alterar los valores numéricos normales.
      peso: c.tipo === 'TEXTO' ? 0 : Number(c.peso) || 0,
      opciones: c.opciones
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    }));
    return {
      nombre: v.nombre,
      descripcion: v.descripcion,
      visibilidad: v.visibilidad,
      escalaMin: Number(v.escalaMin) || 0,
      escalaMax: Number(v.escalaMax) || 0,
      umbralAprobacion: Number(v.umbralAprobacion) || 0,
      criterios,
    };
  }

  protected guardar(): void {
    if (!this.puedeGuardar()) return;
    this.enviando.set(true);
    const req = toRubricaRequest(this.draft());
    const obs = this.editId ? this.service.actualizar(this.editId, req) : this.service.crear(req);
    obs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.form.markAsPristine();
        this.router.navigate(['/rubricas']);
      },
      error: () => this.enviando.set(false),
    });
  }

  canDeactivate(): boolean {
    return this.soloLectura() || !this.form.dirty || this.enviando();
  }
}
