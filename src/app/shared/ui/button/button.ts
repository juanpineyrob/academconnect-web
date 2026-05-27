import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'ghost' | 'link';
export type ButtonSize = 'sm' | 'md';

@Component({
  selector: 'ac-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      [type]="type()"
      [disabled]="disabled()"
      [class]="classes()"
      [attr.aria-busy]="loading() ? 'true' : null">
      <ng-content />
    </button>
  `,
  styleUrl: './button.scss',
  host: {
    class: 'ac-button-host',
  },
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly disabled = input<boolean>(false);
  readonly loading = input<boolean>(false);
  readonly fullWidth = input<boolean>(false);

  protected readonly classes = computed(() => {
    const cls = ['ac-button', `ac-button--${this.variant()}`, `ac-button--${this.size()}`];
    if (this.fullWidth()) cls.push('ac-button--full');
    if (this.loading()) cls.push('ac-button--loading');
    return cls.join(' ');
  });
}
