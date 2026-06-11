import { Routes } from '@angular/router';

import { authGuard } from '@core/auth/auth.guard';
import { roleGuard } from '@core/auth/role.guard';

export const PERFIL_ROUTES: Routes = [
  {
    path: 'perfil',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ESTUDIANTE', 'PROFESOR', 'EXTERNO'] },
    loadComponent: () =>
      import('./perfil-propio-page/perfil-propio-page').then((m) => m.PerfilPropioPage),
    title: 'Mi perfil · AcademConnect',
  },
  {
    path: 'usuarios/:id',
    loadComponent: () =>
      import('./perfil-publico-page/perfil-publico-page').then((m) => m.PerfilPublicoPage),
    title: 'Perfil · AcademConnect',
  },
];
