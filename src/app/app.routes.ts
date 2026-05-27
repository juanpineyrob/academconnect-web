import { Routes } from '@angular/router';

import { authGuard } from '@core/auth/auth.guard';
import { AUTH_ROUTES } from '@features/auth/auth.routes';
import { PERFIL_ROUTES } from '@features/perfil/perfil.routes';

export const routes: Routes = [
  ...AUTH_ROUTES,
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('@app/layout/shell/shell').then((m) => m.Shell),
    children: [
      ...PERFIL_ROUTES,
      { path: '', pathMatch: 'full', redirectTo: 'perfil' },
      { path: '**', redirectTo: 'perfil' },
    ],
  },
];
