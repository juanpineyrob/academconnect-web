import { Routes } from '@angular/router';

import { authGuard } from '@core/auth/auth.guard';
import { roleGuard } from '@core/auth/role.guard';

export const COORIENTACIONES_ROUTES: Routes = [
  {
    path: 'solicitudes-coorientacion',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['PROFESOR', 'EXTERNO'] },
    loadComponent: () =>
      import('./coorientaciones-recibidas-page/coorientaciones-recibidas-page')
        .then((m) => m.CoorientacionesRecibidasPage),
    title: 'Solicitudes de coorientación · AcademConnect',
  },
];
