import { Routes } from '@angular/router';

import { authGuard } from '@core/auth/auth.guard';
import { ADMIN_ROUTES } from '@features/admin/admin.routes';
import { AUTH_ROUTES } from '@features/auth/auth.routes';
import { INVITACIONES_ROUTES } from '@features/invitaciones/invitaciones.routes';
import { MIS_TRABAJOS_ROUTES } from '@features/mis-trabajos/mis-trabajos.routes';
import { PERFIL_ROUTES } from '@features/perfil/perfil.routes';
import { REPOSITORIO_ROUTES } from '@features/repositorio/repositorio.routes';

export const routes: Routes = [
  ...AUTH_ROUTES,
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('@app/layout/shell/shell').then((m) => m.Shell),
    children: [
      ...PERFIL_ROUTES,
      ...REPOSITORIO_ROUTES,
      ...ADMIN_ROUTES,
      ...MIS_TRABAJOS_ROUTES,
      ...INVITACIONES_ROUTES,
      { path: '', pathMatch: 'full', redirectTo: 'perfil' },
      { path: '**', redirectTo: 'perfil' },
    ],
  },
];
