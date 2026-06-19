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
