import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type CardPadding = 'sm' | 'md' | 'lg' | 'none';

@Component({
  selector: 'ac-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  styleUrl: './card.scss',
  host: {
    '[class]': 'hostClasses()',
  },
})
export class Card {
  readonly padding = input<CardPadding>('md');
  readonly elevated = input<boolean>(false);

  protected readonly hostClasses = computed(() => {
    const cls = ['ac-card', `ac-card--p-${this.padding()}`];
    if (this.elevated()) cls.push('ac-card--elevated');
    return cls.join(' ');
  });
}
