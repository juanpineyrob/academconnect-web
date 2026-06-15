import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { fromEvent } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { ActividadService } from '../../actividad.service';
import { TIPO_CONFIG, FALLBACK_CONFIG, parsePayload } from '../../actividad-config';
import { groupByDay } from '../../group-by-day';
import { TimeAgoPipe } from '../../time-ago.pipe';
import type { Actividad } from '../../actividad.models';

@Component({
  selector: 'ac-feed-dropdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TimeAgoPipe],
  templateUrl: './feed-dropdown.html',
  styleUrl: './feed-dropdown.scss',
})
export class FeedDropdown {
  protected readonly service = inject(ActividadService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly open = signal<boolean>(false);
  protected readonly grupos = computed(() => groupByDay(this.service.feed()));

  protected readonly bellLabel = computed(() => {
    const n = this.service.unreadCount();
    return n > 0 ? `Actividad reciente, ${n} sin leer` : 'Actividad reciente';
  });

  constructor() {
    const doc = inject(DOCUMENT);
    fromEvent<MouseEvent>(doc, 'mousedown')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ev) => this.onDocMouseDown(ev));
    fromEvent<KeyboardEvent>(doc, 'keydown')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ev) => {
        if (ev.key === 'Escape' && this.open()) this.open.set(false);
      });
    this.service.refetch();
  }

  protected toggle(): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.open.set(true);
    this.service.markAllRead();
  }

  protected onItemClick(a: Actividad): void {
    const link = this.linkFor(a);
    if (!link) return;
    this.open.set(false);
    void this.router.navigateByUrl(link);
  }

  protected texto(a: Actividad): string {
    const cfg = TIPO_CONFIG[a.tipo] ?? FALLBACK_CONFIG;
    const esActor = a.actorId != null && a.actorId === this.auth.currentUser()?.userId;
    return cfg.render(parsePayload(a.payload), esActor);
  }

  protected icon(a: Actividad): string {
    return (TIPO_CONFIG[a.tipo] ?? FALLBACK_CONFIG).icon;
  }

  protected linkFor(a: Actividad): string | null {
    const rol = this.auth.currentUser()?.rol;
    if (!rol) return null;
    const cfg = TIPO_CONFIG[a.tipo];
    return cfg?.link?.(parsePayload(a.payload), rol) ?? null;
  }

  protected hasLink(a: Actividad): boolean {
    return this.linkFor(a) !== null;
  }

  private onDocMouseDown(ev: MouseEvent): void {
    if (!this.open()) return;
    const target = ev.target as Node | null;
    if (target && !this.host.nativeElement.contains(target)) {
      this.open.set(false);
    }
  }
}
