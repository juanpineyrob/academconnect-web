import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { fromEvent } from 'rxjs';

import { Avatar } from '@shared/ui/avatar/avatar';
import { AuthService } from '@core/auth/auth.service';

@Component({
  selector: 'ac-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar, RouterLink],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  private readonly auth = inject(AuthService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly user = this.auth.currentUser;
  protected readonly menuOpen = signal(false);

  constructor() {
    const doc = inject(DOCUMENT);
    fromEvent<MouseEvent>(doc, 'click')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => this.handleDocumentClick(event));
    fromEvent<KeyboardEvent>(doc, 'keydown')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event.key === 'Escape' && this.menuOpen()) this.menuOpen.set(false);
      });
  }

  protected toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }

  protected logout(): void {
    this.menuOpen.set(false);
    this.auth.logout().subscribe();
  }

  private handleDocumentClick(event: MouseEvent): void {
    if (!this.menuOpen()) return;
    const target = event.target as Node | null;
    if (target && !this.host.nativeElement.contains(target)) {
      this.menuOpen.set(false);
    }
  }
}
