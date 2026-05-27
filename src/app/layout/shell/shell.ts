import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Header } from '@app/layout/header/header';
import { Sidebar } from '@app/layout/sidebar/sidebar';

@Component({
  selector: 'ac-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Header, Sidebar],
  template: `
    <div class="shell">
      <ac-sidebar class="shell__sidebar" />
      <div class="shell__main">
        <ac-header class="shell__header" />
        <main class="shell__content">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styleUrl: './shell.scss',
})
export class Shell {}
