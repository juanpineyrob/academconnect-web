import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { Badge, BadgeState } from '@shared/ui/badge/badge';
import { Card } from '@shared/ui/card/card';
import { TrabajoResumen } from '../../perfil.models';

const ESTADO_LABEL: Record<string, { label: string; state: BadgeState }> = {
  BORRADOR: { label: 'Borrador', state: 'borrador' },
  ENVIADO: { label: 'Enviado', state: 'enviado' },
  EN_REVISION: { label: 'En revisión', state: 'revision' },
  OBSERVADO: { label: 'Observado', state: 'observado' },
  APROBADO: { label: 'Aprobado', state: 'aprobado' },
  RECHAZADO: { label: 'Rechazado', state: 'rechazado' },
  PUBLICADO: { label: 'Publicado', state: 'aprobado' },
};

@Component({
  selector: 'ac-publicaciones-recientes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge, Card],
  template: `
    <ac-card padding="md">
      <header class="pubs__header">
        <h2 class="pubs__title">Trabajos recientes</h2>
        @if (items() !== null && items()!.length > 0) {
          <span class="pubs__count t-caption">Últimos {{ visible().length }}</span>
        }
      </header>

      @if (items() === null) {
        <p class="pubs__empty">
          El historial de trabajos no está disponible en este momento.
        </p>
      } @else if (items()!.length === 0) {
        <p class="pubs__empty">
          Tus trabajos aparecerán acá cuando publiques el primero.
        </p>
      } @else {
        <ul role="list" class="pubs__list">
          @for (t of visible(); track t.id) {
            <li class="pubs__item">
              <div class="pubs__meta">
                <p class="pubs__type t-caption">{{ t.tipo }}</p>
                <p class="pubs__date t-caption">{{ formatDate(t.updatedAt) }}</p>
              </div>
              <p class="pubs__titulo">{{ t.titulo }}</p>
              <ac-badge
                variant="state"
                [state]="estado(t.estado).state">
                {{ estado(t.estado).label }}
              </ac-badge>
            </li>
          }
        </ul>
      }
    </ac-card>
  `,
  styleUrl: './publicaciones-recientes.scss',
})
export class PublicacionesRecientes {
  readonly items = input.required<TrabajoResumen[] | null>();

  protected readonly visible = computed(() => (this.items() ?? []).slice(0, 5));

  protected estado(code: string) {
    return ESTADO_LABEL[code] ?? { label: code, state: 'borrador' as BadgeState };
  }

  protected formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('es-UY', { year: 'numeric', month: 'short', day: '2-digit' });
  }
}
