import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, inject, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { Button } from '@shared/ui/button/button';
import { Card } from '@shared/ui/card/card';
import { isProblemDetail } from '@core/http/problem-detail';
import { SolicitudEvaluacionService } from '@features/mis-trabajos/solicitud-evaluacion.service';
import { SolicitudEvaluacion } from '@features/mis-trabajos/solicitud-evaluacion.models';

type Filtro = 'PENDIENTE' | 'HISTORICO';
const PAGE_SIZE = 10;

@Component({
  selector: 'ac-solicitudes-evaluacion-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Card],
  templateUrl: './solicitudes-evaluacion-page.html',
  styleUrl: './solicitudes-evaluacion-page.scss',
})
export class SolicitudesEvaluacionPage {
  private readonly service = inject(SolicitudEvaluacionService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly solicitudes = signal<SolicitudEvaluacion[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly actionId = signal<number | null>(null);
  protected readonly filtro = signal<Filtro>('PENDIENTE');

  protected readonly page = signal<number>(0);
  protected readonly first = signal<boolean>(true);
  protected readonly last = signal<boolean>(true);

  constructor() { this.cargar(); }

  protected setFiltro(f: Filtro): void {
    if (this.filtro() === f) return;
    this.filtro.set(f);
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

  protected aceptar(s: SolicitudEvaluacion): void {
    this.actionId.set(s.id);
    this.service.aceptar(s.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.actionId.set(null); this.cargar(); },
        error: (err: HttpErrorResponse) => { this.actionId.set(null); this.error.set(this.mapError(err)); },
      });
  }

  protected rechazar(s: SolicitudEvaluacion): void {
    this.actionId.set(s.id);
    this.service.rechazar(s.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.actionId.set(null); this.cargar(); },
        error: (err: HttpErrorResponse) => { this.actionId.set(null); this.error.set(this.mapError(err)); },
      });
  }

  private cargar(): void {
    this.loading.set(true);
    this.error.set(null);
    const estado = this.filtro() === 'PENDIENTE' ? 'PENDIENTE' : undefined;
    this.service.listarRecibidas(estado, this.page(), PAGE_SIZE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          if (p.content.length === 0 && p.number > 0) {
            this.page.set(p.number - 1);
            this.cargar();
            return;
          }
          this.solicitudes.set(p.content);
          this.first.set(p.first);
          this.last.set(p.last);
          this.page.set(p.number);
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => { this.error.set(this.mapError(err)); this.loading.set(false); },
      });
  }

  private mapError(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Sin conexión.';
    if (isProblemDetail(err.error) && err.error.detail) return err.error.detail;
    return 'No se pudo completar la acción.';
  }
}
