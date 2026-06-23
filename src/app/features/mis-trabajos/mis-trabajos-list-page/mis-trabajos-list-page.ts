import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { Button } from '@shared/ui/button/button';
import {
  ESTADO_LABEL,
  TIPO_LABEL,
  TrabajoListItem,
} from '@features/repositorio/repositorio.models';
import { MisTrabajosService } from '../mis-trabajos.service';

const PAGE_SIZE = 10;

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

  protected readonly page = signal<number>(0);
  protected readonly totalPages = signal<number>(0);
  protected readonly totalElements = signal<number>(0);
  protected readonly first = signal<boolean>(true);
  protected readonly last = signal<boolean>(true);

  constructor() {
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
      .listar(this.page(), PAGE_SIZE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
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
        error: (err: HttpErrorResponse) => {
          this.error.set(err.status === 0 ? 'Sin conexión.' : 'No se pudieron cargar tus trabajos.');
          this.loading.set(false);
        },
      });
  }
}
