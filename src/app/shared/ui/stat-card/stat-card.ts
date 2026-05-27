import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ac-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="ac-stat__label">{{ label() }}</p>
    <p class="ac-stat__value">{{ value() }}</p>
    @if (sublabel()) {
      <p class="ac-stat__sub">{{ sublabel() }}</p>
    }
  `,
  styleUrl: './stat-card.scss',
  host: {
    class: 'ac-stat',
  },
})
export class StatCard {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly sublabel = input<string | null>(null);
}
