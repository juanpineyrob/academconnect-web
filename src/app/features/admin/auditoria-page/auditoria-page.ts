import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { Button } from '@shared/ui/button/button';
import { ActividadService } from '@features/actividad/actividad.service';
import { getConfig, parsePayload } from '@features/actividad/actividad-config';
import { groupByDay } from '@features/actividad/group-by-day';
import { TimeAgoPipe } from '@features/actividad/time-ago.pipe';
import type { Actividad } from '@features/actividad/actividad.models';

const PAGE_SIZE = 20;

@Component({
  selector: 'ac-auditoria-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe, Button, TimeAgoPipe],
  templateUrl: './auditoria-page.html',
  styleUrl: './auditoria-page.scss',
})
export class AuditoriaPage {
  private readonly service = inject(ActividadService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly actividades = signal<Actividad[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);

  protected readonly page = signal<number>(0);
  protected readonly totalPages = signal<number>(0);
  protected readonly totalElements = signal<number>(0);
  protected readonly first = signal<boolean>(true);
  protected readonly last = signal<boolean>(true);

  protected readonly grupos = computed(() => groupByDay(this.actividades()));

  constructor() {
    this.cargar();
  }

  protected cargar(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service
      .fetchAdmin(this.page(), PAGE_SIZE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.actividades.set(p.content);
          this.totalPages.set(p.totalPages);
          this.totalElements.set(p.totalElements);
          this.first.set(p.first);
          this.last.set(p.last);
          this.page.set(p.number);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('No se pudo cargar la bitácora.');
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

  protected icono(a: Actividad): string {
    return getConfig(a.tipo).icon;
  }

  protected texto(a: Actividad): string {
    // Vista de administrador: nunca es el actor, así que la redacción es en tercera persona.
    return getConfig(a.tipo).render(parsePayload(a.payload), false);
  }
}
