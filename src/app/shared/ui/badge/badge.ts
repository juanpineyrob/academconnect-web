import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BadgeVariant = 'state' | 'role' | 'area';
export type BadgeState =
  | 'aprobado'
  | 'revision'
  | 'rechazado'
  | 'borrador'
  | 'enviado'
  | 'observado';

@Component({
  selector: 'ac-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  styleUrl: './badge.scss',
  host: {
    '[class]': 'hostClasses()',
  },
})
export class Badge {
  readonly variant = input<BadgeVariant>('area');
  readonly state = input<BadgeState | null>(null);

  protected readonly hostClasses = computed(() => {
    const cls = ['ac-badge', `ac-badge--${this.variant()}`];
    const s = this.state();
    if (s) cls.push(`ac-badge--state-${s}`);
    return cls.join(' ');
  });
}
