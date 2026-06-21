import { inject } from '@angular/core';
import { Routes } from '@angular/router';

import { AuthService } from '@core/auth/auth.service';
import { homeForRole } from '@core/auth/home-for-role';
import { ADMIN_ROUTES } from '@features/admin/admin.routes';
import { AUTH_ROUTES } from '@features/auth/auth.routes';
import { HUB_ROUTES } from '@features/hub/hub.routes';
import { INVITACIONES_ROUTES } from '@features/invitaciones/invitaciones.routes';
import { MIS_PUBLICACIONES_ROUTES } from '@features/mis-publicaciones/mis-publicaciones.routes';
import { EVALUACIONES_ROUTES } from '@features/evaluaciones/evaluaciones.routes';
import { RUBRICAS_ROUTES } from '@features/rubricas/rubricas.routes';
import { MIS_TRABAJOS_ROUTES } from '@features/mis-trabajos/mis-trabajos.routes';
import { PERFIL_ROUTES } from '@features/perfil/perfil.routes';
import { REPOSITORIO_ROUTES } from '@features/repositorio/repositorio.routes';

const roleAwareHome = () => {
  const user = inject(AuthService).currentUser();
  return user ? homeForRole(user.rol) : '/repositorio';
};

export const routes: Routes = [
  ...AUTH_ROUTES,
  {
    path: '',
    loadComponent: () => import('@app/layout/shell/shell').then((m) => m.Shell),
    children: [
      ...PERFIL_ROUTES,
      ...REPOSITORIO_ROUTES,
      ...ADMIN_ROUTES,
      ...MIS_TRABAJOS_ROUTES,
      ...EVALUACIONES_ROUTES,
      ...RUBRICAS_ROUTES,
      ...INVITACIONES_ROUTES,
      ...HUB_ROUTES,
      ...MIS_PUBLICACIONES_ROUTES,
      { path: '', pathMatch: 'full', redirectTo: roleAwareHome },
      { path: '**', redirectTo: roleAwareHome },
    ],
  },
];
