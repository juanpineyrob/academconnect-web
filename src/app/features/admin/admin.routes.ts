import { Routes } from '@angular/router';

import { authGuard } from '@core/auth/auth.guard';
import { roleGuard } from '@core/auth/role.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
    loadComponent: () =>
      import('./admin-dashboard-page/admin-dashboard-page').then((m) => m.AdminDashboardPage),
    title: 'Panel de administración · AcademConnect',
  },
  {
    path: 'admin/importar-trabajo',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMINISTRADOR'] },
    loadComponent: () =>
      import('./importar-trabajo-page/importar-trabajo-page').then((m) => m.ImportarTrabajoPage),
    title: 'Importar trabajo · AcademConnect',
  },
];
