import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { Card } from '@shared/ui/card/card';
import { Reconocimiento } from '../../perfil.models';

@Component({
  selector: 'ac-reconocimientos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Card],
  template: `
    <ac-card padding="md">
      <header class="reco__header">
        <h2 class="reco__title">Reconocimientos</h2>
        @if (items().length > 0) {
          <span class="reco__count t-caption">{{ items().length }}</span>
        }
      </header>

      @if (items().length === 0) {
        <p class="reco__empty">
          Cuando recibas distinciones de la institución, aparecerán acá.
        </p>
      } @else {
        <ul role="list" class="reco__grid">
          @for (item of items(); track item.id) {
            <li class="reco__item">
              <div class="reco__year" aria-hidden="true">{{ item.anio }}</div>
              <div class="reco__body">
                <p class="reco__tipo">{{ item.tipo }}</p>
                <p class="reco__desc">{{ item.descripcion }}</p>
                @if (item.otorgadoPorNombre) {
                  <p class="reco__by t-caption">
                    Otorgado por {{ item.otorgadoPorNombre }}
                  </p>
                }
              </div>
            </li>
          }
        </ul>
      }
    </ac-card>
  `,
  styleUrl: './reconocimientos.scss',
})
export class Reconocimientos {
  readonly items = input.required<Reconocimiento[]>();
}
