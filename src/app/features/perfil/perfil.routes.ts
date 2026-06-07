import { Routes } from '@angular/router';

import { roleGuard } from '@core/auth/role.guard';

export const PERFIL_ROUTES: Routes = [
  {
    path: 'perfil',
    canActivate: [roleGuard],
    data: { roles: ['ESTUDIANTE', 'PROFESOR', 'EXTERNO'] },
    loadComponent: () =>
      import('./perfil-propio-page/perfil-propio-page').then((m) => m.PerfilPropioPage),
    title: 'Mi perfil · AcademConnect',
  },
];
