import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';

import { Button } from '@shared/ui/button/button';
import { Card } from '@shared/ui/card/card';
import { isProblemDetail } from '@core/http/problem-detail';
import { Versionamiento } from '../../versionamiento.models';
import { VersionamientoService } from '../../versionamiento.service';

type ModalMode = 'crear' | { tipo: 'reemplazar'; versionId: number; numero: number } | null;

@Component({
  selector: 'ac-versiones-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, Button, Card],
  templateUrl: './versiones-card.html',
  styleUrl: './versiones-card.scss',
})
export class VersionesCard {
  private readonly service = inject(VersionamientoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly trabajoId = input.required<number>();
  readonly puedeMutar = input<boolean>(false);

  protected readonly versiones = signal<Versionamiento[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly actionId = signal<number | null>(null);
  protected readonly mostrarHistorico = signal<boolean>(false);

  protected readonly modalMode = signal<ModalMode>(null);
  protected readonly modalError = signal<string | null>(null);
  protected readonly submitting = signal<boolean>(false);
  protected readonly comentario = signal<string>('');

  private readonly modalRef = viewChild<ElementRef<HTMLDialogElement>>('modal');
  private readonly fileInputRef = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly activas = computed(() =>
    this.versiones().filter((v) => v.deletedAt == null),
  );
  protected readonly historicas = computed(() =>
    this.versiones().filter((v) => v.deletedAt != null),
  );
  protected readonly puedeAgregar = computed(() => this.activas().length < 10);

  protected readonly modalTitulo = computed(() => {
    const m = this.modalMode();
    if (m && typeof m === 'object') return `Reemplazar v${m.numero}`;
    return 'Subir nueva versión';
  });

  protected readonly submitLabel = computed(() => {
    const m = this.modalMode();
    return m && typeof m === 'object' ? 'Reemplazar' : 'Subir';
  });

  constructor() {
    effect(() => {
      const id = this.trabajoId();
      const ih = this.mostrarHistorico();
      this.cargar(id, ih);
    });
  }

  protected toggleHistorico(): void {
    this.mostrarHistorico.update((v) => !v);
  }

  protected abrirModalCrear(): void {
    this.openModal('crear');
  }

  protected abrirModalReemplazar(v: Versionamiento): void {
    this.openModal({ tipo: 'reemplazar', versionId: v.id, numero: v.numeroVersion });
  }

  protected cerrarModal(): void {
    this.modalRef()?.nativeElement.close();
  }

  protected onModalClose(): void {
    this.modalMode.set(null);
    this.submitting.set(false);
    this.modalError.set(null);
    this.comentario.set('');
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    const fileInput = this.fileInputRef()?.nativeElement;
    const file = fileInput?.files?.[0];
    if (!file) {
      this.modalError.set('Elegí un archivo PDF.');
      return;
    }
    if (file.type !== 'application/pdf') {
      this.modalError.set('Solo se aceptan archivos PDF.');
      return;
    }
    const mode = this.modalMode();
    if (!mode) return;

    this.submitting.set(true);
    this.modalError.set(null);
    const comentario = this.comentario().trim() || null;
    const obs = mode === 'crear'
      ? this.service.crear(this.trabajoId(), file, comentario)
      : this.service.reemplazar(this.trabajoId(), mode.versionId, file, comentario);

    obs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.submitting.set(false);
        this.cerrarModal();
        this.refetch();
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.modalError.set(this.mapError(err));
      },
    });
  }

  protected confirmarEliminar(v: Versionamiento): void {
    if (!window.confirm(`¿Eliminar v${v.numeroVersion}? Quedará en el histórico.`)) return;
    this.actionId.set(v.id);
    this.service.eliminar(this.trabajoId(), v.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.actionId.set(null);
          this.refetch();
        },
        error: (err: HttpErrorResponse) => {
          this.actionId.set(null);
          this.error.set(this.mapError(err));
        },
      });
  }

  protected downloadUrl(versionId: number): string {
    return this.service.downloadUrl(this.trabajoId(), versionId);
  }

  private openModal(mode: ModalMode): void {
    this.modalMode.set(mode);
    this.modalError.set(null);
    this.comentario.set('');
    queueMicrotask(() => {
      const input = this.fileInputRef()?.nativeElement;
      if (input) input.value = '';
      this.modalRef()?.nativeElement.showModal();
    });
  }

  private refetch(): void {
    this.cargar(this.trabajoId(), this.mostrarHistorico());
  }

  private cargar(trabajoId: number, includeDeleted: boolean): void {
    this.loading.set(true);
    this.service.listar(trabajoId, includeDeleted)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (vs) => {
          this.versiones.set(vs);
          this.loading.set(false);
          this.error.set(null);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          this.error.set(this.mapError(err));
        },
      });
  }

  private mapError(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Sin conexión.';
    if (isProblemDetail(err.error) && err.error.detail) return err.error.detail;
    return 'No se pudo completar la acción.';
  }
}
