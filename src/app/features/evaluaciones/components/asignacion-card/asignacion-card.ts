import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import type { Asignacion } from '../../evaluaciones.models';

@Component({
  selector: 'ac-asignacion-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe],
  templateUrl: './asignacion-card.html',
  styleUrl: './asignacion-card.scss',
})
export class AsignacionCard {
  readonly asignacion = input.required<Asignacion>();

  protected readonly vencida = computed(() => {
    const a = this.asignacion();
    return a.estado === 'ACTIVA' && new Date(a.vencimientoEn).getTime() < Date.now();
  });

  protected readonly chip = computed<{ label: string; tono: 'aprobado' | 'rechazado' | 'enviado' }>(() => {
    if (this.vencida()) return { label: 'Vencida', tono: 'rechazado' };
    if (this.asignacion().estado === 'COMPLETADA') return { label: 'Completada', tono: 'aprobado' };
    return { label: 'Activa', tono: 'enviado' };
  });
}
