import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

import { Button } from '@shared/ui/button/button';
import { Card } from '@shared/ui/card/card';
import { isProblemDetail } from '@core/http/problem-detail';
import { SolicitudVinculacionService } from '@features/mis-publicaciones/solicitud-vinculacion.service';
import { SolicitudVinculacion } from '@features/mis-publicaciones/solicitud-vinculacion.models';

type Filtro = 'PENDIENTE' | 'RESUELTAS';

@Component({
  selector: 'ac-mis-solicitudes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, Card],
  templateUrl: './mis-solicitudes-page.html',
  styleUrl: './mis-solicitudes-page.scss',
})
export class MisSolicitudesPage {
  private readonly service = inject(SolicitudVinculacionService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly solicitudes = signal<SolicitudVinculacion[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly actionId = signal<number | null>(null);
  protected readonly filtro = signal<Filtro>('PENDIENTE');

  protected readonly visibles = computed(() => {
    const f = this.filtro();
    return this.solicitudes().filter((s) =>
      f === 'PENDIENTE' ? s.estado === 'PENDIENTE' : s.estado !== 'PENDIENTE');
  });

  constructor() {
    this.service.listarMis()
      .pipe(
        catchError((err: HttpErrorResponse) => {
          this.error.set(err.status === 0 ? 'Sin conexión.' : 'No se pudieron cargar tus solicitudes.');
          return of<SolicitudVinculacion[]>([]);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => { this.solicitudes.set(items); this.loading.set(false); });
  }

  protected setFiltro(f: Filtro): void { this.filtro.set(f); }

  protected cancelar(s: SolicitudVinculacion): void {
    this.actionId.set(s.id);
    this.service.cancelar(s.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.solicitudes.update((prev) => prev.map((x) => x.id === updated.id ? updated : x));
          this.actionId.set(null);
        },
        error: (err: HttpErrorResponse) => {
          this.actionId.set(null);
          this.error.set(isProblemDetail(err.error) && err.error.detail ? err.error.detail : 'No se pudo cancelar.');
        },
      });
  }
}
