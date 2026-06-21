import { Routes } from '@angular/router';

import { authGuard } from '@core/auth/auth.guard';
import { roleGuard } from '@core/auth/role.guard';
import { Rol } from '@core/auth/models';
import { unsavedGuard } from '../evaluaciones/unsaved.guard';

const ROLES: Rol[] = ['PROFESOR', 'EXTERNO', 'ADMINISTRADOR'];

export const RUBRICAS_ROUTES: Routes = [
  {
    path: 'rubricas',
    canActivate: [authGuard, roleGuard],
    data: { roles: ROLES },
    loadComponent: () => import('./lista-page/lista-page').then((m) => m.ListaPage),
    title: 'Rúbricas · AcademConnect',
  },
  {
    path: 'rubricas/nueva',
    canActivate: [authGuard, roleGuard],
    canDeactivate: [unsavedGuard],
    data: { roles: ROLES },
    loadComponent: () => import('./builder-page/builder-page').then((m) => m.BuilderPage),
    title: 'Nueva rúbrica · AcademConnect',
  },
  {
    path: 'rubricas/:id/editar',
    canActivate: [authGuard, roleGuard],
    canDeactivate: [unsavedGuard],
    data: { roles: ROLES },
    loadComponent: () => import('./builder-page/builder-page').then((m) => m.BuilderPage),
    title: 'Editar rúbrica · AcademConnect',
  },
];
