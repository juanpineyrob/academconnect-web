import { Routes } from '@angular/router';

import { roleGuard } from '@core/auth/role.guard';

export const MIS_TRABAJOS_ROUTES: Routes = [
  {
    path: 'mis-trabajos',
    canActivate: [roleGuard],
    data: { roles: ['ESTUDIANTE'] },
    loadComponent: () =>
      import('./mis-trabajos-list-page/mis-trabajos-list-page').then((m) => m.MisTrabajosListPage),
    title: 'Mis trabajos · AcademConnect',
  },
  {
    path: 'mis-trabajos/nuevo',
    canActivate: [roleGuard],
    data: { roles: ['ESTUDIANTE'] },
    loadComponent: () =>
      import('./mis-trabajos-crear-page/mis-trabajos-crear-page').then((m) => m.MisTrabajosCrearPage),
    title: 'Crear trabajo · AcademConnect',
  },
  {
    path: 'mis-trabajos/:id',
    canActivate: [roleGuard],
    data: { roles: ['ESTUDIANTE'] },
    loadComponent: () =>
      import('./mis-trabajos-detalle-page/mis-trabajos-detalle-page').then((m) => m.MisTrabajosDetallePage),
    title: 'Mi trabajo · AcademConnect',
  },
];
