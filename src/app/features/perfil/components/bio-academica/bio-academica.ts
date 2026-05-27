import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { Card } from '@shared/ui/card/card';
import { Button } from '@shared/ui/button/button';

@Component({
  selector: 'ac-bio-academica',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Card, Button],
  template: `
    <ac-card padding="md">
      <header class="bio__header">
        <h2 class="bio__title">Biografía académica</h2>
        <ac-button variant="link" size="sm" (click)="onEdit()">Editar</ac-button>
      </header>
      @if (biografia()) {
        <blockquote class="bio__quote">
          {{ biografia() }}
        </blockquote>
      } @else {
        <p class="bio__empty">
          Aún no escribiste tu biografía. Contá tu trayectoria, intereses y líneas activas.
        </p>
      }
    </ac-card>
  `,
  styleUrl: './bio-academica.scss',
})
export class BioAcademica {
  readonly biografia = input<string | null>(null);
  readonly editClick = output<void>();

  protected onEdit(): void {
    this.editClick.emit();
  }
}
