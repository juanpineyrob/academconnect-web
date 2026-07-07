import { Routes } from '@angular/router';

import { authGuard } from '@core/auth/auth.guard';
import { roleGuard } from '@core/auth/role.guard';

export const HUB_ROUTES: Routes = [
  {
    path: 'hub',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ESTUDIANTE'] },
    loadComponent: () =>
      import('./hub-page/hub-page').then((m) => m.HubPage),
    title: 'Hub · AcademConnect',
  },
  {
    path: 'hub/:id',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ESTUDIANTE'] },
    loadComponent: () =>
      import('./hub-detalle-page/hub-detalle-page').then((m) => m.HubDetallePage),
    title: 'Necesidad · AcademConnect',
  },
  {
    path: 'mis-solicitudes',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ESTUDIANTE'] },
    loadComponent: () =>
      import('./mis-solicitudes-page/mis-solicitudes-page').then((m) => m.MisSolicitudesPage),
    title: 'Mis solicitudes · AcademConnect',
  },
];
