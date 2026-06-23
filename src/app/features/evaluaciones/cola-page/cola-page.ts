import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { EvaluacionesService } from '../evaluaciones.service';
import type { Asignacion, EstadoAsignacion } from '../evaluaciones.models';
import { AsignacionCard } from '../components/asignacion-card/asignacion-card';

const PAGE_SIZE = 10;

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

  protected readonly page = signal<number>(0);
  protected readonly totalPages = signal<number>(0);
  protected readonly totalElements = signal<number>(0);
  protected readonly first = signal<boolean>(true);
  protected readonly last = signal<boolean>(true);

  constructor() {
    this.cargar();
  }

  protected cambiarTab(estado: EstadoAsignacion): void {
    if (this.tab() === estado) return;
    this.tab.set(estado);
    this.page.set(0);
    this.cargar();
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

  protected cargar(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service
      .listarAsignaciones(this.tab(), this.page(), PAGE_SIZE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          if (p.content.length === 0 && p.number > 0) {
            this.page.set(p.number - 1);
            this.cargar();
            return;
          }
          this.asignaciones.set(p.content);
          this.totalPages.set(p.totalPages);
          this.totalElements.set(p.totalElements);
          this.first.set(p.first);
          this.last.set(p.last);
          this.page.set(p.number);
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.error.set(err.status === 0 ? 'Sin conexión.' : 'No se pudieron cargar tus evaluaciones.');
          this.loading.set(false);
        },
      });
  }
}
