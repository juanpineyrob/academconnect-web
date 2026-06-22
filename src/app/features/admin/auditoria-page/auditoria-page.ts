import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ActividadService } from '@features/actividad/actividad.service';
import { getConfig, parsePayload } from '@features/actividad/actividad-config';
import { groupByDay } from '@features/actividad/group-by-day';
import { TimeAgoPipe } from '@features/actividad/time-ago.pipe';
import type { Actividad } from '@features/actividad/actividad.models';

@Component({
  selector: 'ac-auditoria-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe, ReactiveFormsModule, TimeAgoPipe],
  templateUrl: './auditoria-page.html',
  styleUrl: './auditoria-page.scss',
})
export class AuditoriaPage {
  private readonly service = inject(ActividadService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly LIMITES = [50, 100, 200];
  protected readonly limite = new FormControl(50, { nonNullable: true });

  protected readonly actividades = signal<Actividad[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);

  protected readonly grupos = computed(() => groupByDay(this.actividades()));

  constructor() {
    this.limite.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargar());
    this.cargar();
  }

  protected cargar(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service
      .fetchAdmin(this.limite.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.actividades.set(items);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('No se pudo cargar la bitácora.');
          this.loading.set(false);
        },
      });
  }

  protected icono(a: Actividad): string {
    return getConfig(a.tipo).icon;
  }

  protected texto(a: Actividad): string {
    // Vista de administrador: nunca es el actor, así que la redacción es en tercera persona.
    return getConfig(a.tipo).render(parsePayload(a.payload), false);
  }
}
