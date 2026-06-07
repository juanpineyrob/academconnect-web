import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

import { Button } from '@shared/ui/button/button';
import {
  ESTADO_LABEL,
  TIPO_LABEL,
  TrabajoListItem,
} from '@features/repositorio/repositorio.models';
import { MisTrabajosService } from '../mis-trabajos.service';

@Component({
  selector: 'ac-mis-trabajos-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button],
  templateUrl: './mis-trabajos-list-page.html',
  styleUrl: './mis-trabajos-list-page.scss',
})
export class MisTrabajosListPage {
  private readonly service = inject(MisTrabajosService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly trabajos = signal<TrabajoListItem[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly tipoLabel = TIPO_LABEL;
  protected readonly estadoLabel = ESTADO_LABEL;

  constructor() {
    this.service
      .listar()
      .pipe(
        catchError((err: HttpErrorResponse) => {
          this.error.set(err.status === 0 ? 'Sin conexión.' : 'No se pudieron cargar tus trabajos.');
          return of<TrabajoListItem[]>([]);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => {
        this.trabajos.set(items);
        this.loading.set(false);
      });
  }
}
