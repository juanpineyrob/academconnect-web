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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';

import { EvaluacionesService } from '../evaluaciones.service';
import { EvaluacionDraftStore } from '../evaluacion-draft.store';
import {
  buildEvaluacionForm,
  contarCompletos,
  proyeccionMax,
  proyeccionNota,
  toEvaluacionRequest,
  type AvanceRubrica,
  type EvaluacionForm,
} from '../evaluacion-form.builder';
import type { Asignacion, TemplateSnapshot } from '../evaluaciones.models';
import { CriterioField } from '../components/criterio-field/criterio-field';
import { DocumentoViewer } from '../components/documento-viewer/documento-viewer';
import { ConfirmarEnvioDialog } from '../components/confirmar-envio-dialog/confirmar-envio-dialog';
import { SelectorRubricaDialog } from '../components/selector-rubrica-dialog/selector-rubrica-dialog';
import type { ConfirmaSalida } from '../unsaved.guard';

@Component({
  selector: 'ac-evaluar-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule, RouterLink, DecimalPipe,
    CriterioField, DocumentoViewer, ConfirmarEnvioDialog, SelectorRubricaDialog,
  ],
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
  protected readonly rubricaPendiente = signal<boolean>(false);
  protected readonly selectorOpen = signal<boolean>(false);
  protected readonly proyeccion = signal<number | null>(null);
  protected readonly proyMax = signal<number>(0);
  protected readonly avance = signal<AvanceRubrica>({ hechos: 0, total: 0 });

  protected readonly readonly = computed(() => this.asignacion()?.estado !== 'ACTIVA');

  // Geometría del anillo de proyección (SVG).
  protected readonly RADIO = 52;
  protected readonly circ = 2 * Math.PI * this.RADIO;
  protected readonly anilloOffset = computed(() => {
    const max = this.proyMax();
    const frac = max > 0 ? Math.min(Math.max((this.proyeccion() ?? 0) / max, 0), 1) : 0;
    return this.circ * (1 - frac);
  });
  protected readonly avancePct = computed(() => {
    const { hechos, total } = this.avance();
    return total > 0 ? Math.round((hechos / total) * 100) : 0;
  });
  protected readonly alcanzaUmbral = computed(() => {
    const umbral = this.snapshot()?.umbralAprobacion;
    const proy = this.proyeccion();
    return umbral != null && proy != null && proy >= umbral;
  });

  private id = 0;
  private rubricaPreseleccion: number | null = null;

  constructor() {
    this.id = Number(this.route.snapshot.paramMap.get('asignacionId'));
    const rubricaParam = this.route.snapshot.queryParamMap?.get('rubrica');
    this.rubricaPreseleccion = rubricaParam ? Number(rubricaParam) : null;
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

    const tieneRubrica = !!a.templateSnapshot && a.templateSnapshot.trim().length > 0;

    // ACTIVA sin rúbrica ⇒ el evaluador debe elegirla antes de evaluar.
    if (a.estado === 'ACTIVA' && !tieneRubrica) {
      this.snapshot.set(null);
      this.form.set(null);
      this.rubricaPendiente.set(true);
      if (this.rubricaPreseleccion != null) {
        // Volvemos de crear una rúbrica: auto-seleccionarla.
        const id = this.rubricaPreseleccion;
        this.rubricaPreseleccion = null;
        this.aplicarSeleccion(id);
      } else {
        this.selectorOpen.set(true);
        this.loading.set(false);
      }
      return;
    }

    const snap = this.service.parseSnapshot(a.templateSnapshot);
    if (!snap) {
      this.error.set('El template de esta evaluación está corrupto.');
      this.loading.set(false);
      return;
    }
    this.rubricaPendiente.set(false);
    this.selectorOpen.set(false);
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
        .subscribe({
          next: (ev) => {
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
          },
          error: () => {
            this.error.set('No se pudo cargar la evaluación.');
            this.loading.set(false);
          },
        });
      return;
    }

    // ACTIVA
    const borrador = this.draft.load(a.id);
    if (borrador) {
      form.patchValue(borrador as never);
      this.aviso.set('Borrador restaurado.');
    }
    this.proyMax.set(proyeccionMax(snap));
    const recalcular = () => {
      this.proyeccion.set(proyeccionNota(snap, form));
      this.avance.set(contarCompletos(snap, form));
    };
    recalcular();
    form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(recalcular);
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

  // --- Selección de rúbrica ---

  protected onUsarDefecto(): void {
    this.aplicarSeleccion(null);
  }

  protected onUsarExistente(templateId: number): void {
    this.aplicarSeleccion(templateId);
  }

  protected onCrearRubrica(): void {
    this.router.navigate(['/rubricas/nueva'], {
      queryParams: { returnTo: `/evaluaciones/${this.id}` },
    });
  }

  protected abrirSelector(): void {
    this.selectorOpen.set(true);
  }

  protected cerrarSelector(): void {
    this.selectorOpen.set(false);
  }

  private aplicarSeleccion(templateId: number | null): void {
    this.selectorOpen.set(false);
    this.loading.set(true);
    // Cambiar de rúbrica descarta el avance: el borrador está atado a los criterios anteriores.
    this.draft.clear(this.id);
    this.service
      .seleccionarRubrica(this.id, templateId ?? undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (a) => this.inicializar(a),
        error: () => {
          this.error.set('No se pudo seleccionar la rúbrica. Volvé a intentar.');
          this.loading.set(false);
        },
      });
  }

  canDeactivate(): boolean {
    const form = this.form();
    return this.readonly() || this.enviado() || !form || !form.dirty;
  }
}
