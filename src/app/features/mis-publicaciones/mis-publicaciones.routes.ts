import { Routes } from '@angular/router';

import { roleGuard } from '@core/auth/role.guard';

export const MIS_PUBLICACIONES_ROUTES: Routes = [
  {
    path: 'mis-publicaciones',
    canActivate: [roleGuard],
    data: { roles: ['PROFESOR', 'EXTERNO'] },
    loadComponent: () =>
      import('./mis-publicaciones-list-page/mis-publicaciones-list-page').then((m) => m.MisPublicacionesListPage),
    title: 'Mis publicaciones · AcademConnect',
  },
  {
    path: 'mis-publicaciones/nuevo',
    canActivate: [roleGuard],
    data: { roles: ['PROFESOR', 'EXTERNO'] },
    loadComponent: () =>
      import('./mis-publicaciones-crear-page/mis-publicaciones-crear-page').then((m) => m.MisPublicacionesCrearPage),
    title: 'Crear publicación · AcademConnect',
  },
  {
    path: 'mis-publicaciones/:id',
    canActivate: [roleGuard],
    data: { roles: ['PROFESOR', 'EXTERNO'] },
    loadComponent: () =>
      import('./mis-publicaciones-detalle-page/mis-publicaciones-detalle-page').then((m) => m.MisPublicacionesDetallePage),
    title: 'Publicación · AcademConnect',
  },
];
