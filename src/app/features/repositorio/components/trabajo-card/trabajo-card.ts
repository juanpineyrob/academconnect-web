import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Badge } from '@shared/ui/badge/badge';
import { Card } from '@shared/ui/card/card';
import { ESTADO_LABEL, TIPO_LABEL, TrabajoListItem } from '../../repositorio.models';

@Component({
  selector: 'ac-trabajo-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge, Card, RouterLink],
  templateUrl: './trabajo-card.html',
  styleUrl: './trabajo-card.scss',
})
export class TrabajoCard {
  readonly trabajo = input.required<TrabajoListItem>();

  protected readonly tipoLabel = computed(() => TIPO_LABEL[this.trabajo().tipo] ?? this.trabajo().tipo);
  protected readonly estadoLabel = computed(
    () => ESTADO_LABEL[this.trabajo().estado] ?? this.trabajo().estado,
  );

  protected readonly anio = computed(() => {
    const t = this.trabajo();
    const fuente = t.evaluadoEn ?? t.createdAt;
    return new Date(fuente).getFullYear();
  });

  protected readonly resumenAreas = computed(() => this.trabajo().areas.slice(0, 3));
  protected readonly areasRestantes = computed(() => {
    const total = this.trabajo().areas.length;
    return total > 3 ? total - 3 : 0;
  });

  protected readonly keywordsResumen = computed(() => this.trabajo().keywords.slice(0, 4));

  protected estadoBadgeState(estado: string): 'aprobado' | 'revision' | 'rechazado' | 'borrador' | 'enviado' | 'observado' {
    switch (estado) {
      case 'APROBADO':
        return 'aprobado';
      case 'EN_EVALUACION':
        return 'revision';
      case 'RECHAZADO':
      case 'CANCELADO':
        return 'rechazado';
      case 'EN_DESARROLLO':
        return 'observado';
      case 'ABIERTO':
        return 'enviado';
      default:
        return 'borrador';
    }
  }
}
