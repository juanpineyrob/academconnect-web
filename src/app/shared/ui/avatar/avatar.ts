import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { environment } from '@env/environment';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const PX_BY_SIZE: Record<AvatarSize, number> = {
  sm: 32,
  md: 44,
  lg: 64,
  xl: 128,
};

@Component({
  selector: 'ac-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (resolvedPhotoUrl(); as src) {
      <img [src]="src" [alt]="alt()" class="ac-avatar__img" />
    } @else {
      <span aria-hidden="true" class="ac-avatar__initials">{{ initials() }}</span>
      <span class="ac-avatar__sr">{{ alt() }}</span>
    }
  `,
  styleUrl: './avatar.scss',
  host: {
    '[class]': 'hostClasses()',
    '[style.--ac-avatar-size]': 'pixels() + "px"',
  },
})
export class Avatar {
  readonly name = input.required<string>();
  readonly photoUrl = input<string | null>(null);
  readonly version = input<string | number | null>(null);
  readonly size = input<AvatarSize>('md');

  protected readonly pixels = computed(() => PX_BY_SIZE[this.size()]);

  protected readonly resolvedPhotoUrl = computed(() => {
    const url = this.photoUrl();
    if (!url) return null;
    const absolute = url.startsWith('/') ? `${environment.apiBase}${url}` : url;
    const v = this.version();
    if (v === null || v === undefined || url.startsWith('blob:') || url.startsWith('data:')) {
      return absolute;
    }
    const sep = absolute.includes('?') ? '&' : '?';
    return `${absolute}${sep}v=${encodeURIComponent(String(v))}`;
  });

  protected readonly alt = computed(() => this.name());

  protected readonly initials = computed(() => {
    const parts = this.name()
      .trim()
      .split(/\s+/)
      .filter((p) => /^[\p{L}]/u.test(p));
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  });

  protected readonly hostClasses = computed(() => {
    const base = `ac-avatar ac-avatar--${this.size()}`;
    return this.resolvedPhotoUrl() ? `${base} ac-avatar--has-image` : base;
  });
}
