import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

import { Button } from '@shared/ui/button/button';
import { Card } from '@shared/ui/card/card';
import { isProblemDetail } from '@core/http/problem-detail';
import { ESTADO_LABEL, TIPO_LABEL, TrabajoListItem } from '@features/repositorio/repositorio.models';
import { RepositorioService } from '@features/repositorio/repositorio.service';

@Component({
  selector: 'ac-hub-detalle-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, Card, DatePipe],
  templateUrl: './hub-detalle-page.html',
  styleUrl: './hub-detalle-page.scss',
})
export class HubDetallePage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly repo = inject(RepositorioService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly trabajo = signal<TrabajoListItem | null>(null);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly submitting = signal<boolean>(false);

  protected readonly tipoLabel = TIPO_LABEL;
  protected readonly estadoLabel = ESTADO_LABEL;

  protected readonly puedeTomar = computed(() => this.trabajo()?.estado === 'ABIERTO');

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.repo.getById(id)
      .pipe(
        catchError((err: HttpErrorResponse) => { this.error.set(this.mapError(err)); return of(null); }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((trabajo) => {
        this.trabajo.set(trabajo);
        this.loading.set(false);
      });
  }

  protected tomar(): void {
    const t = this.trabajo();
    if (!t) return;
    this.submitting.set(true);
    this.repo.tomar(t.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.router.navigate(['/mis-trabajos', t.id]),
        error: (err: HttpErrorResponse) => { this.submitting.set(false); this.error.set(this.mapError(err)); },
      });
  }

  private mapError(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Sin conexión.';
    if (err.status === 404) return 'Trabajo no encontrado.';
    if (isProblemDetail(err.error) && err.error.detail) return err.error.detail;
    return 'No se pudo completar la acción.';
  }
}
