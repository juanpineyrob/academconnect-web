import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { Button } from '@shared/ui/button/button';
import { TIPO_LABEL, TrabajoListItem } from '@features/repositorio/repositorio.models';
import { AdminService } from '../admin.service';

const PAGE_SIZE = 10;

@Component({
  selector: 'ac-moderar-trabajos-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe, ReactiveFormsModule, Button],
  templateUrl: './moderar-trabajos-page.html',
  styleUrl: './moderar-trabajos-page.scss',
})
export class ModerarTrabajosPage {
  private readonly service = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tipoLabel = TIPO_LABEL;
  protected readonly buscador = new FormControl('', { nonNullable: true });

  protected readonly trabajos = signal<TrabajoListItem[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly actionId = signal<number | null>(null);
  protected readonly confirmId = signal<number | null>(null);

  protected readonly page = signal<number>(0);
  protected readonly totalPages = signal<number>(0);
  protected readonly totalElements = signal<number>(0);
  protected readonly first = signal<boolean>(true);
  protected readonly last = signal<boolean>(true);

  constructor() {
    this.buscador.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.page.set(0);
        this.cargar();
      });
    this.cargar();
  }

  private cargar(): void {
    this.loading.set(true);
    this.error.set(null);
    this.confirmId.set(null);
    this.service
      .buscarAprobados({ q: this.buscador.value, page: this.page(), size: PAGE_SIZE })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          // Si quedó vacía una página > 0 (p. ej. tras eliminar el último), retrocedemos.
          if (p.content.length === 0 && p.number > 0) {
            this.page.set(p.number - 1);
            this.cargar();
            return;
          }
          this.trabajos.set(p.content);
          this.totalPages.set(p.totalPages);
          this.totalElements.set(p.totalElements);
          this.first.set(p.first);
          this.last.set(p.last);
          this.page.set(p.number);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('No se pudieron cargar los trabajos.');
          this.loading.set(false);
        },
      });
  }

  protected paginaAnterior(): void {
    if (this.first() || this.loading()) return;
    this.page.update((p) => p - 1);
    this.cargar();
  }

  protected paginaSiguiente(): void {
    if (this.last() || this.loading()) return;
    this.page.update((p) => p + 1);
    this.cargar();
  }

  protected toggleOculto(t: TrabajoListItem): void {
    this.actionId.set(t.id);
    const obs = t.oculto ? this.service.mostrarTrabajo(t.id) : this.service.ocultarTrabajo(t.id);
    obs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (updated) => {
        this.trabajos.update((list) =>
          list.map((x) => (x.id === t.id ? { ...x, oculto: updated.oculto } : x)));
        this.actionId.set(null);
      },
      error: () => {
        this.error.set('No se pudo cambiar la visibilidad.');
        this.actionId.set(null);
      },
    });
  }

  protected pedirEliminar(t: TrabajoListItem): void {
    this.confirmId.set(t.id);
  }

  protected cancelarEliminar(): void {
    this.confirmId.set(null);
  }

  protected confirmarEliminar(t: TrabajoListItem): void {
    this.actionId.set(t.id);
    this.service
      .eliminarTrabajo(t.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.actionId.set(null);
          this.cargar();
        },
        error: () => {
          this.error.set('No se pudo eliminar el trabajo.');
          this.actionId.set(null);
        },
      });
  }
}
