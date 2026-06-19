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
  imports: [ReactiveFormsModule, RouterLink, DecimalPipe, CriterioField, DocumentoViewer, ConfirmarEnvioDialog],
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
