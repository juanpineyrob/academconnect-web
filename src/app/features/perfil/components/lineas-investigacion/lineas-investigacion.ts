import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { Badge } from '@shared/ui/badge/badge';
import { Card } from '@shared/ui/card/card';
import { Button } from '@shared/ui/button/button';
import { UsuarioAreaTematica } from '../../perfil.models';

@Component({
  selector: 'ac-lineas-investigacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge, Card, Button],
  template: `
    <ac-card padding="md">
      <header class="lineas__header">
        <h2 class="lineas__title">Líneas de investigación</h2>
        <ac-button variant="link" size="sm" (click)="onEdit()">Editar áreas</ac-button>
      </header>

      @if (areas().length === 0) {
        <p class="lineas__empty">
          Todavía no asociaste áreas temáticas a tu perfil.
        </p>
      } @else {
        <ul role="list" class="lineas__list">
          @for (area of areas(); track area.areaId) {
            <li class="lineas__item">
              <ac-badge variant="area">{{ area.areaNombre }}</ac-badge>
              <span class="lineas__nivel t-caption">{{ nivelLabel(area.nivelExperticia) }}</span>
            </li>
          }
        </ul>
      }
    </ac-card>
  `,
  styleUrl: './lineas-investigacion.scss',
})
export class LineasInvestigacion {
  readonly areas = input.required<UsuarioAreaTematica[]>();
  readonly editClick = output<void>();

  protected nivelLabel(n: UsuarioAreaTematica['nivelExperticia']): string {
    switch (n) {
      case 'BAJO':
        return 'Inicial';
      case 'MEDIO':
        return 'Consolidado';
      case 'ALTO':
        return 'Experto';
      default:
        return n;
    }
  }

  protected onEdit(): void {
    this.editClick.emit();
  }
}
