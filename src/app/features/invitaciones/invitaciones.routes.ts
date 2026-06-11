import { Routes } from '@angular/router';

import { authGuard } from '@core/auth/auth.guard';
import { roleGuard } from '@core/auth/role.guard';

export const INVITACIONES_ROUTES: Routes = [
  {
    path: 'invitaciones-orientacion',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['PROFESOR', 'EXTERNO'] },
    loadComponent: () =>
      import('./invitaciones-recibidas-page/invitaciones-recibidas-page').then((m) => m.InvitacionesRecibidasPage),
    title: 'Invitaciones · AcademConnect',
  },
];
